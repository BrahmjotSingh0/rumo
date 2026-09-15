# Rumo frontend

React + Vite. Talks to the backend over REST (`/api/rooms`) for room lifecycle and Socket.IO for everything inside a live meeting.

## Requirements

- Node.js 22+

## Setup

```bash
cp .env.example .env
npm install
npm run dev   # http://localhost:5173
```

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` / `npm run lint:fix` | ESLint |

## Environment variables

See [`.env.example`](.env.example):

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Backend base URL |
| `VITE_SOCKET_URL` | Socket.IO server URL (usually the same as the API URL) |
| `VITE_TURN_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL` | Optional TURN server, see the root README |

Branding (name/logo/tagline/color) is **not** an env var; it's `public/branding.json`, loaded at runtime. See the root [README's Configuration section](../README.md#configuration).

## Project layout

```
public/
├── brand/            icon.svg, logo.svg (the actual image assets)
└── branding.json     runtime-editable name/logo/tagline/color

src/
├── components/
│   ├── Home.jsx         landing page: name entry, create/join
│   ├── PreJoin.jsx      camera/mic preview before entering a room
│   ├── MeetingPro.jsx   the in-call UI (large: video grid, controls, chat, host tools)
│   ├── meeting/         sub-components used by MeetingPro (sidebar, controls, popups)
│   └── ui/              small shared components (Button, Input, LanguageSwitcher)
├── config/
│   └── branding.js      fallback branding defaults + loadBranding()
├── i18n/
│   ├── lang.json         all UI strings, one file, keyed by language code
│   └── I18nProvider.jsx  context + useTranslation() hook
├── hooks/                useSettings, useMediaConstraints
├── stores/               zustand store for meeting state
└── utils/
    ├── api.js             axios instance
    ├── constants.js        socket event names, media constraints, ICE servers
    └── theme.js            generates a Tailwind color scale from branding's primaryColor
```

## Branding and theming

`branding.js` exports sane defaults and a `loadBranding()` function that fetches `public/branding.json` once, before the app renders (see `main.jsx`). Everything downstream reads the live `branding` object, not a snapshot, so don't destructure it into a `const` at module scope; read `branding.appName` etc. at render time.

`primaryColor` from that config drives `utils/theme.js`, which generates a 50-900 shade scale and writes it to CSS custom properties (`--color-primary-*`) on `:root`. `tailwind.config.js`'s `primary` color maps to those variables, so `bg-primary-600`, `text-primary-400`, etc. follow whatever color is configured, no rebuild needed.

This is currently applied to `Home.jsx` and `PreJoin.jsx`. `MeetingPro.jsx` still uses fixed Tailwind colors; extending the theme there is a good contribution (see [CONTRIBUTING.md](../CONTRIBUTING.md)).

## i18n

`lang.json` holds every translated string as `{ "key": { "en": "...", "es": "..." } }`. `useTranslation()` gives you `t(key)` and the current/available languages. To add a language, see [CONTRIBUTING.md](../CONTRIBUTING.md#adding-a-language).
