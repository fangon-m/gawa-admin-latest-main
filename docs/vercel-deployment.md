# Deploying to Vercel

The admin portal is a monolith: an Express API (`server/`) and a Vite/React
client (`client/`). Vercel runs functions, not long-lived processes, so the
deployment keeps the same Express app but hosts it as a single serverless
function and serves the built client as static assets.

| | |
|---|---|
| Production URL | https://gawa-admin.vercel.app |
| Project | `dainiel1/gawa-admin` |
| Frontend | static bundle from `npm run build` → `dist/` |
| Backend | `api/index.js` (Express app), plus `api/[...path].js` fallback |
| Database | Supabase, reached with the service-role key from the env vars |

---

## How the pieces fit

```
/api/*                    → api/index.js      (the whole Express app: server/server.js)
/api/cron/sweeps          → api/cron/sweeps.js (scheduled maintenance, see below)
everything else           → dist/ static files, with SPA fallback to index.html
```

`vercel.json` holds the routing:

- `/api/(.*)` → `/api` rewrites every API path into the Express app. Express
  still sees the original URL, so its own routers (`/api/auth/login`,
  `/api/matches/:id/completions`, …) work unchanged.
- `/((?!api/).*)` → `/index.html` is the React Router fallback, so a deep link
  such as `/users/123` loads the app instead of 404ing.
- `installCommand` uses `--include=dev`: the project sets `NODE_ENV=production`,
  and plain `npm install` would skip Vite and fail the build with exit 127.

Nothing in `server/` was rewritten for this. `api/index.js` only sets
`NODE_ENV` before requiring the app and exports it instead of calling
`app.listen`.

---

## Environment variables

All of these are set on the Vercel project for **Production** and **Preview**:

| Variable | Value |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | from the Supabase project |
| `JWT_SECRET` | from `server/.env` |
| `INVITE_TOKEN_PEPPER` | from `server/.env` (32+ chars, required in production) |
| `EMAIL_PROVIDER`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | from `server/.env` |
| `MAIL_FROM`, `MAIL_REPLY_TO`, `SUPPORT_EMAIL` | from `server/.env` |
| `NODE_ENV` | `production` |
| `TRUST_PROXY_HOPS` | `1` — Vercel's edge sits in front of the function |
| `CORS_ORIGINS` | `https://gawa-admin.vercel.app,http://localhost:3000` |
| `FRONTEND_URL`, `INVITE_LINK_BASE_URL` | `https://gawa-admin.vercel.app` |
| `CRON_SECRET` | random 32-byte hex; authenticates the cron endpoint |

Change any of them with:

```bash
vercel env add NAME --environment production --force
vercel deploy --prod
```

`PORT` is deliberately not set: Vercel assigns it, and the server reads it from
the environment.

---

## Background work (what setInterval used to do)

`server/server.js` drives four pieces of background work that only make sense
in a process that stays alive: expired completion reviews, expired suspensions,
the moderation warning sweep, and the one-off archive reconcile. On Vercel
those timers never fire, so the same one-shot ticks are exposed at:

```
GET /api/cron/sweeps?task=reviews      # release/auto-confirm expired reviews
GET /api/cron/sweeps?task=suspensions  # lift suspensions that have expired
GET /api/cron/sweeps?task=moderation   # warn → comply → suspend lifecycle
GET /api/cron/sweeps?task=archive      # re-stamp archived accounts' content
GET /api/cron/sweeps                   # all of the above
```

It requires `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends this
automatically once the variable exists) or `?secret=`. Without the secret the
endpoint answers `401`, which is the point: it releases escrow and suspends
accounts.

**Hobby plan limitation.** Vercel cron on Hobby may only run once per day, so
`vercel.json` schedules `0 3 * * *`. The long-running server used to do this
every 5 minutes. If the tighter cadence matters, either upgrade the project to
Pro and change the schedule to `*/5 * * * *`, or point an external scheduler
(cron-job.org, GitHub Actions, EasyCron) at:

```
https://gawa-admin.vercel.app/api/cron/sweeps?secret=$CRON_SECRET
```

---

## Deploying changes

```bash
vercel deploy --prod
```

`vercel link` failed to connect the GitHub repository during setup (the CLI
could not verify access), so pushes do not deploy on their own. To enable that:

```bash
vercel git connect
```

---

## Serverless caveats worth knowing

- **Rate limits are per instance.** `express-rate-limit` keeps counters in
  memory. Each warm function instance has its own counters, and instances are
  recycled, so limits are weaker than on a long-running server. The login
  limits still work; they just do not aggregate across instances.
- **Cold starts.** The first request after an idle period pays for loading
  Express + Supabase (~1–2 s). Subsequent requests are fast.
- **60 s ceiling.** `vercel.json` sets `maxDuration: 60`. A very large
  assessment-question import is the only endpoint anywhere near that.
- **No sticky sessions needed.** Auth is a bearer token, not a server-side
  session, so any instance can serve any request.
- **Region.** Functions run in `iad1` by default. If the Supabase project is in
  another region, set `"regions": ["sin1"]` (or the matching region) in
  `vercel.json` to cut database latency.
