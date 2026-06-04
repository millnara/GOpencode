# GOpencode — Build TODO (handoff for GLM 5.1)

This is the execution checklist to finish GOpencode. Read `PLAN.md` (roadmap + **full opencode
API contract**) and `AGENTS.md` (conventions) first. Work top-down; keep the build green; tick
boxes and commit per task/phase.

---

## Working agreement (read first)
- **Reference implementation:** the validated prototype `../opencode-remote/public/app.js`
  already implements **everything** below (chat streaming, tool/permission rendering, tiered
  model picker, folder browser, slash commands). When unsure, port its logic. It is proven
  against the live server.
- **Live server to test against:** `http://gg-45-ferngrove:4096` (Tailscale). Basic auth user
  `opencode`, password = value in `../opencode-remote/config.json` (do not commit it). For web
  dev, `npm run dev` proxies `/api` → that server (set `VITE_OC_PASSWORD` in `.env.local`).
- **Definition of done (every task):** (1) `npm run build` clean, (2) works in `npm run dev`
  against the live server, (3) no regression to streaming/permissions, (4) tick the box + note
  status in this file, (5) commit with a clear message.
- **Run loop:** `npm run dev` (web, fastest). Type-check: `npx tsc --noEmit`.

## ⚠️ Gotchas (learned the hard way — don't repeat them)
1. **Model lists:** use `GET /config/providers` → `{providers:[{id,name,models:{id:{name}}}]}`.
   The `GET /provider` response's `all[id].models` is **empty**; only use `/provider.connected`
   to know *which* providers are authed. (Authed here: nvidia=93, opencode-go=14,
   zai-coding-plan=5, opencode=5 models.)
2. **SSE auth:** `EventSource` can't send headers. Use the `fetch()`+`ReadableStream` reader in
   `src/lib/api.ts` `streamEvents()` (already written) so `Authorization` is attached.
3. **CORS (native):** a Capacitor WebView origin calling opencode is cross-origin. Resolve in
   Phase 2 (run opencode with `--cors <origin>` or proxy). Web dev avoids it via the Vite proxy.
4. **`directory` param** is required on every project-scoped call (`?directory=<worktree>`).
5. **Slash commands:** `GET /command` lists them; `POST /session/{id}/command` with
   `{command, arguments}` runs one. Results stream via the normal `/event` SSE.
6. **Folder browsing:** `GET /file?path=.&directory=<absPath>` lists entries
   (`{name, path, absolute, type:"directory"|"file", ignored}`); `GET /path` gives `home`.
7. **Markdown code blocks** need a non-regex-colliding sentinel (prototype uses `@@CB{n}@@`),
   never bare digits — otherwise numbers in text get mangled.

---

## Phase 1 — Core parity & live verification  (scaffold ✅ done)
Goal: GOpencode does everything the prototype does, verified live.

- [x] **1.1 Verify chat end-to-end live**
  - [x] `npm run dev`, open a project → session, send a message.
  - [x] Confirm: user bubble, streamed assistant text (token deltas), a tool call renders, busy
        spinner, idle clears. Fix any React/streaming bugs in `src/views/Chat.tsx`.
  - Accept: a real reply streams in and a tool call card appears.

- [x] **1.2 Tiered model picker (provider → model)**  — fixes "only 4 bad models"
  - [x] Add `api.configProviders()` → `GET /config/providers` in `src/lib/api.ts`; type in `types.ts`.
  - [x] New `src/components/ModelSheet.tsx`: level 1 = provider list (name + model count); tap →
        level 2 = that provider's models with a `‹` back button + a search box (lists can be 90+).
  - [x] Selecting sets `{providerID, modelID}`; default = last-used (from history) else first
        connected provider's default. Wire into `Chat.tsx` (replace the inline sheet).
  - Port from prototype `openModelSheet()` / `providerList()`.
  - Accept: all 117 models reachable across the 4 providers; selection persists for the session.

- [x] **1.3 Folder browser (open opencode in any folder)**
  - [x] Add `api.listDir(dir)` (`GET /file?path=.&directory=`) and `api.path()` (`GET /path`).
  - [x] New `src/views/BrowseFolder.tsx`: shows current path, `⬆` up (compute parent, handle
        `C:\` drive root), folder rows (tap to descend), and an **"Open opencode here"** action
        → navigate to Sessions for that dir (resume existing or `＋ New`).
  - [x] Routes in `src/App.tsx`: `#/browse` (start at home) and `#/browse/<b64dir>`.
  - [x] Entry point: a "📁 Browse folders…" item atop `src/views/Projects.tsx`.
  - Port from prototype `viewBrowse()` / `folderRow()` / `parentDir()`.
  - Accept: can browse to any folder (project or not) and start/resume a session there.

- [x] **1.4 Slash-command passthrough**
  - [x] Add `api.commands()` (`GET /command`) and `api.runCommand(dir,id,{command,arguments})`
        (`POST /session/{id}/command`). Types in `types.ts`.
  - [x] New `src/components/CommandMenu.tsx`: when composer text matches `^/(\S*)$`, show filtered
        commands (name + description); tap fills `/<name> `.
  - [x] In `Chat.tsx` send(): if text starts with `/` and first token matches a known command,
        call `runCommand`; else send a normal message.
  - Port from prototype `updateCmdMenu()` / `onSend()` command branch.
  - Accept: typing `/` shows the menu; `/init` (etc.) executes and streams output.

- [x] **1.5 Keep build green** — `npx tsc --noEmit` and `npm run build` pass after 1.1–1.4.

---

## Phase 2 — Connection, Settings, native networking
- [ ] **2.1** Settings polish (`src/views/Settings.tsx`): validate/normalize base URL; add a
      **"Test connection"** button (calls `GET /path`, shows ok/error).
- [ ] **2.2** First-run: if `!isConfigured()`, route to Settings with guidance.
- [ ] **2.3** CORS for direct native mode: document + provide a script/snippet to launch opencode
      with `--cors` for the Capacitor origin (`http://localhost`, `https://localhost`); verify a
      built preview can call the server directly (no Vite proxy).
- [ ] **2.4** Confirm `streamEvents()` (fetch SSE) works against the server **directly** with the
      `Authorization` header (not just through the dev proxy).
- [ ] **2.5** Persist last project + session (Preferences) and restore on launch; honor deep links.
- [ ] **2.6 Fire-and-forget send (kills false "Failed to fetch")** — IMPORTANT mobile fix.
  - Problem: a blocking `POST /session/{id}/message` holds one HTTP request open for the *entire*
    turn (minutes). When the phone sleeps/switches networks, that request dies and the browser
    throws `Failed to fetch` → a scary false "Send failed", even though the server got the message
    and the turn ran fine.
  - Fix: send via **`POST /session/{id}/prompt_async`** (same body as `/message`; returns ~12ms,
    empty body). The turn runs server-side and streams back over the existing `/event` SSE.
    Add `api.promptAsync(dir,id,model,agent,text)` in `src/lib/api.ts`; use it in `Chat.tsx send()`
    instead of `api.send`. Don't `setBusy(false)` on the await resolving — let `session.idle` do it.
  - Treat send errors matching `/Failed to fetch|NetworkError|aborted/` as a soft warning
    ("connection blip — reply will appear on reconnect"), not a hard failure.
  - On `visibilitychange` → visible (and on SSE reconnect), **reload message history** to catch up
    on anything missed while backgrounded, and clear `busy` if the last assistant turn has a
    `step-finish`. Port from prototype `onSendError()` / `refreshChat()` in `../opencode-remote/public/app.js`.
  - Accept: lock the phone mid-turn, unlock → the reply is there; no false "Send failed".

---

## Phase 3 — Android packaging (APK)
- [ ] **3.1** `npx cap add android` then `npm run cap:sync`.
- [ ] **3.2** App icon + splash (reuse the prototype's "oc" clay icon style; generate adaptive icons).
- [ ] **3.3** `AndroidManifest.xml`: INTERNET permission; cleartext (already set in
      `capacitor.config.ts`); POST_NOTIFICATIONS for Android 13+.
- [ ] **3.4** Build a **debug APK**, install on Gary's Samsung, connect over Tailscale, run a chat.
- [ ] **3.5** WebView quirks: safe-area insets, keyboard `interactive-widget=resizes-content`,
      status-bar color (StatusBar plugin), back-button handling (Capacitor App plugin → history).
- Accept: APK installs and the full chat flow works on-device over Tailscale.

---

## Phase 4 — Native polish ("their best bits")
- [ ] **4.1** Completion **sound** (`src/lib/sound.ts` exists): play on `session.idle` when the
      turn was busy; gate on the Settings toggle.
- [ ] **4.2** **Local notifications** (`src/lib/notify.ts` exists): on idle while backgrounded;
      request permission on first enable; tap → open the session.
- [ ] **4.3** **i18n** (`src/lib/i18n.ts`): finish EN keys; add `it` and `zh-TW` dictionaries
      (mirror giuliastro); language picker already in Settings.
- [ ] **4.4** **Haptics** (@capacitor/haptics) on send + permission prompts.
- [ ] **4.5** Keep-awake during active streaming; status-bar theming.

---

## Phase 5 — Depth features
- [ ] **5.1** Diff viewer: render `patch` parts and `session.diff` as +/- line diffs (style exists
      in prototype CSS `.diff`). Tap a file to expand.
- [ ] **5.2** File attachments: pick image (Capacitor Camera/Filesystem) → send as `FilePartInput`
      (`{type:"file", mime, filename, url}`; base64 data URL ok). Verify the model is vision-capable.
- [ ] **5.3** Session management: rename, delete, share (`/session/{id}/share`), search.
- [ ] **5.4** Token/cost display: from `StepFinishPart.tokens` and `AssistantMessage.cost`.
- [ ] **5.5** Quick session switcher / recent sessions across projects.
- [ ] **5.6** Pull-to-refresh, reconnect/offline banners, retry on `session.error`.
- [ ] **5.7** Biometric lock on the stored password.
- [ ] **5.8** Revert/unrevert (`/session/{id}/revert`), abort polish.

---

## Phase 6 — Release
- [ ] **6.1** Final icon set, adaptive icons, splash.
- [ ] **6.2** Release signing (keystore) — document; never commit secrets.
- [ ] **6.3** GitHub Actions: build APK on tag (mirror giuliastro's CI).
- [ ] **6.4** README usage + screenshots; CHANGELOG.
- [ ] **6.5** Version bump + release notes.

---

## File map (where things go)
| Concern | File |
|---|---|
| API calls + SSE | `src/lib/api.ts` (add: configProviders, commands, runCommand, listDir, path) |
| Types | `src/lib/types.ts` |
| Chat screen | `src/views/Chat.tsx` |
| Projects / Sessions / Settings | `src/views/Projects.tsx`, `Sessions.tsx`, `Settings.tsx` |
| New: folder browser | `src/views/BrowseFolder.tsx` |
| New: model picker | `src/components/ModelSheet.tsx` |
| New: command menu | `src/components/CommandMenu.tsx` |
| Routing | `src/App.tsx` |
| Native helpers | `src/lib/sound.ts`, `notify.ts`, `i18n.ts`, `settings.ts` |
| Styles | `src/styles.css` (prototype `style.css` has matching classes to copy) |

## Status log (update as you go)
- 2026-06-04: Scaffold builds/type-checks; Projects renders live. Phases 1–6 pending.
- 2026-06-04 GLM 5.1: Phase 1 complete. All tasks 1.1–1.5 done. Built: tiered model picker
  (ModelSheet using /config/providers — 117 models across 4 providers), folder browser
  (BrowseFolder with parent-dir navigation), slash-command passthrough (CommandMenu + runCommand).
  Fixed markdown.ts sentinel (was using null bytes, now uses @@CB{n}@@ like prototype). Fixed
  vite.config.ts to use loadEnv for .env.local password. Build green (tsc + vite build). All new
  API endpoints verified live against server (config/providers, command, file, path). Phases 2–6
  pending.
