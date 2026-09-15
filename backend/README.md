# Rumo backend

Express + Socket.IO API: room lifecycle over REST, everything else (WebRTC signaling, chat, host controls) over Socket.IO. See [`../docs/API.md`](../docs/API.md) for the full endpoint/event reference.

## Requirements

- Node.js 22+
- PostgreSQL (any recent version; developed against 16)

## Setup

```bash
createdb rumo
psql rumo < database/schema.sql

cp .env.example .env   # fill in DB_USER / DB_PASSWORD at minimum
npm install
npm run dev             # nodemon, http://localhost:5000
```

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start with nodemon (auto-restart on change) |
| `npm start` | Start once, no auto-restart (what Docker/production uses) |
| `npm run lint` / `npm run lint:fix` | ESLint over `src/` |
| `npm test` | Jest |
| `npm run pm2:prod` | Start under PM2 using `ecosystem.config.js` (see below) |

## Environment variables

See [`.env.example`](.env.example) for the full list with defaults. The important ones:

| Variable | Purpose |
|---|---|
| `PORT` | HTTP/Socket.IO port (default 5000) |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL` | PostgreSQL connection |
| `CORS_ORIGIN` | The frontend's origin; must match exactly (protocol + host + port) |
| `CORS_CREDENTIALS` | Leave `false` unless you've added cookie-based auth yourself; there's no built-in auth to send credentials for |
| `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS` | REST API rate limiting |
| `STUN_SERVERS` | Comma-separated STUN URLs, defaults to Google's public servers |
| `TURN_SERVERS` | Optional, format `url\|username\|credential`, comma-separated for multiple |

## Project layout

```
src/
├── config/
│   ├── database.js       Postgres pool + query/transaction helpers
│   └── environment.js    env var loading + defaults
├── models/
│   └── Room.js            all room/participant SQL
├── routes/
│   ├── rooms.js           POST/GET/PATCH/DELETE /api/rooms
│   └── health.js          GET /health
├── services/
│   └── socketService.js  all Socket.IO event handling (~30 events)
└── utils/
    └── logger.js          winston setup
```

`server.js` wires it all together: Express app, Socket.IO server, middleware (helmet, compression, CORS, rate limiting), and graceful shutdown.

## Database

`database/schema.sql` is the single source of truth for the schema; there's no migration framework yet. Tables: `rooms`, `room_participants` (guests, identified by name, no `users` table since there are no accounts), `chat_messages`, `meeting_sessions`, `connection_logs`, `webrtc_stats`, plus two views (`active_rooms`, `room_analytics`).

## Process management (non-Docker deployments)

`ecosystem.config.js` is a ready-to-use [PM2](https://pm2.keymetrics.io/) config:

```bash
npm run pm2:prod    # pm2 start ecosystem.config.js --env production
npm run pm2:status
npm run pm2:logs
```

If you're using Docker Compose instead (see the root README), you don't need PM2 at all; the container just runs `node server.js` directly.
