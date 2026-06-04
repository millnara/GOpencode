# GOpencode — Implementation Plan & Handoff

> A full **Android** app (and PWA) to control [opencode](https://opencode.ai) sessions
> remotely from a phone, like the Claude Code mobile app. Built to be continued by
> another AI agent (or by Gary driving opencode from his phone).

## 0. Status at handoff (2026-06-04)
- **Scaffold created + builds green.** `npm install`, `npx tsc --noEmit`, and `npm run build`
  all pass. The dev server runs and the **Projects screen renders live data** from the opencode
  API (verified headless). Stack chosen, structure laid out, core ported from a working vanilla
  prototype (`../opencode-remote`) that is **validated against the live opencode API**
  (streaming chat, tools, permissions all confirmed working there).
- **Next concrete step (P1 finish):** run `npm run dev` and verify the *chat* screen live —
  send a message, confirm streamed reply + a tool call render in the React port (logic is a
  direct port of the validated prototype but not yet exercised on-device).
- A separate, **running prototype** lives at `../opencode-remote` (a PWA + Node proxy on
  `http://gg-45-ferngrove:4500`). Use it as the reference implementation — its
  `public/app.js` contains proven logic for every API interaction.
- **This repo (GOpencode)** is the productized, native-Android version. See roadmap below.

## 1. Vision
Beat the existing community app (`giuliastro/opencode-remote-android`) by combining:
- **Their polish**: real signed APK (Capacitor), completion sound, local notifications, i18n, bottom-nav.
- **Our depth**: live token streaming (SSE), tool-call visualization, permission prompts,
  model + agent pickers, reasoning, diffs/patches, markdown.

## 2. Stack (decided)
- **React + TypeScript + Vite** — UI.
- **Capacitor** — wraps the Vite web build into an Android APK; provides native plugins
  (local notifications, status bar, preferences, haptics).
- No backend of our own required for the APK: it talks **directly to an opencode server's
  HTTP API** over Tailscale, configured on a Settings screen.
- Rationale: matches the proven giuliastro stack, AI-friendly, reuses web skills, ships an APK.

## 3. Architecture
```
Android APK (Capacitor WebView)  ──HTTP+SSE──>  opencode server (:4096) over Tailscale
  React app (src/)                               (user runs `opencode serve` on their PC)
```
- **Connection** (Settings screen, persisted via @capacitor/preferences):
  - `baseUrl` (e.g. `http://gg-45-ferngrove:4096` or a proxy `http://gg-45-ferngrove:4500/api`)
  - Basic Auth `username`/`password` (opencode uses `OPENCODE_SERVER_PASSWORD`; username is `opencode`).
- **CORS**: a native WebView origin (`https://localhost` / `capacitor://localhost`) calling the
  opencode server is cross-origin. Two options (pick in Phase 2):
  1. Start opencode with `--cors` to allow the Capacitor origin (simplest for direct mode).
  2. Point the app at the `../opencode-remote` Node proxy and add CORS headers there.
  - Note: SSE via `EventSource` cannot send an Authorization header. For the APK, use a
    **fetch-based SSE reader** (ReadableStream) so we can attach `Authorization`, OR pass
    auth via the proxy. The web prototype dodged this by using a same-origin auth-injecting
    proxy. **Decision for native: fetch-based SSE with Authorization header.** (see `src/lib/api.ts` TODO)

## 4. opencode API reference (verified against v1.2.27)
Base: the opencode server. All project-scoped calls take `?directory=<worktree path>` (or header
`x-opencode-directory`). Auth: HTTP Basic, username `opencode`, password = `OPENCODE_SERVER_PASSWORD`.

### REST
- `GET /project` → `[{id, worktree, vcs, time:{updated}}]` (filter out `id==="global"`).
- `GET /session?directory=` → `[Session]`; `POST /session?directory=` `{title?}` → `Session`.
- `GET /session/{id}/message?directory=` → `[{info: Message, parts: Part[]}]`.
- `POST /session/{id}/message?directory=` body:
  `{ model:{providerID,modelID}, agent, parts:[{type:"text", text}] }` → final assistant message.
- `POST /session/{id}/abort?directory=` → bool.
- `POST /session/{id}/permissions/{permID}?directory=` body `{response:"once"|"always"|"reject"}`.
- `GET /provider` → `{ all, default:{providerID:modelID}, connected }`. Use `connected` for the picker.
- `GET /agent` → `[{name, mode}]` (mode `primary` vs `subagent`; show primary: build, plan…).
- `GET /config`, `GET /path`.

### SSE  `GET /event?directory=`  (framing: lines of `data: {json}\n\n`)
Each payload: `{ type, properties }`. Handle:
- `message.updated` → `properties.info` (Message; role user/assistant; `time.created`).
- `message.part.updated` → `properties.part` (Part).
- `message.part.delta` → `{sessionID, messageID, partID, field, delta}` — **append** `delta` to `part[field]` (token streaming).
- `message.part.removed`, `message.removed`.
- `session.status` → `{sessionID, status:{type:"idle"|"busy"|"retry"}}` (drives the working spinner).
- `session.idle` → `{sessionID}` (done).
- `session.error` → `{sessionID, error:{name, data:{message}}}`.
- `permission.asked` → `{id, sessionID, permission, patterns, tool:{messageID,callID}}` (show Allow/Always/Deny).
- `permission.replied` → clear the prompt.
- `session.updated` → `properties.info` (carries the auto-generated `title`).
- `server.heartbeat`, `server.connected` → ignore.

### Part types (render)
`text` (markdown), `reasoning` (collapsible "Thinking"), `tool` (state machine:
`pending|running|completed|error`, fields `tool`, `state.input`, `state.output`, `state.title`),
`file` (attachment), `patch` (`{files[]}`), `step-start`/`step-finish`/`snapshot` (hide),
`agent`/`subtask` (delegation). User text parts render plain in a bubble.

## 5. Roadmap (phased, with acceptance criteria)
- [x] **P0 Scaffold** — Vite+React+TS+Capacitor structure, ported core. (this commit)
- [x] **P1 Core flow compiles & runs in browser** (`npm i && npm run dev`):
      Projects → Sessions → Chat with live streaming, tools, permissions, model/agent pickers,
      tiered model picker (117 models), folder browser, slash commands.
      Accept: send a message to a real server, see streamed reply + a tool call render.
- [ ] **P2 Connection/Settings + native SSE** — Settings screen (baseUrl/auth, persisted);
      switch SSE to fetch-reader with Authorization; resolve CORS (opencode `--cors`).
      Accept: works pointed directly at `http://gg-45-ferngrove:4096` with no proxy.
- [ ] **P3 Android packaging** — `npx cap add android`, build APK, install on device.
      Accept: signed/debug APK runs on Gary's Samsung, connects over Tailscale.
- [ ] **P4 Their best bits** — completion **sound** + **local notification** on `session.idle`
      when app backgrounded; **i18n** (EN base, IT/中文 like theirs); bottom-nav polish; haptics.
- [ ] **P5 Our depth+** — diff viewer for `session.diff`/patch, file attachments (camera/gallery
      via Capacitor), session search, multi-session tabs, slash-commands, cost/token display,
      pull-to-refresh, offline cache, biometric lock on the stored password.
- [ ] **P6 Release** — app icon set, splash, signing config, GitHub Actions APK CI (mirror giuliastro).

## 6. Build / run
```bash
npm install
npm run dev                 # web dev at :5173 — fastest iteration
# Android:
npm run build
npx cap add android         # first time
npx cap sync
npx cap open android        # opens Android Studio -> Run/build APK
```
Android SDK is already installed on this machine (`C:\AndroidSDK`).

## 7. Key references in this repo
- `AGENTS.md` — conventions + gotchas for any agent working here.
- `../opencode-remote/public/app.js` — **proven** reference logic (streaming, parts, permissions).
- `../opencode-remote/oc-api.json` — full opencode OpenAPI spec (143KB) for exact schemas.
