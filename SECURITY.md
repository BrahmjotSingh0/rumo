# Security Policy

## Supported versions

Rumo doesn't have tagged releases yet. Only the latest commit on `main` is supported. If you're running an older checkout, please update and confirm the issue still exists before reporting it.

## Reporting a vulnerability

Please don't open a public GitHub issue for security vulnerabilities.

Instead, use GitHub's private reporting: go to [github.com/BrahmjotSingh0/rumo/security/advisories/new](https://github.com/BrahmjotSingh0/rumo/security/advisories/new) and open a report there. It's private between you and the maintainer until a fix is out.

Include what you can:

- What you found and where (file, endpoint, or socket event)
- Steps to reproduce
- What an attacker could actually do with it

## What to expect

This is a small project maintained in spare time, not a company with a support contract. As a rough guide:

- Acknowledgement: within a few days
- A fix or a mitigation plan: as soon as reasonably possible, sooner for anything that affects data or lets someone run code they shouldn't

## Trust model (please read before reporting)

Rumo has no user accounts. Some behavior that looks like a bug is actually the documented design, covered in the [README](README.md#how-hosting-works) and [security notes](README.md#security-notes):

- Whoever creates a room, or is first to join it, becomes its host. Anyone with the room link can join, optionally behind a PIN. This is the same trust model most link-based meeting tools use. Reclaiming host status after a reconnect does require proving it with a signed token the server issued earlier (not just a bare client-asserted flag), but there's still no account or password behind host status itself.
- The admin panel and its API (`/admin`, `/api/settings/*`) are protected by a single shared secret (`ADMIN_SETUP_TOKEN`), not per-user accounts, since there's no account system to attach permissions to.
- Feature flags and some host controls are enforced by hiding controls in the client rather than a hard server-side check, and are documented that way rather than sold as a security boundary.

Real vulnerabilities we do want to hear about: anything that breaks *out* of this model, for example reading or writing another room's data, forging another participant's messages, bypassing the admin token, or getting the server to execute something it shouldn't. Guests being able to join a public room with just the link, or pick their own display name, is intended and not a vulnerability on its own.

## What we already do

- All SQL goes through parameterized queries, no string-built queries.
- `npm audit` is expected to report 0 vulnerabilities in both `backend/` and `frontend/` at any commit on `main`.
- `.env` / `.env.production` are gitignored throughout the repo. If you find real credentials committed anywhere in the history, please report it privately rather than opening an issue.
- Peer-to-peer media (camera, mic, screen share) is DTLS-SRTP encrypted end to end between participants' browsers, same as every WebRTC connection - this is mandatory in the spec, browsers don't allow an unencrypted `RTCPeerConnection`, so there's no setting that could weaken it. The signaling channel that sets those connections up (SDP offers/answers, ICE candidates, relayed as opaque payloads the server never inspects) rides the same Socket.IO connection as everything else, so it only inherits WSS/TLS if you've put HTTPS in front of the app - see [How hosting works](README.md#how-hosting-works) and the HTTPS note in [Quick start](README.md#quick-start-docker).
- If you run your own TURN server, the static long-term credentials in `VITE_TURN_USERNAME`/`VITE_TURN_CREDENTIAL` are shipped to every client (unavoidable for a browser to use TURN at all) and don't expire. For a public instance, prefer coturn's [REST API for time-limited credentials](https://github.com/coturn/coturn/wiki/turnserver#turn-rest-api) minted per-session by your own backend instead of a single static pair baked into the frontend build.
