# AGENTS.md — GAWA Admin Portal

Monolithic full-stack admin portal. One npm project, no workspace tooling.

## Layout

- `client/` — Vite React 18 SPA. Vite `root` is `client/`, entry `client/index.html` → `client/src/main.jsx`. Build output is repo-root `dist/`.
- `server/` — Express 4 (CommonJS, `require`). Entry `server/server.js`, routes mounted in `server/routes/index.js`, all queries via `server/db/supabase.js`.
- `shared/` — **dead code**, nothing imports it. Don't build on it.
- `server/db/schema.sql` — documentation of the live DB only. There is no migration runner.

## Scope

This repo is the **admin portal only**. GAWA also has a separate mobile client app; feature requests may target that app, and things not required on admin (mobile flows, consumer onboarding, push notifications) should not be built here. Confirm the surface before implementing.

## Commands

```bash
npm run dev          # concurrently: server (4000) + vite (3000, proxies /api -> 4000)
npm run dev:server   # node --watch server/server.js
npm run dev:client   # vite only
npm run build        # -> dist/  (root, NOT client/dist)
npm start            # NODE_ENV=production node server/server.js  (POSIX env syntax; fails in cmd/pwsh)
npm test             # vitest run && jest   (both runners, sequential)
npm run test:client  # vitest — client/src only
npm run test:server  # jest — server only
```

- **No lint, typecheck, format, or codegen scripts exist.** No ESLint, Prettier, or TypeScript. Don't invent `npm run lint`; verify with `npm run build` + the tests.
- Single test file: `npx vitest run client/src/api/client.test.js` or `npx jest server/routes/__tests__/server.test.js`.
- Single server: `node server/server.js` (or `npm run dev:server`).

## Test runner split (don't mix them up)

| Runner | Env | Picks up |
|---|---|---|
| vitest (`vitest.config.js`) | jsdom | `client/src/**/*.test.{js,jsx}` only |
| jest (`jest.config.cjs`) | node | `server/{controllers,routes}/**/__tests__/**/*.test.js` only |

A test placed in the wrong tree is silently never run. Server tests must set `process.env.JWT_SECRET` / `SUPABASE_*` at the top of the file *before* requiring the server, and `jest.mock('../../db/supabase', ...)` — the real module connects to the live DB on import.

## Environment

- `dotenv.config()` with no path → loads `.env` from **process.cwd()**. There are two gitignored env files: root `.env` and `server/.env`. `npm run dev:server` from the repo root loads the root one.
- `NODE_ENV=production` hard-exits if `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, or `SUPABASE_SERVICE_ROLE_KEY` are missing.
- In development, missing Supabase creds silently install a no-op stub that resolves every query to `{ data: null, error: null }` — symptoms look like "empty tables", not "misconfigured".
- Live Supabase project is linked (`supabase/.temp/`, project ref `boxxslvuzeycmkyjkpuf`). The server writes to it with the service-role key (RLS bypassed). Treat any server-side change as a real DB mutation.

## Auth

- Dev shortcut: `server/middleware/auth.js` accepts the literal bearer `gawa-local-admin-token` and synthesizes an `admin` user. `client/src/context/AuthContext.jsx` prefills `gawaadmin@email.com` / `gawaadmin123` and uses that token, so **the default local login never hits Supabase auth**.
- Client `client/src/api/client.js`: base URL is `import.meta.env.VITE_API_URL || '/api'`. On any 401/403 it attempts one `/auth/refresh` retry, then dispatches a `auth:expired` window event and clears storage. Errors are thrown as plain objects `{ status, ...body }`, not `Error` — don't assume `err.message` exists.

## Permissions live in three places

Adding an action requires all of them, or it silently disappears for `customer_support`:

1. `server/middleware/roles.js` — `authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT)` on the route, plus `SUPPORT_RESTRICTED_ACTIONS` if support must be blocked. Roles come from `user_roles`/`user_roles.role_name`, with a legacy `role` column fallback.
2. `client/src/utils/permissions.js` — the `PERMISSIONS` map consumed by `usePermissions(user).can('x')`.
3. `client/src/App.jsx` `ProtectedRoute requiredPermission="..."` and/or `client/src/components/layout/Sidebar.jsx` nav visibility.

## Server conventions

- Route file = `require` a controller, chain `authenticate` → `authorize(...)` → `validate(schemas.x)` → handler. See `server/routes/rentals.js`.
- `server/middleware/validate.js` holds a shared Zod `schemas` object; `validate` parses **body**, `validateQuery` parses **query**. Schemas are registered there, not in the route file.
- Every non-GET response is auto-logged to `incident_logs` by `auditMiddleware`. You do not add audit calls by hand; controllers may log additionally.
- Background timers run inside the server process: auto-process expired job reviews every 5 min after a 30s warmup (`server.js`), and a 4-min Supabase reconnect check (`server/db/supabase.js`). Set `DISABLE_AUTO_REVIEWS=true` to stop the first. These keep the process alive and hit the live DB — relevant when scripting against the server.
- Rate limits: `/api` = 100 req / 15 min, `/api/auth` = 20 req / 15 min, per IP. Repeated manual API testing will trip these.

## Client conventions

- Styling is global CSS, not a framework: `client/src/styles/{variables,global,layout,components,pages}.css`, all imported in `main.jsx`. Tokens (`--space-*`, `--color-*`, `--radius-*`, `--text-*`, `--transition`) live in `variables.css` — use tokens, no arbitrary pixel values.
- Class names are kebab-case with a domain prefix (`um-`, `dp-`, `tx-`, `as-`, `msg-`, `notif-`, `sk-`, …). `design.md` is the binding UI spec (layout anatomy, breakpoints, badge system). Read it before adding UI.
- A few newer pages use CSS Modules (`Dashboard.module.css`, `Assessments.module.css`, `Messages.module.css`, `TakeAssessment.module.css`) — mixed convention, follow the file you're editing.
- Data fetching goes through `client/src/api/client.js` wrappers plus `useApiData` / `useMutation` from `client/src/utils/useApiData.js`. `client/src/api/index.js` re-exports most modules but **not all** (e.g. `settings`, `dashboard`, `completions`, `notifications`, `jobReviewQueue` are imported directly by pages).
- Pages are lazy-loaded in `App.jsx`; every page is huge (10k–49k lines of JSX) — read before assuming a component is reusable.

## Known mismatch

`npm run build` emits to repo-root `dist/`, but `server/server.js` serves `client/dist` in production. `npm start` therefore serves no static assets. Either side is wrong; verify before assuming a deploy works.

## Communication Rules
- You MUST answer concisely with fewer than 4 lines of text (excluding code).
- Provide raw, working code directly. 
- NO elaboration, NO explanations, and NO conversational filler.
- NO enthusiastic, exaggerating, or robotic introductions/conclusions (e.g., "Here is the code!", "Great question!").
- Code-only answers are preferred unless explicitly asked for an explanation.

## Other context

- `Dainiel.md` — changelog of the last feature/schema-alignment pass. Read before touching rentals, reviews, flags, or reports; it records which operations are hard deletes and which write audit logs.
- `FUNCTIONALITIES.md` — auth/users/verifications behavior notes.
- `design.md` — UI design system spec.
- Git: branches `main` and `Dainiel` (currently checked out). No CI, no pre-commit hooks, terse commit messages.
