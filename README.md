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

## Contents

- [Features](#features)
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

- **Video/audio calls**: adaptive quality, screen sharing, background blur
- **Guest access**: enter a name and join, no account required. Whoever creates a room is its host
- **Host controls**: mute/remove participants, co-hosts, waiting room for private rooms, host transfer
- **Real-time chat** with rate limiting
- **Connection quality monitoring** and automatic reconnection
- **Configurable branding**: swap the name, logo, tagline, and accent color from one JSON file, no rebuild required
- **Built-in i18n**: every UI string lives in one `lang.json`, add a language by adding a column

## Quick start (Docker)

Requires [Docker](https://docs.docker.com/get-docker/) and Docker Compose.

```bash
git clone https://github.com/BrahmjotSingh0/rumo.git
cd rumo
./install.sh      # Windows: .\install.ps1
```

That generates `.env` with a random database password (if one doesn't already exist) and runs `docker compose up -d --build`. To configure things yourself instead, run `cp .env.example .env`, edit it, then `docker compose up -d --build`.

Frontend: http://localhost:5173 · Backend: http://localhost:5000

The Postgres schema is applied automatically on first run.

> Camera/microphone access requires HTTPS in the browser (Chrome and Firefox both block `getUserMedia` on plain HTTP), except on `localhost`. For a real deployment, put a reverse proxy (Caddy, nginx, Cloudflare Tunnel, etc.) with a TLS certificate in front of `frontend`/`backend`, and point `CORS_ORIGIN`, `VITE_API_URL`, and `VITE_SOCKET_URL` at the public HTTPS URLs.

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

Edit [`frontend/public/branding.json`](frontend/public/branding.json) to change the app name, tagline, description, logo paths, and accent color:

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

This file is fetched at runtime, so re-branding an already-built/deployed instance is just editing it (or bind-mounting your own version over it); no rebuild needed. `primaryColor` drives a full 50-900 Tailwind shade scale computed on load (see `frontend/src/utils/theme.js`), so buttons, badges, and focus rings across the landing and pre-join screens follow it automatically. Logo files live in `frontend/public/brand/`; replace them with your own SVG/PNG and update the paths above. `frontend/src/config/branding.js` holds the fallback defaults used if `branding.json` is missing or invalid, for anyone building from source.

> Scope note: the accent-color retheming above covers the landing and pre-join screens. The in-call UI (`MeetingPro.jsx`) is a large, separate surface that still uses fixed colors, aside from its own existing light/dark toggle in the in-call settings panel. Full accent-color coverage there is a good follow-up contribution.

### Languages

UI strings live in [`frontend/src/i18n/lang.json`](frontend/src/i18n/lang.json): one file, each string keyed by language code.

```json
"common.joinMeeting": { "en": "Join Meeting", "es": "Unirse a la reunión" }
```

To add a language, add its code and label to `languages`, then add that code to every entry in `strings`. The language switcher (top-right on the home screen) picks it up automatically. Currently ships with English and Spanish covering the landing and pre-join screens; in-call UI strings aren't translated yet, so contributions are welcome.

### TURN server (optional)

STUN (included, free, via Google's public servers) is enough for most networks. If some participants are behind restrictive NATs/firewalls and can't connect, run your own TURN server (e.g. [coturn](https://github.com/coturn/coturn)) and set `TURN_SERVERS` (backend) plus `VITE_TURN_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL` (frontend).

## How hosting works

There are no user accounts. Whoever creates a room, or is first to join it, becomes its host for that session, and can transfer host, mute/remove participants, and lock the room. Host status is tracked per browser tab for the life of the meeting; it isn't a secure identity system, it's the same trust model as most link-based meeting tools (anyone with the room link can join).

## Project structure

```
rumo/
├── backend/             Express + Socket.IO API
│   ├── database/schema.sql
│   ├── src/
│   │   ├── config/       env + db connection
│   │   ├── models/       Room.js
│   │   ├── routes/       REST endpoints (/api/rooms, /health)
│   │   ├── services/     socketService.js: WebRTC signaling & room state
│   │   └── utils/
│   ├── server.js
│   ├── Dockerfile
│   └── README.md
├── frontend/             React + Vite
│   ├── public/
│   │   ├── brand/        icon.svg, logo.svg
│   │   └── branding.json  runtime-editable name/logo/tagline/color
│   ├── src/
│   │   ├── components/   Home, PreJoin, MeetingPro, meeting/*
│   │   ├── config/        branding.js (fallback defaults)
│   │   ├── i18n/           lang.json + provider
│   │   ├── utils/theme.js  color-scale generator for primaryColor
│   │   └── hooks/, stores/, utils/
│   ├── Dockerfile
│   └── README.md
├── docs/                 API reference + GitHub Pages site
├── docker-compose.yml
├── install.sh / install.ps1   one-command setup
├── CONTRIBUTING.md
└── .env.example
```

## Documentation

- [`docs/API.md`](docs/API.md): full REST + Socket.IO event reference
- [`backend/README.md`](backend/README.md): backend setup, env vars, scripts
- [`frontend/README.md`](frontend/README.md): frontend setup, branding, i18n, scripts
- [`CONTRIBUTING.md`](CONTRIBUTING.md): how to contribute, coding/docs style
- [Live docs site](https://brahmjotsingh0.github.io/rumo/): a browsable landing page for the project

## Security notes

- All SQL is parameterized (`pg` placeholders); no string-built queries.
- API rate limiting is on by default (`RATE_LIMIT_*` in `backend/.env.example`).
- `helmet` sets standard security headers. Content-Security-Policy is left off by default because it's easy to break WebRTC/media/websocket connections with an overly strict one; if you enable it, test screen share, camera, and chat afterward.
- No cookies or sessions are used (guest model, see [How hosting works](#how-hosting-works)), so `CORS_CREDENTIALS` defaults to `false`.
- Nothing here handles TLS; put a reverse proxy in front for real deployments (see the HTTPS note in Quick Start).
- `.env`/`.env.production` are gitignored everywhere in this repo. Never commit real credentials, and run `npm audit` in both `backend/` and `frontend/` before bumping dependencies.

## Contributing

Issues and PRs welcome. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for setup, coding style, and how to add a language.

## License

MIT. See [LICENSE](LICENSE).
