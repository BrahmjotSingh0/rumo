# API Reference

Rumo's backend exposes a small REST API for room lifecycle (create/look up a room) and a Socket.IO namespace for everything that happens in real time inside a meeting (WebRTC signaling, chat, host controls). There's no authentication layer; see [Security notes](../README.md#security-notes) in the main README for the trust model.

Base URL: whatever `VITE_API_URL`/`CORS_ORIGIN` point at (`http://localhost:5000` by default).

Embedding a meeting in your own page (rather than calling this API directly) is covered separately in [`docs/EMBEDDING.md`](EMBEDDING.md).

## REST

### `POST /api/rooms`

Create a room.

**Body**
| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | no | 1-255 chars, defaults to `"Quick Meeting"` |
| `maxParticipants` | integer | no | 2-100, default 50 |
| `password` | string | no | 4-50 chars. A PIN participants must enter before joining (bcrypt-hashed at rest); see `POST /api/rooms/:id/verify-pin` and the `request-join` socket event below |
| `scheduledAt` | string | no | ISO 8601 timestamp. Sets `status` to `scheduled` instead of `active`; purely informational; the room is joinable immediately either way, this doesn't gate anything |

**Response** `201`
```json
{
  "success": true,
  "data": {
    "id": "b6b1e2b0-...",
    "roomCode": "ABC-123-XYZ",
    "title": "Quick Meeting",
    "hostId": "b6b1e2b0-...",
    "maxParticipants": 50,
    "hasPassword": false,
    "scheduledAt": null,
    "status": "active",
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
}
```

Use `data.id` as the room identifier everywhere else (URLs, the other endpoints, Socket.IO's `roomId`). This same endpoint is how an integrator would create rooms programmatically from their own backend/app rather than pointing people at Rumo's own home page.

### `GET /api/rooms/:id`

Room info + live participant count. `:id` is a UUID.

**Response** `200`
```json
{
  "success": true,
  "data": {
    "id": "b6b1e2b0-...",
    "roomCode": "ABC-123-XYZ",
    "title": "Quick Meeting",
    "hostId": "b6b1e2b0-...",
    "hostName": "Ann",
    "maxParticipants": 50,
    "status": "active",
    "hasPassword": false,
    "scheduledAt": null,
    "participantCount": 2,
    "participants": [
      { "id": "...", "name": "Ann", "isHost": true, "joinedAt": "..." }
    ],
    "createdAt": "...",
    "startedAt": null
  }
}
```
`404` if the room doesn't exist. `hostName` reflects whoever currently holds host status (it can change via host transfer), not the original creator. `hasPassword` tells a client whether to prompt for a PIN before joining, without exposing the hash itself.

### `GET /api/rooms/code/:roomCode`

Same shape as above, looked up by the human-readable room code instead of the UUID.

### `POST /api/rooms/:id/verify-pin`

Body: `{ "pin": "..." }` (omit or send empty if the room has no PIN). Returns `200 { "success": true }` if correct (or the room has no PIN at all), `401 { "error": "Incorrect PIN" }` otherwise.

This is a courtesy check for building your own pre-join UI (it's what Rumo's own PreJoin screen calls). It doesn't grant access by itself - the same PIN is re-checked server-side when the socket actually joins (`request-join` below), so there's no way to skip it by only calling this endpoint.

### `POST /api/rooms/:roomId/files`

Multipart form upload, field name `file`. Used for in-call file sharing (chat's paperclip button); the returned URL is then sent as a normal `send-message` with `type: 'file'` (see Chat below). Accepts images (PNG/JPEG/WebP/GIF), PDF, plain text, zip, and Office/OpenXML documents, up to 15MB. `404` if the room doesn't exist.

**Response** `201`
```json
{ "url": "/uploads/chat/3f1c....pdf", "name": "notes.pdf", "size": 48213, "mimeType": "application/pdf" }
```

### `GET /api/rooms`

Paginated list of active rooms. Query params: `page` (default 1), `limit` (default 10).

### `PATCH /api/rooms/:id/status`

Body: `{ "status": "active" | "ended" | "scheduled" }`.

### `DELETE /api/rooms/:id`

Ends a room (sets status to `ended`); doesn't delete history.

### `GET /api/rooms/:id/analytics`

Aggregate stats for a room (participant/message counts, duration) from the `room_analytics` view.

### `GET /health`

Health check: DB connectivity, memory/CPU, uptime. Used by Docker's healthcheck and load balancers.

### `GET /api/settings/branding`

Public. Current branding settings saved through the admin panel, if any.

**Response** `200`
```json
{ "configured": false }
```
or, once something has been saved:
```json
{
  "configured": true,
  "appName": "Rumo",
  "tagline": "Connect, collaborate, create.",
  "description": "Free, self-hosted video meetings.",
  "logoIcon": "/uploads/branding/....svg",
  "logoFull": "/uploads/branding/....svg",
  "primaryColor": "#2E5BFF",
  "features": { "chat": true, "screenShare": true, "virtualBackgrounds": true, "coHost": true, "waitingRoom": true, "muteAll": true, "disableAllCameras": true, "disableAllScreenShares": true, "lockMeeting": true, "layoutSwitch": true, "raiseHand": true, "reactions": true, "liveCaptions": true, "localRecording": true, "polls": true, "fileSharing": true, "whiteboard": true, "breakoutRooms": true, "hostControls": true },
  "backgroundPresets": [{ "id": "uuid", "url": "/uploads/backgrounds/....jpg", "name": "Office" }],
  "adminPageEnabled": true,
  "updatedAt": "2026-01-01T00:00:00.000Z"
}
```
`appName`/`tagline`/etc are only present once set; the frontend falls back to `branding.json` / built-in defaults for anything missing. `features`, `backgroundPresets`, and `adminPageEnabled` are always present (with defaults) regardless of `configured`. `adminPageEnabled` (default `true`) only controls whether the `/admin` frontend route shows its form or a locked screen for visitors without the admin token - it's a presentation choice, not a second security boundary alongside `x-admin-token` below.

### `PUT /api/settings/branding`

Requires header `x-admin-token: <ADMIN_SETUP_TOKEN>`. Returns `403` if `ADMIN_SETUP_TOKEN` isn't set on the backend, `401` if the token doesn't match.

**Body** (all fields optional, only the ones you send are changed)
| Field | Type | Notes |
|---|---|---|
| `appName` | string | 1-100 chars |
| `tagline` | string | up to 200 chars |
| `description` | string | up to 300 chars |
| `logoIcon` | string | path, typically from the logo upload endpoint below |
| `logoFull` | string | path, same as above |
| `primaryColor` | string | hex color, e.g. `#2E5BFF` |
| `features` | object | any subset of the keys shown in the `GET` response above; merged onto what's already stored, not replaced |
| `adminPageEnabled` | boolean | whether `/admin` shows its form to visitors without the admin token, or a locked screen instead |

**Response** `200`: same shape as the `GET` above.

### `POST /api/settings/branding/logo`

Requires header `x-admin-token: <ADMIN_SETUP_TOKEN>`. Multipart form upload, field name `logo`. Accepts SVG, PNG, JPEG, or WebP, up to 2MB.

**Response** `200`
```json
{ "url": "/uploads/branding/3f1c....svg" }
```
Pass that `url` as `logoIcon` or `logoFull` in the `PUT` above to use it.

### `POST /api/settings/branding/backgrounds`

Requires header `x-admin-token: <ADMIN_SETUP_TOKEN>`. Multipart form upload, field name `background` (optional `name` field). Accepts PNG, JPEG, or WebP, up to 5MB. Adds the image to the shared virtual-background gallery every participant sees in their settings panel, alongside whatever they upload for themselves (which never leaves their browser).

**Response** `201`
```json
{ "backgroundPresets": [{ "id": "uuid", "url": "/uploads/backgrounds/....jpg", "name": "Office" }] }
```

### `DELETE /api/settings/branding/backgrounds/:id`

Requires header `x-admin-token: <ADMIN_SETUP_TOKEN>`. Removes that preset (and its file) from the shared gallery.

**Response** `200`: `{ "backgroundPresets": [...] }` (the remaining list). `404` if that id doesn't exist.

---

## Webhooks

Optional, off by default. Set `WEBHOOK_URL` (and, to have requests signed, `WEBHOOK_SECRET`) in the backend's environment and Rumo will `POST` a JSON body for these events as they happen:

| Event | Fires when | Data |
|---|---|---|
| `room.created` | a room is created via `POST /api/rooms` | `{ roomId, roomCode, title }` |
| `room.ended` | a room's status is set to `ended` (via the `PATCH`/`DELETE` endpoints above) | `{ roomId, roomCode }` |
| `participant.joined` | anyone joins a room over Socket.IO | `{ roomId, participantId, name, isHost }` |
| `participant.left` | anyone leaves (disconnects, is kicked, closes the tab) | `{ roomId, participantId, name, reason }` |

Request body:
```json
{ "event": "participant.joined", "data": { "...": "..." }, "timestamp": "2026-01-01T00:00:00.000Z" }
```

If `WEBHOOK_SECRET` is set, each request carries `X-Rumo-Signature: <hex hmac-sha256 of the raw body>` so you can verify it came from your own instance. Delivery is fire-and-forget: a slow or failing webhook endpoint is logged and otherwise ignored, it never blocks or fails the underlying action.

---

## Socket.IO

Connect to the same origin as the REST API. All real-time behavior (signaling, chat, host controls, the waiting room) goes through this connection. `roomId` below is always the UUID from `POST /api/rooms`.

There are no accounts: every participant is identified by whatever `userName` they send when joining, plus the socket's own `socket.id` for the life of that connection. Host status is server-computed (see **Joining**); never trust a client-asserted `isHost` for anything security-sensitive.

### Joining

| Event (client → server) | Payload | Behavior |
|---|---|---|
| `request-join` | `{ roomId, userName, audioEnabled, videoEnabled, pin? }` | Normal join path. `pin` is required if the room has one set (see `POST /api/rooms`); an incorrect or missing PIN gets `error: { message: 'Incorrect PIN' }` and no join happens. Otherwise, if the room is empty or not marked private, joins immediately - if private and non-empty, the caller is put in a waiting room (see below) until a host/co-host approves. |
| `host-rejoin` | `{ roomId, userId, userName, audioEnabled, videoEnabled, hostToken }` | Reclaims host status after a reconnect, skipping the waiting room. `hostToken` is a short-lived token the server handed this client the moment it first became host (see `host-status` below) - a bare `isHost` claim with no valid token for this room is **not** trusted and is treated as a normal join instead. |
| `leave-room` | (none) | Leaves the current room. |

On a successful join the server emits, to the joining socket only:

| Event (server → client) | Payload |
|---|---|
| `room-users` | array of other current participants |
| `room-settings` | `{ isPrivate, allMuted, allCamerasOff, allScreenSharesOff, chatEnabled }` |
| `host-status` | `{ isHost: boolean, hostToken: string \| null }`, **the authoritative answer to "am I host"**. `hostToken` is only set when `isHost` is true - store it (keyed by room) and send it back on `host-rejoin` above. It's also re-sent (privately, to the new host's socket only) after a host transfer. |

...and to everyone else already in the room:

| Event | Payload |
|---|---|
| `user-joined` | the new participant's public info |
| `participant-list-updated` | full current participant list |

### Waiting room (private rooms only)

| Event | Direction | Payload |
|---|---|---|
| `waiting-for-approval` | → joining client | `{ message }` |
| `join-request` | → host/co-host sockets | `{ socketId, userName, profilePicture, timestamp }` |
| `approve-join` | client → server | `{ targetSocketId }` (host/co-host only) |
| `reject-join` | client → server | `{ targetSocketId }` |
| `join-approved` / `join-rejected` | → the waiting client | `{ by, message? }` |

### WebRTC signaling

Plain relay: the server never inspects SDP/ICE contents, just forwards by `target` socket id.

| Event | Payload |
|---|---|
| `offer` | `{ target, offer, metadata }` → relayed as `{ sender, offer, metadata, timestamp }` |
| `answer` | `{ target, answer, metadata }` → relayed as `{ sender, answer, metadata, timestamp }` |
| `ice-candidate` | `{ target, candidate }` → relayed as `{ sender, candidate, timestamp }` |
| `connection-state-change` | `{ target, state }` → relayed as `peer-connection-state: { sender, state, timestamp }` |

On failure the sender gets back `webrtc-error: { type, error }`.

### Media state

| Event (client → server) | Payload | Broadcast to room as |
|---|---|---|
| `toggle-audio` | `{ roomId, enabled }` | `user-audio-toggle: { userId, socketId, enabled }` |
| `toggle-video` | `{ roomId, enabled }` | `user-video-toggle: { userId, socketId, enabled }` |
| `toggle-screen-share` | `{ roomId, enabled, quality }` | `user-screen-share: { userId, socketId, enabled, quality, timestamp }` |
| `camera-flipped` | `{ roomId, facingMode, trackId }` | `camera-flipped: { userId, socketId, facingMode, trackId, timestamp }` |

### Chat

| Event | Direction | Payload |
|---|---|---|
| `send-message` | client → server | `{ roomId, message, userName, type?, fileUrl?, fileName?, fileSize? }` (rate-limited to 30/min per socket; over the limit gets `rate-limit-exceeded: { type: 'chat' }`) |
| `new-message` | → room | the stored `{ id, userId, userName, message, type, timestamp, fileUrl?, fileName?, fileSize? }` |
| `delete-message` | client → server (host only) | `{ roomId, messageId }` |
| `message-deleted` | → room | `{ messageId }` |

For a file message, upload it first via `POST /api/rooms/:roomId/files` above, then send `send-message` with `type: 'file'` and the `fileUrl`/`fileName`/`fileSize` from that response. The server only accepts `fileUrl` if it points at that same upload directory (`/uploads/chat/...`) - anything else is silently dropped down to a plain-text message, so chat can't be used to relay arbitrary external URLs as if they were trusted uploads.

### Polls

Single-choice, one per room at a time. Vote counts are broadcast to everyone; who voted for which option never is.

| Event (client → server) | Tier | Payload | Broadcast to room as |
|---|---|---|---|
| `create-poll` | room settings | `{ roomId, question, options }` (2-10 options) | `poll-created: { id, question, options: [{ text, votes }], isOpen, totalVoters, createdBy }` |
| `vote-poll` | anyone | `{ roomId, optionIndex }` (re-voting replaces your previous choice) | `poll-updated`, same shape as `poll-created` |
| `close-poll` | room settings | `{ roomId }` | `poll-closed`, same shape, `isOpen: false` |

"Room settings" is the same permission tier defined under **Host controls** below. A late joiner gets the currently active poll (if any) privately as `poll-created` right after joining.

### Whiteboard

A shared drawing surface. Anyone in the room can draw; clearing it requires the "room settings" tier.

| Event (client → server) | Payload | Broadcast to room as |
|---|---|---|
| `whiteboard-draw` | `{ roomId, x0, y0, x1, y1, color, width }` - coordinates are fractions (0-1) of the sender's own canvas, not pixels, so it replays correctly regardless of each viewer's window size | `whiteboard-draw`, same payload, to everyone else (the sender already drew it locally) |
| `whiteboard-clear` | room settings tier only - `{ roomId }` | `whiteboard-cleared: { by }` |

A late joiner gets the whole stroke history so far, privately, as `whiteboard-state: [stroke, ...]` right after joining. The server caps stored strokes at 5000 per room, dropping the oldest ones past that.

### Breakout rooms

Host-only (or co-host, if the room settings tier allows it). Each breakout room is a real room created the same way `POST /api/rooms` creates one - assigning someone to it just tells their client to navigate to that room's URL, reusing the whole normal join flow rather than a separate mesh-management system. That also means a breakout room inherits the same "anyone with the link can join" trust model as any other room.

| Event (client → server) | Payload | Effect |
|---|---|---|
| `create-breakout-rooms` | `{ roomId, count }` (2-20) | Creates `count` new rooms; room gets `breakout-rooms-created: { rooms: [{ index, id, title }] }` |
| `assign-breakout` | `{ roomId, targetSocketId, breakoutIndex }` | That participant's socket gets `breakout-assigned: { breakoutRoomId, breakoutTitle, mainRoomId }` |
| `auto-assign-breakouts` | `{ roomId }` | Round-robins every current participant (except the caller) across the existing breakout rooms, each getting `breakout-assigned` as above |
| `close-breakout-rooms` | `{ roomId }` | Everyone currently in one of those breakout rooms gets `breakout-closed: { mainRoomId }`; room gets `breakout-rooms-closed`. Doesn't move anyone back automatically - the client shows a "return to main room" banner instead |

### Host controls

Two permission tiers, both host-configurable per room (see `set-cohost-permissions` below):

- **Manage participants** (`mute-participant`, `disable-video`, `stop-screenshare`, `kick-participant`): host always; co-host only if `coHostsCanManageParticipants` is on (**default on**).
- **Change room settings** (`mute-all`, `toggle-chat`, `set-room-type`, `disable-all-cameras`, `disable-all-screenshares`, `lock-meeting`, `toggle-self-unmute`, `toggle-participant-screenshare`): host always; co-host only if `coHostsCanChangeSettings` is on (**default off**).

Calls outside these rules get `error: { message }` back and are dropped.

| Event (client → server) | Tier | Payload | Effect |
|---|---|---|---|
| `mute-participant` | manage participants | `{ roomId, targetSocketId }` | target gets `force-mute`, room gets `user-audio-toggle` |
| `disable-video` | manage participants | `{ roomId, targetSocketId }` | target gets `force-video-off`, room gets `user-video-toggle` |
| `stop-screenshare` | manage participants | `{ roomId, targetSocketId }` | target gets `force-stop-screenshare`, room gets `user-screen-share` |
| `kick-participant` | manage participants | `{ roomId, targetSocketId }` | target gets `kicked-from-room` then is disconnected |
| `mute-all` | room settings | `{ roomId, enabled }` | forces mute on everyone except host/co-hosts when `enabled: true`; room gets `all-participants-muted` |
| `toggle-chat` | room settings | `{ roomId, enabled }` | room gets `chat-status-changed` |
| `disable-all-cameras` | room settings | `{ roomId, enabled }` | room gets `all-cameras-disabled` |
| `disable-all-screenshares` | room settings | `{ roomId, enabled }` | room gets `all-screenshares-disabled` |
| `set-room-type` | room settings | `{ roomId, isPrivate }` | room gets `room-type-changed`; controls whether new joiners hit the waiting room |
| `lock-meeting` | room settings | `{ roomId, locked }` | room gets `meeting-lock-changed`; when locked, `request-join`/`host-rejoin` are rejected outright for anyone new, no waiting room offered |
| `toggle-self-unmute` | room settings | `{ roomId, enabled }` | room gets `self-unmute-permission-changed`; when off, a non-host/co-host's `toggle-audio: { enabled: true }` is rejected and they get `force-mute` back |
| `toggle-participant-screenshare` | room settings | `{ roomId, enabled }` | room gets `participant-screenshare-permission-changed`; when off, a non-host/co-host's `toggle-screen-share: { enabled: true }` is rejected and they get `force-stop-screenshare` back |
| `make-cohost` | host only | `{ roomId, targetSocketId }` | target gets `role-changed: { role: 'co-host' }`, room gets `participant-role-updated` |
| `remove-cohost` | host only | `{ roomId, targetSocketId }` | same as above with `role: 'participant'` |
| `set-cohost-permissions` | host only | `{ roomId, canManageParticipants?, canChangeSettings? }` | room gets `co-host-permissions-changed: { coHostsCanManageParticipants, coHostsCanChangeSettings, by, timestamp }`. Host-only regardless of the room-settings tier above, so a co-host can never grant itself more power |

Legacy/simpler variants (kept for compatibility, prefer the ones above): `mute-user` / `remove-user` (by `targetUserId`), `mute-all-users`.

### Raise hand / reactions

| Event (client → server) | Payload | Broadcast to room as |
|---|---|---|
| `raise-hand` | `{ roomId }` | `hand-raised: { socketId, userName, timestamp }` |
| `lower-hand` | `{ roomId, targetSocketId? }` | `hand-lowered: { socketId, timestamp }`. Anyone can lower their own hand; lowering someone else's requires the "manage participants" tier above |
| `send-reaction` | `{ roomId, emoji }` | `reaction-received: { socketId, userName, emoji, timestamp }`. `emoji` must be one of 👍 👏 ❤️ 😂 🎉 👋 - anything else is silently dropped |

### Live captions

Entirely client-side speech-to-text (the browser's own Web Speech API - see `frontend/src/hooks/useLiveCaptions.js`); the server only relays the resulting text, it never sees or transcribes audio itself.

| Event (client → server) | Payload | Broadcast to room as |
|---|---|---|
| `send-caption` | `{ roomId, text }` | `caption-received: { socketId, userName, text, timestamp }` |

Ephemeral by design - unlike chat, captions are never stored, just relayed live to whoever is currently in the room.

### Quality monitoring

| Event | Direction | Payload |
|---|---|---|
| `connection-quality` | client → server | arbitrary quality data → relayed as `user-connection-quality: { userId, socketId, quality }` |
| `network-quality` | client → server | `{ roomId, stats }` → relayed as `user-network-quality: { userId, socketId, stats }` |

### Leaving / host transfer

When a host disconnects or leaves, the server picks the next participant (join order) as the new host and emits `new-host: { hostId, socketId, hostName }` to the room. Everyone else gets `user-left: { userId, socketId, reason }` when any participant leaves.

### Errors

Most handlers emit `error: { message }` back to the caller on failure (permission denied, room not found, etc). WebRTC-specific failures use `webrtc-error: { type, error }` instead.
