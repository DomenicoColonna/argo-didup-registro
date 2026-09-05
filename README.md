# Argo didUP register

A small personal web app that reads data from didUP Famiglia through the same
API the official app uses. It shows grades, homework, a monthly calendar and an
average computed locally (my school turned the official one off).

## Running it

```bash
node server.js          # then open http://localhost:3000
PORT=8080 node server.js
```

There are no dependencies, you only need Node 18 or newer.

## Login diagnostics

```bash
node login-test.js
```

It prints every step of the flow (`oauth2/auth`, `sso/login`, `token`, `login`,
`profilo`, `dashboard`) and stops exactly where Argo says no, together with the
message it returned.

## How it works

`argo.js` is the API client. It runs the OAuth2 + PKCE login on
`auth.portaleargo.it` (same thing the Android and iOS apps do) and then calls
`https://www.portaleargo.it/appfamiglia/api/rest/*`.

`server.js` is a small proxy. The Argo API sends no CORS headers, so the browser
cannot call it directly. The server keeps sessions and serves `public/`.

`public/` is the UI, plain HTML and JS with Tailwind from the CDN. Home with the
average and upcoming events, monthly calendar, homework, grades per subject,
averages. A tab can also be opened through the query string, for example
`?tab=voti`.

Credentials are never written to disk, they are only used once to get a token.
Tokens, profile and downloaded data go to `dati/sessioni.json` (mode 600,
ignored by git) so they survive restarts. The cookie lasts 180 days and the Argo
token renews itself with the refresh token.

## Deploying on Netlify

`netlify.toml` publishes `public/` and routes `/api/*` to
`netlify/functions/api.js`, which exposes the same three endpoints as
`server.js`. Functions are stateless, so there is no `dati/sessioni.json`
there. The session (Argo tokens, login data and a slice of the profile) lives in
an encrypted cookie and the dashboard is downloaded again on every request.

One environment variable is required in the Netlify site settings:

```
SESSION_SECRET=<a long random string, e.g. openssl rand -hex 32>
```

Change it and every phone has to log in again. Since Netlify serves over HTTPS
the PWA can be installed from there.

## Installing it on a phone (PWA)

`public/manifest.webmanifest`, the icons and `public/sw.js` make the app
installable, but browsers only allow that over HTTPS. On a plain IP you get the
usual "Add to home screen" instead. You need a domain with a certificate, for
example Caddy in front of the server.

## How the average is computed

Argo exposes `mediaGenerale` and `mediaMaterie`, but when the school disables
them they come back empty, so the average is recomputed from the single grades
in `public/app.js` (`calcolaMedie`).

A grade counts when it has a numeric value above 0 and Argo does not exclude it
(`numMedia !== 0` and `faMenoMedia !== 'S'`). Excluded grades are marked "non in
media" in the list, and the "conta tutti i voti" switch in the Media tab lets
you compare the two versions.

The app shows the overall average (mean of every grade), the mean of the subject
averages, one average per subject split into written and oral, and a monthly
trend.

## Useful endpoints (for later)

| Endpoint | Content |
| --- | --- |
| `dashboard/dashboard` | grades, homework, notice board, absences, reminders, averages |
| `dettaglioprofilo` | personal details |
| `orario-giorno` | timetable of the day |
| `votiscrutinio` | report cards |
| `ricevimento` | parent teacher meetings |
| `downloadallegatobacheca` | notice board attachments |
