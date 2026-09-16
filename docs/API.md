# API Reference

Rumo's backend exposes a small REST API for room lifecycle (create/look up a room) and a Socket.IO namespace for everything that happens in real time inside a meeting (WebRTC signaling, chat, host controls). There's no authentication layer; see [Security notes](../README.md#security-notes) in the main README for the trust model.

Base URL: whatever `VITE_API_URL`/`CORS_ORIGIN` point at (`http://localhost:5000` by default).

## REST

### `POST /api/rooms`

Create a room.

**Body**
| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | no | 1-255 chars, defaults to `"Quick Meeting"` |
| `maxParticipants` | integer | no | 2-100, default 50 |
| `password` | string | no | 4-50 chars (stored but not currently enforced by the join flow, see note below) |

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
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
}
```

Use `data.id` as the room identifier everywhere else (URLs, the other endpoints, Socket.IO's `roomId`).

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
    "participantCount": 2,
    "participants": [
      { "id": "...", "name": "Ann", "isHost": true, "joinedAt": "..." }
    ],
    "createdAt": "...",
    "startedAt": null
  }
}
```
`404` if the room doesn't exist. `hostName` reflects whoever currently holds host status (it can change via host transfer), not the original creator.

### `GET /api/rooms/code/:roomCode`

Same shape as above, looked up by the human-readable room code instead of the UUID.

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
  "features": { "chat": true, "screenShare": true, "virtualBackgrounds": true, "coHost": true, "waitingRoom": true, "muteAll": true, "disableAllCameras": true, "disableAllScreenShares": true, "lockMeeting": true, "layoutSwitch": true, "raiseHand": true, "reactions": true },
  "backgroundPresets": [{ "id": "uuid", "url": "/uploads/backgrounds/....jpg", "name": "Office" }],
  "updatedAt": "2026-01-01T00:00:00.000Z"
}
```
`appName`/`tagline`/etc are only present once set; the frontend falls back to `branding.json` / built-in defaults for anything missing. `features` and `backgroundPresets` are always present (with defaults) regardless of `configured`.

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

## Socket.IO

Connect to the same origin as the REST API. All real-time behavior (signaling, chat, host controls, the waiting room) goes through this connection. `roomId` below is always the UUID from `POST /api/rooms`.

There are no accounts: every participant is identified by whatever `userName` they send when joining, plus the socket's own `socket.id` for the life of that connection. Host status is server-computed (see **Joining**); never trust a client-asserted `isHost` for anything security-sensitive.

### Joining

| Event (client → server) | Payload | Behavior |
|---|---|---|
| `request-join` | `{ roomId, userName, audioEnabled, videoEnabled }` | Normal join path. If the room is empty or not marked private, joins immediately. Otherwise the caller is put in a waiting room (see below) until a host/co-host approves. |
| `host-rejoin` | `{ roomId, userId, userName, audioEnabled, videoEnabled }` | Used when a client's local state says it was host before (e.g. after a page refresh); skips the waiting room. This is **client-trusted**, not verified against any stored identity, the security model here is the same as most link-based meeting tools. |
| `leave-room` | (none) | Leaves the current room. |

On a successful join the server emits, to the joining socket only:

| Event (server → client) | Payload |
|---|---|
| `room-users` | array of other current participants |
| `room-settings` | `{ isPrivate, allMuted, allCamerasOff, allScreenSharesOff, chatEnabled }` |
| `host-status` | `{ isHost: boolean }`, **the authoritative answer to "am I host"**. Persist it (keyed by room) if you need to reconnect-as-host later. |

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
| `send-message` | client → server | `{ roomId, message, userName, type? }` (rate-limited to 30/min per socket; over the limit gets `rate-limit-exceeded: { type: 'chat' }`) |
| `new-message` | → room | the stored `{ id, userId, userName, message, type, timestamp }` |
| `delete-message` | client → server (host only) | `{ roomId, messageId }` |
| `message-deleted` | → room | `{ messageId }` |

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

### Quality monitoring

| Event | Direction | Payload |
|---|---|---|
| `connection-quality` | client → server | arbitrary quality data → relayed as `user-connection-quality: { userId, socketId, quality }` |
| `network-quality` | client → server | `{ roomId, stats }` → relayed as `user-network-quality: { userId, socketId, stats }` |

### Leaving / host transfer

When a host disconnects or leaves, the server picks the next participant (join order) as the new host and emits `new-host: { hostId, socketId, hostName }` to the room. Everyone else gets `user-left: { userId, socketId, reason }` when any participant leaves.

### Errors

Most handlers emit `error: { message }` back to the caller on failure (permission denied, room not found, etc). WebRTC-specific failures use `webrtc-error: { type, error }` instead.
