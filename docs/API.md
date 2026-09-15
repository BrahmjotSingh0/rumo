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

All of these require the caller to be host (or co-host, where noted); otherwise the server replies with `error: { message }` and does nothing.

| Event (client → server) | Who | Payload | Effect |
|---|---|---|---|
| `mute-participant` | host/co-host | `{ roomId, targetSocketId }` | target gets `force-mute`, room gets `user-audio-toggle` |
| `disable-video` | host/co-host | `{ roomId, targetSocketId }` | target gets `force-video-off`, room gets `user-video-toggle` |
| `stop-screenshare` | host/co-host | `{ roomId, targetSocketId }` | target gets `force-stop-screenshare`, room gets `user-screen-share` |
| `kick-participant` | host/co-host | `{ roomId, targetSocketId }` | target gets `kicked-from-room` then is disconnected |
| `mute-all` | host/co-host | `{ roomId, enabled }` | forces mute on everyone except host/co-hosts when `enabled: true`; room gets `all-participants-muted` |
| `toggle-chat` | host/co-host | `{ roomId, enabled }` | room gets `chat-status-changed` |
| `disable-all-cameras` | host/co-host | `{ roomId, enabled }` | room gets `all-cameras-disabled` |
| `disable-all-screenshares` | host/co-host | `{ roomId, enabled }` | room gets `all-screenshares-disabled` |
| `make-cohost` | host only | `{ roomId, targetSocketId }` | target gets `role-changed: { role: 'co-host' }`, room gets `participant-role-updated` |
| `remove-cohost` | host only | `{ roomId, targetSocketId }` | same as above with `role: 'participant'` |
| `set-room-type` | host only | `{ roomId, isPrivate }` | room gets `room-type-changed`; controls whether new joiners hit the waiting room |

Legacy/simpler variants (kept for compatibility, prefer the ones above): `mute-user` / `remove-user` (by `targetUserId`), `mute-all-users`.

### Quality monitoring

| Event | Direction | Payload |
|---|---|---|
| `connection-quality` | client → server | arbitrary quality data → relayed as `user-connection-quality: { userId, socketId, quality }` |
| `network-quality` | client → server | `{ roomId, stats }` → relayed as `user-network-quality: { userId, socketId, stats }` |

### Leaving / host transfer

When a host disconnects or leaves, the server picks the next participant (join order) as the new host and emits `new-host: { hostId, socketId, hostName }` to the room. Everyone else gets `user-left: { userId, socketId, reason }` when any participant leaves.

### Errors

Most handlers emit `error: { message }` back to the caller on failure (permission denied, room not found, etc). WebRTC-specific failures use `webrtc-error: { type, error }` instead.
