# GOpencode

Android + web client for [opencode](https://opencode.ai). Remote-control your opencode server from your phone.

## Setup

1. Install the APK (or run `npm run dev` for web)
2. Open Settings
3. Enter your opencode server URL (e.g. `http://your-pc:4096`)
4. Enter username (`opencode`) and password (your `OPENCODE_SERVER_PASSWORD`)
5. Tap "Test connection" — should say "Connected"
6. Save

## Features

- **Projects** — browse your opencode projects
- **Chat** — send messages, stream replies in real-time, see tool calls
- **Model picker** — tiered provider → model selector (all models from `/config/providers`)
- **Agent picker** — switch between build/plan/code agents
- **Reasoning effort** — tap the ⚡ pill to cycle Low/Med/High for supported models
- **Slash commands** — type `/` to see and run commands (`/init`, `/review`, etc.)
- **Folder browser** — open opencode in any directory
- **Diff viewer** — tap patch cards to see +/- diffs
- **Question prompts** — selectable options when agents ask questions
- **Permissions** — approve/deny tool permissions from your phone
- **Session management** — fork, compact, share, rename, delete sessions
- **Shell commands** — run quick shell commands via the session menu
- **Agent TODO panel** — see the agent's live task list with progress
- **Haptics** — feedback on send, permissions
- **i18n** — English, Italian, Chinese (Traditional)
- **Keep-awake** — screen stays on during active streaming
- **Offline banner** — reconnects automatically
- **Turn-complete marker** — shows tokens + cost per turn
- **Sound + notifications** — on completion (configurable)
- **Night-first dark UI** — optimized for mobile, safe-area aware

## Development

```bash
npm install
npm run dev          # web dev server at http://localhost:5173
npm run build        # production build
npx tsc --noEmit     # type-check
```

### Android

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
# APK at android/app/build/outputs/apk/debug/app-debug.apk
```

## Tech

React + TypeScript + Vite + Capacitor. Talks directly to the opencode HTTP API. Streams via SSE (fetch-based for auth header support).
