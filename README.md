# GOpencode

**Control your [opencode](https://opencode.ai) sessions from your phone.**

GOpencode is a native Android app and desktop gateway that lets you remote-control opencode from anywhere. Browse projects, chat with your agent, approve permissions, run slash commands, review diffs, and manage sessions — all from your phone, over WiFi or cellular.

---

## Why this exists

opencode's `serve` command has a long-standing limitation: **you can't set a working directory**. The server locks to whatever folder it was launched in (typically your home directory), and the web UI's project picker can only see subfolders of that directory. Want to work on `C:\Projects\MyApp` when the server started in `C:\Users\You`? You're stuck.

This has been one of the most-requested features in opencode ([#2177](https://github.com/anomalyco/opencode/issues/2177) — open since August 2025, 98+ thumbs-up). Related issues include:

- [#7597](https://github.com/anomalyco/opencode/issues/7597) — Windows "Open Project" only lists the user folder, absolute paths fail
- [#14445](https://github.com/anomalyco/opencode/issues/14445) — Server ignores the working directory, uses `/` as base
- [#7577](https://github.com/anomalyco/opencode/issues/7577) — Can't navigate the filesystem in the project picker
- [#10151](https://github.com/anomalyco/opencode/issues/10151) — Serve mode only accesses files in the launch directory

Despite community PRs and maintainer promises to "ship it soon," none of these are resolved as of June 2026.

**GOpencode solves this** by bypassing the web UI entirely. It talks directly to the opencode HTTP API, passing `?directory=<path>` on every call — a parameter the API supports but the web UI doesn't expose. GOpencode's own folder browser navigates the full filesystem and lets you open sessions in any directory, regardless of where `opencode serve` was started.

On top of that, it gives you a proper mobile experience for opencode: real-time streaming chat, tool-call visualization, permission approvals, push notifications, OTA updates, and more — all designed for a phone screen.

---

## How it works

```
 ┌──────────────┐         WebSocket          ┌─────────────────┐         HTTP + SSE        ┌─────────────────┐
 │  Your phone  │ ◄══════════════════════► │  Desktop gateway │ ◄══════════════════════► │  opencode server │
 │  (GOpencode   │    encrypted, auto-       │  (Go tray app)   │    localhost only        │  (opencode serve)│
 │   Android app)│  reconnect, multi-endpoint│                  │                          │                  │
 └──────────────┘                           └─────────────────┘                          └─────────────────┘
```

1. **opencode server** runs on your PC (`opencode serve` on port 4096).
2. **Desktop gateway** is a lightweight Go app that sits in your system tray. It proxies the phone's WebSocket connection to the local opencode HTTP API, handles QR pairing, detects your network IPs (LAN / public / Tailscale), and pushes connection updates when your public IP changes.
3. **Phone app** connects to the gateway via WebSocket (with multi-endpoint failover for ISP rotations), streams chat via SSE, and renders everything natively.

**OTA updates:** The gateway also serves the phone's web bundle at `/app/`. When you rebuild the app, the phone pulls the update automatically on next connect — no USB, no Play Store, no reinstall. Just rebuild and the phone gets it.

**Direct mode (no gateway):** If you prefer, the phone can also talk directly to the opencode server (requires `--cors` flag). The gateway is recommended for mobile use — it handles network blips, NAT traversal, and keepalive.

---

## Features

### Chat
- **Real-time streaming** — token-by-token replies via SSE
- **Tool-call visualization** — see file reads/writes, bash commands, edits as they happen
- **Permission prompts** — approve or deny tool permissions from your phone
- **Question prompts** — answer agent questions with selectable options
- **Message queue** — queue messages while the agent is working (shown as greyed-out bubbles)
- **Stop with hold-to-kill** — 3-second hold on the stop button to abort a turn (prevents accidental kills)
- **Code blocks** — syntax highlighting + copy button
- **Image attachments** — send photos from the camera or gallery
- **Image lightbox** — tap to expand images fullscreen
- **Markdown rendering** — full markdown with code blocks, lists, tables
- **Diff viewer** — tap patch cards to see color-coded diffs
- **Turn-complete marker** — shows token count and cost per turn
- **Scroll anchoring** — load earlier messages without losing your place

### Sessions
- **Active session indicator** — green blinking dot on sessions with live activity
- **Last message preview** — see the latest message under each session
- **Long-press bottom sheet** — rename, fork, compact, share, delete, run shell commands
- **Wedged session detection** — one-tap "Resume" for stuck sessions
- **Revert** — undo to any previous user message

### Projects & Folders
- **Full filesystem browser** — navigate anywhere, not just the launch directory
- **Open opencode in any folder** — even outside the home directory
- **Pull-to-refresh** on projects and sessions lists

### Model & Agent Control
- **Tiered model picker** — provider → model selector with search (all models from `/config/providers`)
- **Agent picker** — switch between build/plan/code agents
- **Reasoning effort** — Low/Med/High toggle for models that support it
- **Slash commands** — type `/` to see and run commands (`/init`, `/review`, etc.)

### Security & Privacy
- **AES-GCM encrypted password storage** via Web Crypto API
- **PIN lock** with 5-minute grace period (no re-unlock on quick app switches)
- **QR pairing** — scan once, never type credentials
- **No telemetry** — nothing leaves your network except opencode API calls

### Connectivity
- **Multi-endpoint failover** — LAN, public IPv4/IPv6, Tailscale, all tried in order
- **Auto-reconnect** with configurable modes (normal / aggressive / off)
- **ISP rotation resilience** — gateway pushes new endpoints when your public IP changes
- **Offline cache** — 24-hour TTL with invalidation; works briefly without connection
- **Stranded indicator** — tells you when you're stuck on a dead tunnel

### Native Polish
- **OTA updates** — pull new app versions over WiFi, no USB needed after first install
- **Local notifications** — get notified when a turn completes while the app is backgrounded
- **Completion sound** — configurable chime on turn completion
- **Haptic feedback** — on send, permissions, and interactions
- **Keep-awake** — screen stays on during active streaming
- **Health indicator** — connection status in settings and chat header
- **Custom modals** — no native `prompt()` / `confirm()` dialogs
- **Safe-area aware** — respects notches and gesture bars

---

## Installation

### Phone app (Android)

1. Download the latest APK from [Releases](../../releases).
2. Install it on your phone (enable "Install from unknown sources" if prompted).
3. Open Settings, enter your opencode server details (or scan the QR code from the desktop gateway).
4. Tap "Test connection" — should say "Connected".

### Desktop gateway (Windows)

1. Download `GOpencode-Setup-1.0.0.exe` from [Releases](../../releases).
2. Run the installer — it will walk you through network setup.
3. Launch GOpencode from the Start menu. It runs in your system tray.
4. Right-click the tray icon → "Show Pairing" to display the QR code.
5. Scan it from the phone app's Settings screen.

> The gateway auto-detects your LAN IP, public IP (via UPnP), and Tailscale address. It binds to `0.0.0.0:8765` when a public IP is detected, so it's reachable from cellular without a VPN.

---

## Development

### Prerequisites
- Node.js 20+
- Java JDK 17+ (for Android builds)
- Android SDK with platform-tools and platform android-34 (for APK builds)
- Go 1.26+ (for desktop gateway)

### Build the phone app

```bash
npm install
npm run build          # TypeScript + Vite production build
npx cap sync android   # sync web bundle into Android project
cd android && ./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

### Build the desktop gateway

```bash
cd desktop
go build -ldflags="-s -w -H windowsgui" -o gopencode.exe .
```

### Type-check

```bash
npm run typecheck      # TypeScript
cd desktop && go vet ./...   # Go
```

### OTA update flow (no USB after first install)

1. Make changes to `src/`
2. `npm run build` — outputs to `dist/`
3. Restart the desktop gateway
4. The phone auto-pulls the update on next connect and caches it
5. On next app launch, the bootstrapper in `index.html` loads the cached update before React

---

## Architecture

| Component | Tech | Description |
|---|---|---|
| Phone app | React 18 + TypeScript + Vite + Capacitor 6 | Native Android app, also works as PWA |
| Desktop gateway | Go + windigo (Win32) | System tray app, WebSocket proxy, QR pairing, OTA server |
| Transport | WebSocket (phone ↔ gateway) | JSON frames for API calls, SSE proxy for streaming |
| Direct mode | fetch + ReadableStream SSE | Fallback when no gateway; requires `--cors` on opencode |

### Key files

```
src/
  App.tsx              — main router, OTA auto-update, grace period lock
  views/
    Chat.tsx           — chat screen (message queue, stop-hold, streaming)
    Sessions.tsx       — session list (active dots, previews, long-press sheet)
    Projects.tsx       — project list (pull-to-refresh)
    Settings.tsx       — all settings, OTA update UI, debug log viewer
    BrowseFolder.tsx   — filesystem browser
  components/          — MessageView, ModelSheet, CommandMenu, Toast, Modal, etc.
  lib/
    transport.ts       — WebSocket transport, reconnect, SSE proxy
    api.ts             — API layer with caching + health probe
    settings.ts        — encrypted settings, PIN, grace period
    updater.ts         — OTA update pull/store/load
    markdown.ts        — markdown renderer with syntax highlighting
    log.ts             — structured logging with persistence

desktop/
  main.go              — entry point, systray
  gateway.go           — HTTP/WS gateway, app serving, manifest
  config.go            — config load/save
  windows.go           — native Win32 windows (pairing QR, settings)
  tray.go              — system tray UI
```

---

## Direct connection (without gateway)

If you don't want to run the desktop gateway, the phone can connect directly to the opencode server. Start opencode with CORS enabled:

```bash
opencode serve --cors http://localhost --cors https://localhost --cors capacitor://localhost
```

Then in the phone's Settings, enter the server URL directly (e.g. `http://your-pc:4096`). The gateway is recommended for mobile use — it handles network transitions, NAT traversal, and keepalive that direct connections don't.

---

## Tech stack

- **React 18** + **TypeScript** (strict) — UI
- **Vite 5** — build tooling
- **Capacitor 6** — Android native wrapper
- **Go 1.23** + **windigo** — desktop gateway (native Win32, no Electron)
- **Web Crypto API** — AES-GCM password encryption
- **WebSocket** + **SSE** — real-time transport

No tracking. No analytics. No third-party services. The only network calls are between your phone, your desktop gateway, and your opencode server.

---

## Contributing

Contributions welcome. Please open an issue first to discuss what you'd like to change.

---

## License

[MIT](LICENSE) — Copyright (c) 2026 Gary Gavigan

---

## Acknowledgements

- [opencode](https://opencode.ai) — the coding agent this app controls
- [giuliastro/opencode-remote-android](https://github.com/giuliastro/opencode-remote-android) — inspiration for the Capacitor + opencode approach
