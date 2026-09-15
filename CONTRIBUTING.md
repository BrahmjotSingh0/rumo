# Contributing to Rumo

Thanks for considering a contribution. This project is a small, focused self-hosted video meeting app, so the bar for changes is "does this make self-hosting or using Rumo better" rather than "is this a cool feature."

## Getting set up

See the root [README.md](README.md#manual-setup-without-docker) for the full manual setup, or just run `./install.sh` (Docker) for the fastest path to a running instance. Day-to-day development is easiest without Docker:

```bash
createdb rumo
psql rumo < backend/database/schema.sql

cd backend && cp .env.example .env && npm install && npm run dev
cd frontend && cp .env.example .env && npm install && npm run dev
```

More detail on each package: [`backend/README.md`](backend/README.md), [`frontend/README.md`](frontend/README.md).

## Before opening a PR

- `cd backend && npm run lint` and `cd frontend && npm run lint` should be clean for anything you touched (pre-existing warnings elsewhere in `MeetingPro.jsx` are known debt, not something your PR needs to fix unless you're specifically cleaning that up).
- `cd frontend && npm run build` should succeed.
- `npm audit` should report no new vulnerabilities in either package.
- Keep PRs focused. A translation addition shouldn't also refactor a component; a bug fix shouldn't also rename things.

## Adding a language

Only touch [`frontend/src/i18n/lang.json`](frontend/src/i18n/lang.json):

1. Add your language's code and display name to the `languages` object.
2. Add that code to every entry under `strings`.

Don't add a new i18n system, provider, or file format. Currently only the landing and pre-join screens are translated; extending coverage into `MeetingPro.jsx` is a welcome contribution but should be its own PR (that file is large, and a translation PR mixed with a big diff there is hard to review).

## Changing branding/theming

`frontend/src/config/branding.js` holds the fallback defaults; `frontend/public/branding.json` is what actually ships and gets fetched at runtime. If you're changing what fields branding supports, update both, plus the docs in the README's [Configuration](README.md#configuration) section and `frontend/README.md`.

## Backend changes

- All SQL goes through parameterized queries (`pg` placeholders), never string concatenation.
- New Socket.IO events should be documented in [`docs/API.md`](docs/API.md) in the same PR.
- Schema changes go in `backend/database/schema.sql`; there's no migration tooling yet, so breaking schema changes should call that out clearly in the PR description.

## Documentation style

- No em dashes ("—") anywhere in this project (docs, code comments, commit messages, UI copy). Use a period, comma, colon, or semicolon instead. This is a hard rule, not a preference; PRs that introduce em dashes will be asked to fix them.
- Prefer short, direct sentences over marketing language.
- Code comments explain *why*, not *what* (the code already says what it does). Don't add a comment restating the line above it.

## Reporting bugs / requesting features

Open a GitHub issue. For bugs, include: what you expected, what happened, browser/OS, and whether it's guest-only reproducible or needs a specific setup (private room, co-host, etc).

## License

By contributing, you agree your contribution is licensed under this project's [MIT license](LICENSE).
