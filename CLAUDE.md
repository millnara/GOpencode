# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

GOpencode remote-controls an [opencode](https://opencode.ai) server from a phone. Two halves:

1. **Mobile/web app** (`src/`) — React 18 + TypeScript (strict) + Vite, packaged as an Android APK with Capacitor 6.
2. **Desktop gateway** (`desktop/`) — a Go Windows tray app that proxies the phone's WebSocket to the local opencode HTTP API, generates the pairing QR (room + password + endpoint list), detects LAN/public/Tailscale IPs, and pushes `relocate` messages when the public IP changes.

`PLAN.md` has the verified opencode API contract (REST + SSE event shapes). `AGENTS.md` has the original conventions. `TODO.md` tracks the feature roadmap.

## Commands

There are exactly TWO shippable artifacts, and one of them is what "done" means:
- **APK** (`android/app/build/outputs/apk/debug/app-debug.apk`) — for any `src/` change.
- **Installer** (`desktop/dist/GOpencode-Setup-*.exe`) — for any `desktop/` change.

`npm run dev`, `npm run build`, and the `dist/` web bundle are NOT deliverables — they
are intermediate steps the APK build consumes. Never stop at a green `npm run build`
and call phone-side work done; the phone runs the APK, not the bundle. Don't run the
dev server or hand over a "web build" as the result of a fix.

```bash
npm run typecheck    # tsc --noEmit — fast sanity check while iterating

# Phone app — REBUILD THE APK after ANY src/ change (slow, needs Android SDK at
# C:\AndroidSDK, but mandatory). The first two steps just feed the bundle into the
# APK; the artifact is app-debug.apk.
npm run build && npx cap sync android
cd android && ./gradlew assembleDebug   # APK at android/app/build/outputs/apk/debug/

# Desktop gateway (Go, Windows-only) — REBUILD THE INSTALLER after any desktop/ change.
cd desktop && go vet ./...   # quick sanity check
cd desktop && build.bat      # builds dist/gopencode.exe + NSIS installer (the artifact)
```

There are no automated tests. Verification = a clean type-check (`npm run typecheck`) plus the rebuilt artifact (APK or installer) for the half you touched, against the live opencode server (see Environment below).

## Architecture

### Transport layering (the core thing to understand)

`src/lib/api.ts` exposes `api.*` calls and `streamEvents()`. Every call routes through one of two paths, decided at call time:

- **Gateway mode** (preferred): `src/lib/transport.ts` holds a singleton WebSocket to the Go gateway. Requests are JSON frames `{id, method, path, body}` → responses `{id, status, body, headers}`. SSE subscriptions are `{id, type:"sse-start"}` frames; events come back as `{id, type:"sse-event", event}`. The gateway may also offer a WebRTC data channel (`webrtc-offer`/`answer`/`candidate` frames) that, when open, replaces the WS for data. Multi-endpoint failover: the pairing QR carries an ordered endpoint list (LAN, public IPv4/IPv6, Tailscale); `tryAllEndpoints()` walks it starting from the last successful one.
- **Direct mode** (fallback when no pairing is saved): plain `fetch` to the opencode server with Basic auth. SSE uses a fetch+ReadableStream reader (NOT `EventSource` — it can't send the Authorization header).

If a pairing exists but the WS is down, `api.ts` throws `"reconnect needed"` rather than falling through to direct mode with stale settings.

### Logging (first stop for debugging)

- App: `src/lib/log.ts` — categorized ring buffer (`transport`/`api`/`chat`/`ui`/`settings`), capped at 500 entries, persisted to `localStorage`. Used across all transport/api/views; viewable in-app. Prefer it over raw `console.*`.
- Gateway: `desktop/logger.go` — file log under `%APPDATA%\GOpencode`.

### Opencode API rules

- All project-scoped calls MUST pass `?directory=<worktree>`.
- Streaming render: keep `messageID -> {info, parts}` (`Chat.tsx` holds it in a `useRef<Map>` and re-renders via rAF-batched `forceUpdate`); `message.part.delta` events APPEND `delta` to `part[field]` — never rebuild the whole list per delta.
- Send messages via `prompt_async` (returns immediately; reply streams over SSE), not the blocking `POST /session/{id}/message`.

### State/persistence

- Connection settings + pairing + PIN hash live in `@capacitor/preferences` (localStorage on web) via `src/lib/settings.ts`. Never hardcode the opencode password.
- Routing is hash-based (`App.tsx parse()`), no router lib. Last route is persisted and restored on launch.
- Pairing/QR-scan lives in `Settings.tsx` (via `components/NativeQrScanner.tsx`), not a standalone screen.

### Desktop gateway (Go)

- `gateway.go` — WS hub + HTTP proxy + SSE pump; one phone connection at a time (`g.phone`). **gorilla/websocket allows only ONE concurrent writer** — all writes to the phone connection must go through a mutex-guarded writer, never raw `conn.WriteJSON` from multiple goroutines.
- `config.go` — config at `%APPDATA%\GOpencode\config.json`; auto-discovers the opencode password from env (`OPENCODE_SERVER_PASSWORD`) or the scheduled-task script.
- `ipmonitor.go` + `upnp.go` — public IP polling; on change, pushes `relocate` with fresh endpoints so the phone re-targets without re-pairing.
- `tray.go`/`windows.go` — systray + native Win32 windows (windigo) for pairing QR and settings.

## Conventions

- TypeScript strict; functional components + hooks only. API types in `src/lib/types.ts`; all network calls in `src/lib/api.ts`; screens in `src/views/`; small components in `src/components/`.
- Styling: single `src/styles.css` with CSS variables, mobile-first, safe-area-inset aware. Match the existing look; no CSS frameworks.
- No heavy dependencies without reason; prefer platform APIs + Capacitor plugins.
- The brand mark is the SVG in `src/components/Logo.tsx` — reuse it for any icon/asset work so app and gateway stay consistent (`scripts/gen-icons.ps1` regenerates platform icons from it).
- User-facing strings go through `src/lib/i18n.ts`; don't hardcode display text in views/components.

## Environment (Gary's machine)

- Live opencode server for testing: `http://gg-45-ferngrove:4096` (Tailscale name; IP `100.104.241.128`), Basic auth user `opencode`, password in `OPENCODE_SERVER_PASSWORD`.
- Direct (non-gateway) connections require opencode started with `--cors` (see README).
- The gateway listens on `:8765` by default; binds 0.0.0.0 when a public host is detected.

## Definition of done

Done = the rebuilt artifact for the half you touched. Not a green `npm run build`, not the dev server.

1. Type-check clean (`npm run typecheck`; `go vet ./...` in `desktop/` if Go changed).
2. **`src/` changed → rebuild the APK** (`npm run build && npx cap sync android && cd android && ./gradlew assembleDebug`, output `android/app/build/outputs/apk/debug/app-debug.apk`). The web bundle never reaches the phone on its own.
3. **`desktop/` changed → rebuild the installer** (`cd desktop && build.bat`, output `desktop/dist/GOpencode-Setup-*.exe`).
4. No regression to streaming/permissions flow.
