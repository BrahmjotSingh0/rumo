# Embedding Rumo in your own site

Any Rumo meeting can be dropped into another page as an iframe - `https://your-rumo/meeting/<roomId>` is already a standalone page with no site chrome around it. `embed.js` (served from `frontend/public/embed.js`, so it's at `https://your-rumo/embed.js` on your own deployment) wraps that in a small helper - `RumoMeetExternalAPI` - so you don't have to build the iframe and `postMessage` plumbing yourself. It's deliberately modeled after Jitsi's `JitsiMeetExternalAPI`, so if you've integrated that before this should feel familiar.

## Quick start

```html
<script src="https://your-rumo.example.com/embed.js"></script>
<div id="meeting" style="width: 100%; height: 600px;"></div>
<script>
  const api = new RumoMeetExternalAPI('your-rumo.example.com', {
    roomName: 'b6b1e2b0-1234-4a2b-9c3d-abcdef012345', // a room id from POST /api/rooms
    parentNode: document.getElementById('meeting'),
    userInfo: { displayName: 'Ada' }
  });

  api.on('videoConferenceJoined', () => console.log('joined the call'));
  api.on('readyToClose', () => api.dispose());
</script>
```

Create the room first via `POST /api/rooms` (see [`API.md`](API.md)) from your own backend, then pass its `id` as `roomName` here. You don't have to use Rumo's own home page at all - the REST API plus this embed is the whole integration surface.

## Constructor options

```js
new RumoMeetExternalAPI(domain, options)
```

| Option | Type | Notes |
|---|---|---|
| `roomName` | string | required - the room's id (or code) |
| `parentNode` | Element | where the iframe is appended; defaults to `document.body` |
| `width` / `height` | string | CSS size, default `100%` / `100%` |
| `userInfo.displayName` | string | pre-fills the name field so the participant doesn't have to type it |
| `noSSL` | boolean | use `http://` instead of `https://` (local dev only) |

A participant still sees Rumo's own pre-join screen (camera/mic preview, name if not pre-filled, PIN if the room has one) before landing in the call - browsers require a user gesture before handing out camera/mic access, so there's no way to skip that step entirely, in Rumo or anywhere else.

## Commands

```js
api.executeCommand('toggleAudio');
api.executeCommand('sendReaction', '👏');
```

| Command | Args | Effect |
|---|---|---|
| `toggleAudio` | - | mute/unmute the local mic |
| `toggleVideo` | - | turn the local camera on/off |
| `toggleScreenShare` | - | start/stop screen sharing |
| `raiseHand` / `lowerHand` | - | |
| `sendReaction` | `emoji` | one of 👍 👏 ❤️ 😂 🎉 👋 |
| `startRecording` / `stopRecording` | - | local (camera+mic) recording, saved to the participant's own device - see [`API.md`](API.md) and the README comparison table for what this does and doesn't cover |
| `hangup` | - | leave the meeting |

## Events

```js
api.on('participantJoined', ({ id, displayName }) => { ... });
```

| Event | Payload |
|---|---|
| `videoConferenceJoined` | `{ roomId }` - fired once, when the local participant successfully joins |
| `participantJoined` | `{ id, displayName }` |
| `participantLeft` | `{ id }` |
| `audioMuteStatusChanged` | `{ muted }` |
| `videoMuteStatusChanged` | `{ muted }` |
| `hostStatusChanged` | `{ isHost }` |
| `readyToClose` | fired when the local participant leaves - your page decides what to do with the iframe (e.g. `api.dispose()`) |

## Other methods

- `api.getIFrame()` - the underlying `<iframe>` element, if you need it directly.
- `api.off(event, callback)` - remove a listener.
- `api.dispose()` - remove the iframe and stop listening for messages.

## Notes

- The iframe needs camera/mic/screen-share permission from the parent page: `embed.js` sets `allow="camera; microphone; display-capture; autoplay; clipboard-write"` on it automatically.
- Messages between the iframe and your page use `window.postMessage` with a wildcard target origin, the same approach most embeddable video widgets use (YouTube, Vimeo, Jitsi). `RumoMeetExternalAPI` already checks that inbound messages actually come from the iframe it created, so you don't need to add that check yourself.
- This whole feature is just the existing `/meeting/:roomId` page plus a `postMessage` bridge - there's no separate "embed server" or extra infrastructure to run.
