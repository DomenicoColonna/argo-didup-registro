# Working on this repo

Personal register app on top of the didUP Famiglia API. Plain Node 20, no
dependencies, no build step. Frontend is vanilla JS + Tailwind CDN in `public/`.

## Layout

- `argo.js` API client (OAuth2 PKCE login, token refresh, `apiRequest`)
- `server.js` HTTP server on port 3000, `/api/login`, `/api/data`, `/api/logout`,
  static files from `public/`, sessions in `dati/sessioni.json`
- `login-test.js` step by step login diagnostics
- `public/app.js` all the UI logic, `public/index.html` markup and Tailwind config
- `netlify/functions/api.js` the same API as `server.js` for Netlify, session in an
  encrypted cookie (needs `SESSION_SECRET`), config in `netlify.toml`

## Rules

- Never write credentials to disk. Only Argo tokens go in `dati/`, which stays
  out of git together with `references/`.
- The mobile layout is final. Do not touch it. Desktop only changes go behind
  the `lg:` breakpoint.
- Averages are computed locally, see `calcolaMedie` in `public/app.js`. A grade
  counts unless `numMedia === 0` or `faMenoMedia === 'S'`.
- The calendar only shows September to June of the current school year.
- Code comments are in English. UI text and variable names stay in Italian.
- Commit and push only when asked.
- `server.js` (VPS) and `netlify/functions/api.js` (Netlify) must keep the same
  endpoints and response shape, the frontend does not know which one it talks to.

## Commits

Conventional commits, in English, short and plain, for example
`fix(calendar): keep weekend days muted`. No AI trailers or co-author lines.
Avoid dashes and semicolons in the message, a colon after the scope is fine.

## Checking the UI

Run `node server.js` and open http://localhost:3000. For screenshots without a
real login use a mock server on another port and headless Chrome
(`--headless --screenshot --virtual-time-budget=3000`).
