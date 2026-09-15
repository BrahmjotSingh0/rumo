# Rumo

A free, self-hosted video meeting app. No accounts, no third-party platform to sign up with, no per-seat licensing — spin it up on your own server and share the link.

Built with WebRTC (peer-to-peer audio/video), Socket.IO (signaling + real-time chat/host controls), React, and Postgres.

## Features

- **Video/audio calls** with adaptive quality, screen sharing, and background blur
- **Guest access** — enter a name and join, no account required. Whoever creates a room is its host
- **Host controls** — mute/remove participants, co-hosts, waiting room for private rooms, host transfer
- **Real-time chat** with rate limiting
- **Connection quality monitoring** and automatic reconnection
- **Configurable branding** — swap the name/logo/tagline in one file, or override via env vars
- **Built-in i18n** — UI strings live in one `lang.json`; add a language by adding a column

## Quick start (Docker)

Requires [Docker](https://docs.docker.com/get-docker/) and Docker Compose.

```bash
git clone <this-repo-url>
cd rumo
./install.sh      # Windows: .\install.ps1
```

That generates `.env` with a random database password (if one doesn't already exist) and runs `docker compose up -d --build`. To configure things yourself instead: `cp .env.example .env`, edit it, then `docker compose up -d --build`.

Frontend: http://localhost:5173 · Backend: http://localhost:5000

The Postgres schema is applied automatically on first run.

> Camera/microphone access requires HTTPS in the browser (Chrome/Firefox both
> block `getUserMedia` on plain HTTP) except on `localhost`. For a real
> deployment, put a reverse proxy (Caddy, nginx, Cloudflare Tunnel, etc.) with
> a TLS certificate in front of `frontend`/`backend`, and point `CORS_ORIGIN` /
> `VITE_API_URL` / `VITE_SOCKET_URL` at the public HTTPS URLs.

## Manual setup (without Docker)

Requires Node.js 22+ and PostgreSQL.

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

This file is fetched at runtime, so re-branding an already-built/deployed instance is just editing (or bind-mounting over) that one file — no rebuild needed. `primaryColor` drives a full 50-900 Tailwind shade scale computed on load (see `src/utils/theme.js`), so buttons/badges/focus rings across the landing and pre-join screens follow it automatically. Logo files live in `frontend/public/brand/`; replace them with your own SVG/PNG and update the paths above. `frontend/src/config/branding.js` holds the fallback defaults used if `branding.json` is missing/invalid, for anyone building from source.

> Scope note: the accent-color retheming above covers the landing and pre-join screens. The in-call UI (`MeetingPro.jsx`) is a large, separate surface that still uses fixed colors, aside from its own existing light/dark toggle (in the in-call settings panel) — full accent-color coverage there is a good follow-up contribution.

### Languages

UI strings live in [`frontend/src/i18n/lang.json`](frontend/src/i18n/lang.json) — one file, each string keyed by language code:

```json
"common.joinMeeting": { "en": "Join Meeting", "es": "Unirse a la reunión" }
```

To add a language: add its code/label to `languages`, then add that code to every entry in `strings`. The language switcher (top-right on the home screen) picks it up automatically. Currently ships with English and Spanish covering the landing and pre-join screens; in-call UI strings aren't translated yet — contributions welcome.

### TURN server (optional)

STUN (included, free, via Google's public servers) is enough for most networks. If some participants are behind restrictive NATs/firewalls and can't connect, run your own TURN server (e.g. [coturn](https://github.com/coturn/coturn)) and set `TURN_SERVERS` (backend) / `VITE_TURN_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL` (frontend).

## How hosting works

There are no user accounts. Whoever creates a room (or is first to join it) becomes its host for that session, and can transfer host, mute/remove participants, and lock the room. Host status is tracked per-browser-tab for the life of the meeting — it isn't a secure identity system, it's the same trust model as most link-based meeting tools (anyone with the room link can join).

## Project structure

```
rumo/
├── backend/             Express + Socket.IO API
│   ├── database/schema.sql
│   ├── src/
│   │   ├── config/       env + db connection
│   │   ├── models/       Room.js
│   │   ├── routes/       REST endpoints (/api/rooms, /health)
│   │   ├── services/     socketService.js - WebRTC signaling & room state
│   │   └── utils/
│   ├── server.js
│   └── Dockerfile
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
│   └── Dockerfile
├── docker-compose.yml
├── install.sh / install.ps1   one-command setup
└── .env.example
```

## API

- `POST /api/rooms` — create a room
- `GET /api/rooms/:id` — room info + participant count
- `GET /health` — health check

Real-time signaling, chat, and host controls happen over Socket.IO (see `backend/src/services/socketService.js`).

## Security notes

- All SQL is parameterized (`pg` placeholders) — no string-built queries.
- API rate limiting is on by default (`RATE_LIMIT_*` in `backend/.env.example`).
- `helmet` sets standard security headers; Content-Security-Policy is left off by default because it's easy to break WebRTC/media/websocket connections with an overly strict one — if you enable it, test screen share, camera, and chat afterward.
- No cookies/sessions are used (guest model, see "How hosting works" above), so `CORS_CREDENTIALS` defaults to `false`.
- Nothing here handles TLS — put a reverse proxy in front for real deployments (see the Quick Start note on HTTPS).
- `.env`/`.env.production` are gitignored everywhere in this repo; never commit real credentials. `npm audit` is run in CI for both `backend` and `frontend` — keep it passing when bumping dependencies.

## Contributing

Issues and PRs welcome. Keep changes focused, and if you're adding a language, only touch `lang.json`.

## License

MIT — see [LICENSE](LICENSE).
