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

Every call carries an `argo-client-version` header and Argo refuses anything
older than the current store release with "E' necessario scaricare l'ultima
versione presente negli store". When that message shows up at login, raise
`CLIENT_VERSION` in `argo.js` (or set `ARGO_VERSION` in the environment) until
the call goes through: only the minimum matters, the major must stay at 1.

`server.js` is a small proxy. The Argo API sends no CORS headers, so the browser
cannot call it directly. The server keeps sessions and serves `public/`.

`public/` is the UI, plain HTML and JS with Tailwind from the CDN. Home with the
average and upcoming events, monthly calendar, homework, grades per subject,
averages. A tab can also be opened through the query string, for example
`?tab=grades` (tabs: `home`, `calendar`, `homework`, `timetable`, `grades`,
`average`).

Credentials are never written to disk, they are only used once to get a token.
Tokens, profile and downloaded data go to `data/sessions.json` (mode 600,
ignored by git) so they survive restarts. The cookie lasts 180 days and the Argo
token renews itself with the refresh token.

## Homework done flags and notes

In the Compiti tab every homework item has a check button (done) and a pencil
(a personal note), and four filters: In arrivo, Tutti, Da fare, Fatti. The day
chip is grey for past days, violet for today, amber for the next three days and
blue after that. Done items get a green row and are skipped by the "da fare"
counters on the home page. The calendar shows the same buttons in the day panel
and turns the homework dot green once everything of that day is done.

Argo gives homework no id, so each item is keyed by due day, subject and a hash
of the text (`homeworkKey` in `public/app.js`). If the teacher edits the text
the flag is lost, nothing worse.

The state goes through `/api/homework` (`GET` returns everything, `PUT` saves
one item as `{ key, done, note }`) and is stored by `store.js`:

- with `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` set, in the Supabase table
  `homework` (`supabase/schema.sql`, run it once in the SQL editor);
- otherwise on the VPS in `data/homework.json`;
- on Netlify without Supabase the endpoint answers 503 and the browser keeps
  the state in `localStorage` only, with a small warning in the tab.

The browser always mirrors the state in `localStorage`, so the list is right on
the first paint and clicks feel instant.

A free Supabase project pauses after seven days without activity. Two things
keep it awake, both calling the `keepalive_ping()` function from the schema:
the scheduled Netlify function `netlify/functions/keepalive.js` (daily, see
`netlify.toml`) and the GitHub workflow `.github/workflows/keepalive.yml`
(daily, needs the `SUPABASE_URL` and `SUPABASE_ANON_KEY` repo secrets). The VPS
server pings it too every three days.

## Timetable

The Orario tab is a weekly timetable, monday to friday, typed in by hand: for
each day a list of "from HH:MM to HH:MM, subject" slots. Subjects known from
Argo are offered as autocomplete. On the phone one day at a time (today by
default, monday on weekends), on desktop the five days side by side. The slot
running right now is highlighted.

The day opens by itself: today until 15:00, the next school day from 15:00 on
(so on a wednesday afternoon you already see thursday, and on weekends monday).
That day also gets the violet dot, and the homework under each subject counts
from it. An app left open in the background moves on by itself when it comes
back on screen. A horizontal swipe moves between days. Leaving the tab forgets
the day you swiped to. The same gesture moves between filters in Compiti and
between months in Calendario.

Under a subject, when homework of that subject is due on the next date falling
on that weekday, the beginning of its text shows up and leads to the Compiti
tab. Argo and the hand typed names rarely match exactly, so each homework goes
to the closest subject taught that day (`subjectScore` in `public/app.js`).

It travels as a whole through `/api/timetable` (`GET` and `PUT`, the week as
`{ mon: [{ start, end, subject }], ... fri }`) and is stored by `store.js` next
to the homework state: the `timetable` table on Supabase, one row per student
with the week as JSON, or `data/timetable.json` on the VPS, with the same
`localStorage` mirror and the same 503 fallback as the homework state.

A database created before the tables had English names (`compiti`, `orario`)
gets its rows copied over by `supabase/migrate-english-names.sql`, to run once
after `schema.sql`.

## Deploying on Netlify

`netlify.toml` publishes `public/` and routes `/api/*` to
`netlify/functions/api.js`, which exposes the same endpoints as
`server.js`. Functions are stateless, so there is no `data/sessions.json`
there. The session (Argo tokens, login data and a slice of the profile) lives in
an encrypted cookie and the dashboard is downloaded again on every request.

Environment variables in the Netlify site settings:

```
SESSION_SECRET=<a long random string, e.g. openssl rand -hex 32>   # required
SUPABASE_URL=https://<project>.supabase.co                          # homework state
SUPABASE_SERVICE_KEY=<service role key>                             # homework state
```

Change `SESSION_SECRET` and every phone has to log in again. Since Netlify serves over HTTPS
the PWA can be installed from there.

## Installing it on a phone (PWA)

`public/manifest.webmanifest`, the icons and `public/sw.js` make the app
installable, but browsers only allow that over HTTPS. On a plain IP you get the
usual "Add to home screen" instead. You need a domain with a certificate, for
example Caddy in front of the server.

## How the average is computed

Argo exposes `mediaGenerale` and `mediaMaterie`, but when the school disables
them they come back empty, so the average is recomputed from the single grades
in `public/app.js` (`computeAverages`).

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
