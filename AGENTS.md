# AGENTS.md — conventions for agents working on GOpencode

You are continuing a **React + TypeScript + Vite + Capacitor** Android app that remote-controls
an **opencode** server. Read `PLAN.md` first — it has the roadmap and the full opencode API contract.

## Run / verify
- `npm install` then `npm run dev` (web at http://localhost:5173) — primary dev loop.
- Type-check: `npm run build` (or `npx tsc --noEmit`). Keep the build green.
- Android: see PLAN.md §6. Don't run Android builds unless asked — they're slow and need Studio.
- A **live opencode server** to test against is at `http://gg-45-ferngrove:4096`
  (Basic auth: user `opencode`, password in `OPENCODE_SERVER_PASSWORD` on Gary's PC).
  A working reference app is at `http://gg-45-ferngrove:4500`.

## Code conventions
- TypeScript strict. Functional React components + hooks. No class components.
- Keep API types in `src/lib/types.ts`; all network calls in `src/lib/api.ts`.
- Small, focused components in `src/components`; screens in `src/views`.
- Match the existing dark, mobile-first styling in `src/styles.css` (CSS variables, safe-area insets).
- No heavy deps without reason; prefer the platform + Capacitor plugins.

## Architecture rules
- The app talks **directly to the opencode HTTP API**. Project-scoped calls MUST pass
  `?directory=<worktree>`. Stream via `GET /event` (SSE). See `PLAN.md §4` for exact shapes.
- **SSE auth gotcha**: browser `EventSource` can't set headers. In the native/direct mode use a
  `fetch()` + `ReadableStream` SSE reader that sets `Authorization`. (`src/lib/api.ts` has the stub.)
- Streaming render: maintain `messageID -> {info, parts}`; apply `message.part.delta` by
  appending `delta` to `part[field]`. Never full-re-render on each delta — patch the one part.
- Connection settings (baseUrl, username, password) persist via `@capacitor/preferences`
  (web fallback: localStorage). Never hardcode the password.

## Environment gotchas (this Windows machine)
- opencode runs as a Windows scheduled task; it serves a web UI + API on `:4096`.
- Git worktree detection in opencode needs `git` on PATH and `git config --global safe.directory '*'`
  (already set) — irrelevant to this app, but explains why projects resolve.
- The Tailscale MagicDNS name of the PC is `gg-45-ferngrove` (IP `100.104.241.128`).

## Definition of done for a feature
1. Compiles (`npm run build` clean). 2. Works in `npm run dev` against the live server.
3. Doesn't regress streaming/permissions. 4. Update the checkbox + status in `PLAN.md`.
