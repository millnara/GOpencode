# GOpencode

Control [opencode](https://opencode.ai) coding sessions remotely from your **Android** phone
(and any browser) — a mobile client like the Claude Code app, with live token streaming,
tool-call visibility, permission prompts, and model/agent selection.

> Status: **scaffold** — see [`PLAN.md`](./PLAN.md) for the roadmap and the full opencode API
> contract, and [`AGENTS.md`](./AGENTS.md) for conventions. A validated reference prototype
> lives in `../opencode-remote`.

## Quick start (web dev)
```bash
npm install
# point dev proxy at your opencode server password (optional, dev only):
echo "VITE_OC_PASSWORD=your-opencode-password" > .env.local
npm run dev          # http://localhost:5173  (proxies /api -> opencode :4096)
```

## Android (APK)
```bash
npm run build
npx cap add android  # first time only
npx cap sync
npx cap open android # build/run from Android Studio
```

## How it connects
The app speaks opencode's HTTP API + `/event` SSE stream directly over Tailscale.
Configure the server URL + Basic-auth credentials on the in-app **Settings** screen
(persisted with @capacitor/preferences). See `PLAN.md §3–4`.

## Features
- Projects → Sessions → streaming Chat
- Live token streaming (SSE `message.part.delta`)
- Tool calls (status, input/output), reasoning, diffs/patches, markdown
- Permission prompts (Allow / Always / Deny)
- Model + agent pickers
- (planned) completion sound, local notifications, i18n, bottom-nav — see roadmap
