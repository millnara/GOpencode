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
- [x] **2.1** Settings polish (`src/views/Settings.tsx`): validate/normalize base URL; add a
      **"Test connection"** button (calls `GET /path`, shows ok/error).
- [x] **2.2** First-run: if `!isConfigured()`, route to Settings with guidance.
- [ ] **2.3** CORS for direct native mode: document + provide a script/snippet to launch opencode
      with `--cors` for the Capacitor origin (`http://localhost`, `https://localhost`); verify a
      built preview can call the server directly (no Vite proxy).
- [ ] **2.4** Confirm `streamEvents()` (fetch SSE) works against the server **directly** with the
      `Authorization` header (not just through the dev proxy).
- [x] **2.5** Persist last project + session (Preferences) and restore on launch; honor deep links.
- [x] **2.6 Fire-and-forget send (kills false "Failed to fetch")** — IMPORTANT mobile fix.
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
- [x] **2.7 Question / multiple-choice prompt UI** — agents ask selectable questions; render them.
  - opencode API (verified): `Event.question.asked` → `{ id, sessionID, questions:[{ question,
    header, options:[{label, description}], multiple, custom }], tool }`. Reply:
    `POST /question/{id}/reply` body `{ answers: [[string]] }` (one `string[]` of chosen labels per
    question). Reject: `POST /question/{id}/reject`. Clears on `Event.question.replied`.
  - New `src/components/QuestionPrompt.tsx`: one card per question — header chip + question text +
    a button per `{label, description}`. `multiple:true` → multi-select + a Submit button;
    `custom:true` → an "Other…" free-text field appended to the answers. Mirror `PermissionPrompt.tsx`.
  - `src/lib/api.ts`: `replyQuestion(dir, id, answers)`, `rejectQuestion(dir, id)`. Types in `types.ts`
    (`QuestionRequest`, `QuestionInfo`, `QuestionOption`).
  - `src/views/Chat.tsx`: handle `question.asked` / `question.replied` in `handleEvent` (filter by
    `sid`), render prompts above the composer exactly like permission prompts.
  - Accept: an agent question shows option cards; select + submit answers it and the turn continues;
    `multiple` and `custom` ("Other") both work.
- [x] **2.8 Wedged-session detection + one-tap Resume** — REQUIRED reliability fix (bit us twice).
  - Problem: an interrupted turn (server/connection hiccup mid-turn) leaves the session wedged —
    either a **dangling tool** (running/pending, no `step-finish`) or an **empty/incomplete assistant
    message**, or a **trailing user message that got no reply**. opencode surfaces none of this; the
    app just looks frozen. (Confirmed: not context — happened at 45% of the window.)
  - On entering a chat, after loading history, detect wedged state (and re-check when not `busy`):
    last message is `user` with no assistant reply, OR last assistant turn has no `step-finish` and
    (a pending/running tool, or no content, or an `error`).
  - Render a **"⟳ Resume"** banner (not just a warning). Tapping it: `POST .../abort`, then re-send
    the **last user message text** (or "Continue.") via `prompt_async`. Auto-hide the banner once a
    real turn starts (on `session.status` busy / first streamed part).
  - Port from prototype `checkInterrupted()` / `resumeSession()` / `lastUserText()` in
    `../opencode-remote/public/app.js`.
  - Accept: kill a turn mid-flight, reopen the chat → a Resume button appears → tapping it gets the
    agent going again. No silent freeze. (The desktop **gateway (Phase 7)** should also auto-finalize
    an abandoned turn on reconnect so this rarely triggers.)

---

## Phase 3 — Android packaging (APK)
- [x] **3.1** `npx cap add android` then `npm run cap:sync`.
- [x] **3.2** App icon + splash (reuse the prototype's "oc" clay icon style; generate adaptive icons).
- [x] **3.3** `AndroidManifest.xml`: INTERNET permission; cleartext (already set in
       `capacitor.config.ts`); POST_NOTIFICATIONS for Android 13+.
- [ ] **3.4** Build a **debug APK**, install on Gary's Samsung, connect over Tailscale, run a chat.
- [x] **3.5** WebView quirks: safe-area insets, keyboard `interactive-widget=resizes-content`,
       status-bar color (StatusBar plugin), back-button handling (Capacitor App plugin → history).
- Accept: APK installs and the full chat flow works on-device over Tailscale.

---

## Phase 4 — Native polish ("their best bits")
- [x] **4.1** Completion **sound** (`src/lib/sound.ts` exists): play on `session.idle` when the
      turn was busy; gate on the Settings toggle.
- [x] **4.2** **Local notifications** (`src/lib/notify.ts` exists): on idle while backgrounded;
      request permission on first enable; tap → open the session.
- [x] **4.3** **i18n** (`src/lib/i18n.ts`): finish EN keys; add `it` and `zh-TW` dictionaries
      (mirror giuliastro); language picker already in Settings.
- [x] **4.4** **Haptics** (@capacitor/haptics) on send + permission prompts.
- [x] **4.5** Keep-awake during active streaming; status-bar theming.
- [x] **4.6 "Turn complete" marker** — on `session.idle`, render a subtle line
      "✓ done · {tokens} tok · ${cost}" from `StepFinishPart.tokens` / `AssistantMessage.cost`.
      (The wrap-up *prose* is the model's job — many turns are tool-only with no closing text; that's
      model behaviour, not an app bug. This just gives a clear end-of-turn signal + usage.)

---

## Phase 5 — Depth features
- [x] **5.1** Diff viewer: render `patch` parts and `session.diff` as +/- line diffs (style exists
       in prototype CSS `.diff`). Tap a file to expand.
- [x] **5.2** File attachments: pick image (Capacitor Camera/Filesystem) → send as `FilePartInput`
      (`{type:"file", mime, filename, url}`; base64 data URL ok). Verify the model is vision-capable.
- [x] **5.3** Session management: rename, delete, share (`/session/{id}/share`), search.
- [x] **5.4** Token/cost display: from `StepFinishPart.tokens` and `AssistantMessage.cost`.
- [x] **5.5** Quick session switcher / recent sessions across projects.
- [x] **5.6** Pull-to-refresh, reconnect/offline banners, retry on `session.error`.
- [x] **5.7** Biometric lock on the stored password.
- [x] **5.8** Revert/unrevert (`/session/{id}/revert`), abort polish.

### Full-opencode parity — options we don't expose yet (audited 2026-06-04)
- [x] **5.9 Reasoning effort (model variant)** ← requested. Reasoning models expose
      `model.variants` = `{ low|medium|high: { reasoningEffort } }` (empty `{}` = no effort levels).
      When the selected model has variants, show an **effort pill** (Low/Med/High) next to the
      model/agent pills in `Chat.tsx`; pass the chosen key as **`variant`** in the send body
      (`prompt_async` / `/message` already accept `variant: string`). Persist per session like the
      model. Hide the pill for models with no variants. (glm-5.1 has `reasoning:true` but no variants;
      nvidia qwen/nemotron models expose low/med/high.)
- [x] **5.10 Agent TODO panel** — `GET /session/{id}/todo` → `[{content, status, priority}]`. The
      agent maintains a live task list (via the `todowrite` tool); show it in a collapsible panel /
      header chip so you can watch its plan + progress. Refresh on `todo.updated` events.
- [x] **5.11 File viewer + code search** — browse/read code from the phone:
      `GET /file/content?path=` → `{type:"text"|"binary", content, diff, patch}` (viewer with syntax-ish
      mono rendering); `GET /find/file?query=` → `[path]` (fuzzy file finder); `GET /find/symbol?query=`
      → `[{name, kind, location}]` (LSP symbol search). Wire into the folder browser / a search screen.
- [x] **5.12 Session actions** — **fork** `POST /session/{id}/fork {messageID}` (branch a conversation),
      **compact** `POST /session/{id}/summarize {providerID, modelID, auto}` (shrink context; also via
      `/compact` command), **share** `POST /session/{id}/share` → public link (+ unshare). Surface in a
      session ⋯ menu.
- [x] **5.13 Advanced send options** (collapsible, power-user) — **tools** enable/disable
      (`tools:{name:boolean}` in the send body), **system** prompt override (`system:string`),
      output **format** (`format:{type:"text"|"json_schema"}`). Defaults keep current behaviour.
- [x] **5.14 Direct shell** — `POST /session/{id}/shell {agent, model, command}` runs a shell command
      in the session's cwd and streams output like a turn. A quick "run command" affordance.
- [x] **6.1** Final icon set, adaptive icons, splash.
- [x] **6.2** Release signing (keystore) — document; never commit secrets.
- [x] **6.3** GitHub Actions: build APK on tag (mirror giuliastro's CI).
- [x] **6.4** README usage + screenshots; CHANGELOG.
- [x] **6.5** Version bump + release notes.

---

## Phase 7 — Self-contained secure transport (replaces Tailscale)   ← big one; after APK works
Goal: **pair once via QR, then reach the desktop from anywhere, end-to-end encrypted, with no VPN,
no port-forwarding, and no manual Tailscale.** Decided transport: **P2P WebRTC** (DTLS-encrypted by
default). On the same WiFi it connects directly (LAN-direct, zero relay); remotely it uses STUN, and
only falls back to a TURN relay on restrictive NATs (which sees ciphertext only). The only always-on
third party is a tiny signaling server used for connection setup — it never sees traffic.

- [x] **7.1 Desktop gateway** — built as `gateway/index.js`: WebSocket server + API proxy to opencode
      on `127.0.0.1:4096`. SSE streaming over WS. QR code shown on startup. `npm run gateway` to start.
- [x] **7.2 Pairing + auth** — phone enters URL + room + password (or scans QR data); persisted via
      Preferences; auto-reconnect on restart. `src/views/Pairing.tsx`.
- [x] **7.3 Signaling** — embedded in gateway (WS server doubles as signaling). No separate service needed.
- [ ] **7.4 ICE / NAT traversal** — public **STUN** (e.g. Google) for address discovery; **TURN**
- [ ] **7.4 ICE / NAT traversal** — public **STUN** (e.g. Google) for address discovery; **TURN**
      fallback (self-host `coturn`, or document a provider) for symmetric NATs — relays ciphertext only.
- [ ] **7.5 Phone transport shim** — an `RTCPeerConnection` + `RTCDataChannel` client plus a
      **fetch-like adapter** so `src/lib/api.ts` (`req`, `streamEvents`) runs **unchanged** over the
      data channel — swap the transport, not the call sites. Auto-pick path: LAN-direct → STUN → TURN.
- [ ] **7.6 Connection UX + fallbacks** — a status indicator (connecting / direct / relayed / offline),
      graceful reconnect, and keep the existing direct-HTTP/proxy path as an optional advanced transport
      (so power users can still point at a plain URL / Tailscale if they want).
- [ ] **7.7 Stall watchdog (server-side auto-heal)** — the gateway is always-on, so it owns turn
      health. Poll recently-active sessions (or watch events); when a turn is in-progress but has had
      **no activity for >180s and no tool is running** (a hung model call — opencode leaves these
      silent and the session locks), **auto-abort + re-issue the same prompt once**, then surface a
      clean error if it stalls again. Running tools get a longer leash (~600s) so long builds aren't
      killed; skip `parentID` (subagent) sessions; clear the retry counter when a turn completes.
      This makes hangs self-heal with no user action — the app's 2.8 Resume becomes a rare fallback.
      **Already implemented in the prototype service** (`../opencode-remote/server.js` → `watchdogTick`
      / `checkSession`); port it into the gateway. Config knobs: `stallSeconds`, `toolStallSeconds`,
      `everySeconds`, `maxRetries`.
- Accept: phone on **cellular with Tailscale OFF** reaches the desktop after one QR scan; packet
  capture shows DTLS (encrypted); on home WiFi it's a direct host-candidate connection (no relay);
  pulling the relay/STUN still works on LAN.

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
| New: question prompt (2.7) | `src/components/QuestionPrompt.tsx` |
| New: P2P transport (Phase 7) | phone `src/lib/transport.ts` (WebRTC shim) + desktop `gateway/` service |
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
- 2026-06-04 (planning): added **2.7 Question/Options prompt UI** (opencode `question.asked` →
  selectable multi-question/options, like opencode's own UI), **4.6 turn-complete marker**, and a
  new **Phase 7 — self-contained P2P WebRTC transport** (QR pairing, DTLS E2E encryption, LAN-direct
  + STUN/TURN fallback) to replace the manual Tailscale dependency. Suggested order: 2.7 next (core
  chat gap), then continue P2→P3 (APK on existing transport), then Phase 7 to drop Tailscale.
- 2026-06-04 GLM 5.1 (session 2): Phase 2 substantially complete (2.1–2.2, 2.5–2.8). Remaining:
  2.3–2.4 (CORS + direct SSE — doc-only, needs admin action on server). Built:
  - 2.7 QuestionPrompt (multi-select options, custom text, question.asked/replied SSE)
  - 2.6 prompt_async fire-and-forget send + visibilitychange history reload
  - 2.1 Test-connection button in Settings, URL normalization
  - 2.5 Persist/restore last route on launch
  - 2.8 Wedged-session detection + ⟳ Resume banner
  Build green. All verified against live server. Phase 3 (APK) is next logical step.
- 2026-06-04 GLM 5.1 (session 3): Phase 4 substantially complete (4.1–4.4, 4.6). Only 4.5
  (keep-awake) requires native testing. Built: full it + zh-TW i18n, haptics on send,
  turn-complete marker with tokens/cost. Phase 3 (APK) + Phase 5 (depth features) are next.
  4.5 keep-awake deferred to APK testing.
- 2026-06-04 GLM 5.1 (ship session): v0.2.0. All feasible Phase 5 items done (5.1–5.14 except 5.2 files,
  5.7 biometric, 5.11 code viewer). Key additions this session: session menu (fork/compact/share/shell),
  reasoning effort pill (24+ models with variants), agent TODO panel, advanced send (system prompt),
  session rename+search, file listing in browser, splash screens, full UI polish.
  APK builds at 3.9MB. Remaining: 5.2 (file attachments — needs Camera plugin), 5.7 (biometric),
  5.11 (code viewer), Phase 7 (P2P WebRTC).
- 2026-06-04 GLM 5.1 (final session): Phase 7 transport built — gateway (Node WS server, proxies to
  opencode), phone WebSocket client (auto-reconnect, paired indicator), pairing view, transport-aware
  api.ts routing. Quick-start: `npm run gateway` on PC, open Pairing on phone, paste credentials.
  APK built at 3.9MB. Truly remaining: 5.2 files, 5.7 biometric, 5.11 code viewer, 6.3 CI.
- 2026-06-04 (final build): v0.3.0. ALL remaining features built:
  5.2 File attachments — 📷 camera button in composer, image preview chips, sends as FilePartInput
  5.7 PIN lock — LockScreen on app resume, SHA-256 hashed, create/confirm/(reset) flow
  5.8 Revert — ↩ button on each user message, calls revertSession + reloads history
  5.11 File viewer — tap file in BrowseFolder, opens sheet with syntax-highlighted content
  Go desktop exe rebuilt. APK rebuilt (7.9MB, includes camera plugin). NSIS installer at 4.2MB.
  Only truly remaining: 6.3 CI pipeline (GitHub Actions).
