<p align="center">
  <img src="frontend/public/brand/logo.svg" alt="Rumo" width="320">
</p>

<p align="center">
  <b>Free, self-hosted video meetings. No accounts, no per-seat pricing, no third-party platform.</b>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-2E5BFF.svg" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/self--hosted-yes-2E5BFF.svg" alt="Self-hosted">
  <img src="https://img.shields.io/badge/docker-ready-2496ED?logo=docker&logoColor=white" alt="Docker ready">
  <img src="https://img.shields.io/badge/node-%3E%3D22-2E5BFF.svg" alt="Node >= 22">
</p>

Spin it up on your own server and share the link. Built with WebRTC for peer-to-peer audio/video, Socket.IO for signaling and real-time chat/host controls, React on the frontend, and Postgres for room state.

**Live docs site:** https://brahmjotsingh0.github.io/rumo/

<p align="center">
  <img src="docs/assets/screenshots/landing.png" alt="Rumo landing page" width="100%">
</p>
<p align="center">
  <img src="docs/assets/screenshots/meeting.png" alt="Rumo meeting grid view" width="49%">
  <img src="docs/assets/screenshots/admin.png" alt="Rumo admin settings panel" width="49%">
</p>

## Contents

- [Features](#features)
- [How it compares](#how-it-compares)
- [Quick start (Docker)](#quick-start-docker)
- [Manual setup](#manual-setup-without-docker)
- [Configuration](#configuration)
- [How hosting works](#how-hosting-works)
- [Project structure](#project-structure)
- [Documentation](#documentation)
- [Security notes](#security-notes)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Video/audio calls**: adaptive quality, screen sharing, background blur and virtual backgrounds (upload your own or pick from an admin-managed gallery), low-bandwidth mode for poor connections
- **Guest access**: enter a name and join, no account required. Whoever creates a room is its host, with a signed token so reclaiming host status after a reconnect can't just be asserted by any client
- **Host controls**: mute/remove participants, co-hosts with configurable permissions, lock the meeting, waiting room and optional PIN for private rooms, participant cap, host transfer
- **Schedule for later**: optional date/time on a room, with one-click "Add to Google Calendar / Outlook" links and an `.ics` download, generated entirely client-side
- **Raise hand, emoji reactions, and live captions** (browser speech-to-text, relayed to the room - no audio ever leaves the browser for it)
- **Local recording**: record your own camera and mic straight to your device - no recording server involved (see [How it compares](#how-it-compares) for how this differs from server-side recording)
- **Real-time chat** with rate limiting
- **Embeddable**: drop a meeting into your own site as an iframe, with a small JS API (`embed.js`) to control it and listen for events - see [`docs/EMBEDDING.md`](docs/EMBEDDING.md)
- **Webhooks**: optional HMAC-signed POST requests for room/participant lifecycle events, for your own integrations
- **Connection quality monitoring** and automatic reconnection
- **Configurable branding**: change the name, logo, tagline, and accent color from an admin panel in the browser, or a JSON file - no rebuild required
- **Feature flags**: turn off chat, screen sharing, co-hosts, or any other optional control for the whole instance from the admin panel
- **Built-in i18n**: every UI string lives in one `lang.json`, add a language by adding a column
- **One-command HTTPS**: point a domain at your server and the installer sets up a reverse proxy with automatic, auto-renewing certificates

## How it compares

Rumo is built for the opposite end of the spectrum from Jitsi Meet: instead of a platform that scales to huge public calls, it's the smallest, most transparent thing you can fully own for a small team, class, or family. One script, one small codebase, minimal server, and the server never touches your audio or video.

| | Rumo | Jitsi Meet |
|---|---|---|
| License | MIT | Apache 2.0 |
| Setup | One `docker-compose.yml`, up and running in minutes | Several services to stand up and keep in sync: web, videobridge, jicofo, prosody |
| Server footprint | Light enough for a $5 VPS for a handful of concurrent calls | Videobridge wants meaningfully more CPU/RAM per concurrent call |
| Media routing | Peer-to-peer WebRTC mesh; the server never sees your audio or video | SFU (Jitsi Videobridge) relays media through the server |
| Best fit | Small, private meetings where simplicity, low footprint, and full control matter most | Larger meetings and webinars where scale matters more than footprint |
| Branding & white-labeling | Full control from an admin panel, no rebuild: name, logo, color, and which features even show up | Configurable via `interface_config.js`, needs a rebuild to apply |
| Codebase | Small enough to read end to end in an afternoon | Large, mature, many moving parts |
| Translations | 20 languages in one `lang.json` file, trivial to extend | Larger, more established translation project |
| Recording | Local only: record your own camera+mic to your device, no server involved | Server-side, via Jibri, for the whole call |
| Mobile | Browser only for now, works fine on mobile browsers | Native iOS and Android apps |

Rumo isn't trying to out-scale Jitsi, it's trying to be the thing you can stand up in five minutes, fully understand, and fully brand as your own. If you need to reliably host large public webinars, Jitsi Meet or [BigBlueButton](https://bigbluebutton.org/) are more proven at that scale.

## Quick start (Docker)

Requires [Docker](https://docs.docker.com/get-docker/) and Docker Compose.

```bash
git clone https://github.com/BrahmjotSingh0/rumo.git
cd rumo
./install.sh      # Windows: .\install.ps1
```

The script checks for Docker (and offers to install it on Ubuntu/Debian), generates `.env` with random secrets for anything you haven't already set, and runs `docker compose up -d --build`. Running it again later is safe: it won't overwrite secrets or settings you already have.

It asks for a domain name. Leave it blank to run on plain `http://localhost`, or give it one (with its DNS already pointing at this server) to have it start [Caddy](https://caddyserver.com/) as a reverse proxy and get you a free, auto-renewing HTTPS certificate:

```bash
./install.sh --domain meet.example.com --yes
```

Either way, once it's up:

- App: `http://localhost:5173` (or `https://your-domain`)
- Admin panel: `.../admin`, unlocked with the `ADMIN_SETUP_TOKEN` the script prints (also saved in `.env`) - use it to set the name, logo, tagline, and accent color without touching a file
- Backend health check: `http://localhost:5000/health`

The Postgres schema is applied automatically on first run.

> Camera/microphone access requires HTTPS in the browser (Chrome and Firefox both block `getUserMedia` on plain HTTP), except on `localhost`. The `--domain` flag above handles this for you; without it, you'll need your own reverse proxy with a TLS certificate in front of `frontend`/`backend`, with `CORS_ORIGIN`, `VITE_API_URL`, and `VITE_SOCKET_URL` pointed at the public HTTPS URLs.

## Manual setup (without Docker)

Requires Node.js 22+ and PostgreSQL. See [`backend/README.md`](backend/README.md) and [`frontend/README.md`](frontend/README.md) for full details.

```bash
# 1. Create the database and load the schema
createdb rumo
psql rumo < backend/database/schema.sql

# 2. Backend
cd backend
cp .env.example .env   # fill in DB credentials
npm install
npm run dev             # http://localhost:5000

# 3. Frontend (new terminal)
cd frontend
cp .env.example .env
npm install
npm run dev             # http://localhost:5173
```

## Configuration

### Branding

The easiest way: open `/admin` in your browser, enter the `ADMIN_SETUP_TOKEN` from your `.env`, and set the app name, tagline, description, logo, and accent color from a form. Changes apply immediately, no rebuild or restart.

Those settings live in Postgres. If you'd rather manage branding as a file (for scripted deployments, or if you never set `ADMIN_SETUP_TOKEN`), edit [`frontend/public/branding.json`](frontend/public/branding.json) instead:

```json
{
  "appName": "Rumo",
  "tagline": "Connect, collaborate, create.",
  "description": "Free, self-hosted video meetings.",
  "logoIcon": "/brand/icon.svg",
  "logoFull": "/brand/logo.svg",
  "primaryColor": "#2E5BFF"
}
```

This file is fetched at runtime too (edit it or bind-mount your own version over it; no rebuild needed), and acts as the fallback whenever nothing has been saved through the admin panel yet. `primaryColor` drives a full 50-900 Tailwind shade scale computed on load (see `frontend/src/utils/theme.js`), so buttons, badges, and focus rings across the landing and pre-join screens follow it automatically. Logo files live in `frontend/public/brand/`; replace them with your own SVG/PNG and update the paths above, or just upload one from `/admin`. `frontend/src/config/branding.js` holds the built-in defaults used if neither the admin panel nor `branding.json` set something.

> Scope note: the accent-color retheming above covers the landing and pre-join screens. The in-call UI (`MeetingPro.jsx`) is a large, separate surface that still uses fixed colors, aside from its own existing light/dark toggle in the in-call settings panel. Full accent-color coverage there is a good follow-up contribution.

### Languages

UI strings live in [`frontend/src/i18n/lang.json`](frontend/src/i18n/lang.json): one file, each string keyed by language code.

```json
"common.joinMeeting": { "en": "Join Meeting", "es": "Unirse a la reunión" }
```

To add a language, add its code and label to `languages`, then add that code to every entry in `strings`. The language switcher (top-right on the home screen) picks it up automatically. Currently ships with English and Spanish covering the landing and pre-join screens; in-call UI strings aren't translated yet, so contributions are welcome.

### TURN server (optional)

STUN (included, free, via Google's public servers) is enough for most networks. If some participants are behind restrictive NATs/firewalls and can't connect, run your own TURN server (e.g. [coturn](https://github.com/coturn/coturn)) and set `TURN_SERVERS` (backend) plus `VITE_TURN_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL` (frontend).

### Room PINs, scheduling, and webhooks

Anyone creating a room from the home page can, under "Advanced options," set a PIN, a max participant count, and/or schedule it for later (which just shows calendar links instead of joining immediately - the room is real and joinable right away either way). The same options are available from `POST /api/rooms` if you're creating rooms from your own code - see [`docs/API.md`](docs/API.md).

To get notified about room/participant activity elsewhere (logging, chat-ops, your own dashboard), set `WEBHOOK_URL` in the backend's `.env` (and `WEBHOOK_SECRET` to have requests signed). Off by default - nothing is sent unless you set it.

## How hosting works

There are no user accounts. Whoever creates a room, or is first to join it, becomes its host for that session, and can transfer host, mute/remove participants, and lock the room. Anyone with the room link can join (optionally behind a PIN, see [Configuration](#configuration)) - that part is the same trust model as most link-based meeting tools.

Reclaiming host status after a reconnect is verified, not just asserted: the server hands a signed, short-lived token to whichever client is host, and requires it back before treating a reconnecting client as host again. It's still not an account system (there's no password or identity behind it, just proof "the server told this browser it was host a moment ago"), but it does mean another participant can't grant themselves host by editing their own browser storage.

## Project structure

```
rumo/
├── backend/             Express + Socket.IO API
│   ├── database/schema.sql
│   ├── src/
│   │   ├── config/       env + db connection
│   │   ├── models/       Room.js, BrandingSettings.js
│   │   ├── routes/       REST endpoints (/api/rooms, /api/settings, /health)
│   │   ├── services/     socketService.js: WebRTC signaling & room state
│   │   └── utils/
│   ├── uploads/          logos uploaded through /admin (gitignored)
│   ├── server.js
│   ├── Dockerfile
│   └── README.md
├── frontend/             React + Vite
│   ├── public/
│   │   ├── brand/        icon.svg, logo.svg
│   │   └── branding.json  fallback name/logo/tagline/color (see /admin)
│   ├── src/
│   │   ├── components/   Home, PreJoin, MeetingPro, Admin, meeting/*
│   │   ├── config/        branding.js (defaults + runtime loader)
│   │   ├── i18n/           lang.json + provider
│   │   ├── utils/theme.js  color-scale generator for primaryColor
│   │   └── hooks/, stores/, utils/
│   ├── Dockerfile
│   └── README.md
├── docs/                 API reference + GitHub Pages site
├── docker-compose.yml
├── Caddyfile             reverse proxy config used by the "proxy" profile
├── install.sh / install.ps1   one-command setup
├── CONTRIBUTING.md
├── SECURITY.md
└── .env.example
```

## Documentation

- [`docs/API.md`](docs/API.md): full REST + Socket.IO event reference
- [`docs/EMBEDDING.md`](docs/EMBEDDING.md): embed a meeting in your own site with `embed.js`
- [`backend/README.md`](backend/README.md): backend setup, env vars, scripts
- [`frontend/README.md`](frontend/README.md): frontend setup, branding, i18n, scripts
- [`CONTRIBUTING.md`](CONTRIBUTING.md): how to contribute, coding/docs style
- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md): expected behavior in issues, PRs, and discussions
- [`SECURITY.md`](SECURITY.md): supported versions, how to report a vulnerability, trust model
- [Live docs site](https://brahmjotsingh0.github.io/rumo/): a browsable landing page for the project

## Security notes

- All SQL is parameterized (`pg` placeholders); no string-built queries.
- Room PINs are bcrypt-hashed at rest, never stored or logged in plain text.
- Host-rejoin tokens are signed with `HOST_TOKEN_SECRET` (auto-generated at boot if you don't set one); see [How hosting works](#how-hosting-works).
- API rate limiting is on by default (`RATE_LIMIT_*` in `backend/.env.example`).
- `helmet` sets standard security headers. Content-Security-Policy is left off by default because it's easy to break WebRTC/media/websocket connections with an overly strict one; if you enable it, test screen share, camera, and chat afterward.
- No cookies or sessions are used (guest model, see [How hosting works](#how-hosting-works)), so `CORS_CREDENTIALS` defaults to `false`.
- TLS is handled by the optional Caddy reverse proxy (`./install.sh --domain ...`) or your own proxy in front; the app itself doesn't terminate HTTPS.
- The admin panel (`/admin`, `/api/settings/*`) is gated by `ADMIN_SETUP_TOKEN`, compared with a timing-safe check. Leave it unset to disable branding changes entirely.
- `.env`/`.env.production` are gitignored everywhere in this repo. Never commit real credentials, and run `npm audit` in both `backend/` and `frontend/` before bumping dependencies.

## Contributing

Issues and PRs welcome. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for setup, coding style, and how to add a language.

## License

MIT. See [LICENSE](LICENSE).
