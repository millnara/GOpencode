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

### Release signing (Android)

```bash
# Generate keystore (one-time)
keytool -genkey -v -keystore gopencode.keystore -alias gopencode \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass YOUR_STORE_PASS -keypass YOUR_KEY_PASS

# Create android/key.properties
echo "storeFile=../gopencode.keystore" > android/key.properties
echo "storePassword=YOUR_STORE_PASS" >> android/key.properties
echo "keyAlias=gopencode" >> android/key.properties
echo "keyPassword=YOUR_KEY_PASS" >> android/key.properties

# Build release APK
cd android && ./gradlew assembleRelease
```

Never commit `gopencode.keystore` or `key.properties`. Add both to `.gitignore`.

### Desktop installer

```bash
cd desktop
go build -ldflags="-s -w" -o gopencode.exe .
makensis installer.nsi
# Installer at desktop/dist/GOpencode-Setup-*.exe
```

## Direct connection (CORS)

To use the app without the gateway proxy (phone talks directly to opencode), start opencode with CORS enabled:

```bash
opencode --cors http://localhost
```

Or in your opencode config (`~/.config/opencode/config.json`):

```json
{
  "cors": ["http://localhost", "https://localhost", "capacitor://localhost"]
}
```

Then set the server URL in Settings to `http://your-pc:4096`. The gateway is preferred for mobile (handles network blips, WebRTC NAT traversal, keepalive).

## Tech

React + TypeScript + Vite + Capacitor. Talks directly to the opencode HTTP API. Streams via SSE (fetch-based for auth header support).
