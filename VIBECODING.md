# AI Context — GAWA Admin Portal (repo: `gawa-admin`)

> **READ THIS FILE BEFORE MAKING ANY CODE CHANGE.** You are an AI coding agent working on this project.
> Follow the architecture map and the HARD CONSTRAINTS below exactly. They exist to prevent the
> recurring errors this codebase is prone to (broken auth, missing validation, hardcoded styles,
> leaked secrets, route-ordering bugs, raw SQL in controllers).

This repo's product is the **GAWA Admin Portal** — an internal back-office SPA + REST API for
operating a talent/equipment rental marketplace. The code-name used by the owner is "Vibecoding",
but the code, packages, and config are all `gawa-admin` / GAWA. Do not rename packages or files.

---

## 1. Tech Stack (do not introduce alternatives without permission)

| Layer | Tech | Notes |
|---|---|---|
| Frontend | React 18, React Router 6, Vite 5 | ES Modules (`"type": "module"`) |
| Charts | Recharts 2 | Only charting lib |
| Icons | lucide-react 1 | Only icon lib |
| Backend | Node.js + Express 4 | CommonJS (`require`) |
| Validation | Zod 4 | Mandatory for request bodies/queries |
| DB | Supabase (PostgreSQL) | Accessed ONLY via `@supabase/supabase-js` client |
| Tests | Vitest + Testing Library (fe), Jest + Supertest (be) | |

Do NOT add new frameworks (e.g. Redux, TypeScript, Prisma, axios) unless explicitly asked.

---

## 2. Monorepo Layout

```
gawa-admin/
├── package.json            # root workspace: runs frontend + backend concurrently
├── frontend/               # React SPA (Vite)
│   ├── index.html, vite.config.js, vitest.config.js, .env
│   └── src/
│       ├── main.jsx, App.jsx         # bootstrap + router/provider tree
│       ├── api/                      # one module per domain (auth.js, users.js, jobs.js, ...)
│       │   ├── client.js             # BASE fetch wrapper (token, refresh) — USE THIS
│       │   └── index.js
│       ├── components/
│       │   ├── common/               # DataTable, StatCard, FilterBar, ConfirmModal, badges...
│       │   └── layout/               # Layout, Sidebar, Header, Breadcrumbs
│       ├── context/                  # AuthContext, NotificationContext, SidebarContext
│       ├── pages/                    # route screens (Dashboard, Users, Jobs, ...)
│       ├── styles/                   # variables.css (TOKENS), global/layout/pages/components css
│       └── utils/                    # helpers, permissions, useApiData hook
├── backend/                # Express REST API (Node)
│   ├── server.js           # bootstrap: helmet, cors, morgan, rate-limit, auditMiddleware, scheduler
│   ├── config/index.js     # env-driven config + required-env check
│   ├── db/supabase.js      # Supabase client singleton (service_role) — ONLY DB access point
│   ├── routes/             # one router per domain (users.js, jobs.js, transactions.js, ...)
│   ├── controllers/        # request handlers per domain
│   ├── services/           # (exists; logic mostly still in controllers — extract here when refactoring)
│   ├── models/             # data-access helpers
│   ├── middleware/         # auth.js, roles.js, validate.js, auditLogger.js
│   ├── utilities/helpers.js
│   └── .env                # secrets — NEVER edit or commit
├── supabase/migrations/    # versioned SQL migrations (source of truth for schema)
└── Views/pages/            # design mockups (reference only)
```

### Data flow (respect it)

```
Frontend  src/api/<domain>.js  ──►  src/api/client.js (fetch + auto token refresh)
        │
        ▼  HTTP /api/*
Backend   routes/<domain>.js
        │  middleware order: authenticate → authorize(ROLES.*) → validate(schemas.*)
        ▼
        controllers/<domain>.js  ──►  db/supabase.js  (Supabase)
        │  (auditMiddleware logs all non-GET mutations automatically)
```

---

## 3. HARD CONSTRAINTS (violating any of these causes bugs/security issues)

### Secrets & ignored files
- **NEVER** read, edit, print, or commit `.env`, `.env.local`, `.env.production`, `accesstoken`, or `*.log`. These are gitignored and contain credentials. If you need an env value to function, read it from `config/index.js` / `import.meta.env`, never hardcode it.
- Never write secrets into source files or the frontend bundle.

### Backend — validation (Zod)
- Every route that reads `req.body` MUST be wrapped with `validate(schemas.<name>)`; every route reading `req.query` MUST use `validateQuery(schemas.<name>)`.
- Reuse existing schemas in `backend/middleware/validate.js`. If a schema is missing, ADD it there (with `.email()`, `.min()`, `.uuid()` as appropriate) — do NOT validate by hand with `if` statements.
- `validate` replaces `req.body`/`req.query` with the parsed/coerced value; trust `req.body` after it.

### Backend — auth & authorization
- Every endpoint that should require login MUST have `authenticate` (from `middleware/auth.js`).
- Admin-only endpoints MUST also have `authorize(ROLES.ADMIN)`.
- Roles: `ROLES.ADMIN = 'admin'`, `ROLES.CUSTOMER_SUPPORT = 'customer_support'` (from `middleware/roles.js`).
- Customer-support agents are BLOCKED from `SUPPORT_RESTRICTED_ACTIONS` (includes `suspendUser`, `reinstateUser`, `deleteAccount`, `revokeVerification`, `removeJob`, `removeListing`, `issuePoints`, `deductPoints`, `managePacks`, `finalizeAppeal`, `exportIncidents`, `viewFinance`, `viewAuditLogs`). Do not grant them these.
- Do NOT weaken `authenticate` (it verifies the Supabase JWT via the anon client, then enriches `req.user` from `users_table` + `user_roles` using the service client).

### Backend — security middleware (server.js)
- Do NOT remove or disable `helmet`, `cors`, `morgan`, or the two `express-rate-limit` limiters (general 100/15min, auth 20/15min).
- Do NOT remove `auditMiddleware` — it logs all non-GET mutations. New mutating endpoints are covered automatically.
- DB access ONLY through `backend/db/supabase.js`. Do NOT write raw SQL strings in controllers; use the Supabase query builder (`supabase.from('table').select/insert/update/delete`).

### Backend — route ordering
- In `routes/<domain>.js`, define specific static routes (e.g. `GET /escalation/list`) BEFORE parameterized routes (`GET /:id`) so Express does not capture them as `:id`. This is already a bug-prone spot — preserve existing ordering when editing.
- New domains must be mounted in `routes/index.js`.

### Frontend — API calls
- All HTTP goes through `src/api/client.js` helpers: `get/post/patch/put/del`. Do NOT use `fetch` or `axios` directly in pages/components.
- Base URL is `import.meta.env.VITE_API_URL || '/api'`. Do not hardcode host/port.
- Token storage + 401 auto-refresh are handled inside `client.js`. Do NOT re-implement auth headers or token logic; just call the helpers.
- Add a domain module under `src/api/<domain>.js` that imports from `client.js`; export through `src/api/index.js`.

### Frontend — styling (design tokens ONLY)
- Use ONLY CSS custom properties from `src/styles/variables.css`:
  `--color-*`, `--color-accent`, `--color-success/error/warning/blue`, `--color-sidebar-*`,
  `--space-1..12`, `--radius-*`, `--text-*`, `--shadow-*`, `--transition`, `--font-sans/mono`.
- **NEVER hardcode hex/rgba values** in component CSS. The only place raw colors live is `variables.css`.
- Class naming: **kebab-case with domain prefix** — `um-` (users), `dp-` (disputes), `tx-` (transactions), `as-` (assessments), `msg-`, `notif-`, `ann-`, `bn-`, `sk-` (skeleton). No ad-hoc class names.
- Preserve page anatomy:
  - List page: `page-head → stats → panel(filters + search + table + pagination)`.
  - Detail page: `toolbar → header → stats → body(main + sidebar)`.
- Accessibility: focus-visible outline `2px solid var(--color-accent)`; status shown by text+color (never color alone); animations 150–250ms; respect `prefers-reduced-motion`.

### Job-completion scheduler (server.js)
- `server.js` auto-processes expired completion reviews 30s after boot, then every 5 min. It inserts transactions and updates `job_matches`/`job_posts`/`job_completion`.
- Do not delete or alter this scheduler. It can be disabled in dev via env `DISABLE_AUTO_REVIEWS=true`.
- Do not change the port auto-increment logic unless fixing a real bug.

---

## 4. Adding a Feature — Follow This Recipe

### New backend endpoint (domain already exists, e.g. jobs)
1. Add route in `backend/routes/<domain>.js` (mind `/:id` ordering; add `authenticate`/`authorize`/`validate` as needed).
2. Add/extend the Zod schema in `backend/middleware/validate.js` and reference it.
3. Implement handler in `backend/controllers/<domain>.js` using `db/supabase.js`.
4. If new business logic is substantial, put it in `backend/services/` and keep the controller thin.

### New backend domain (e.g. "reports")
1. Create `routes/reports.js`, `controllers/reports.js`, add Zod schemas.
2. Mount in `routes/index.js` (e.g. `router.use('/reports', require('./reports'))`).
3. Co-locate any DB helpers in `models/` if needed.

### New frontend page
1. Create `src/pages/<Name>.jsx` (+ optional `.module.css` reusing tokens).
2. Create `src/api/<domain>.js` exporting functions built on `client.js`; re-export in `src/api/index.js`.
3. Add the route in `src/App.jsx` inside the protected layout; reuse `components/common/*` (DataTable, StatCard, FilterBar, Pagination, ConfirmModal, StatusBadge).
4. Respect the list/detail anatomy and design tokens.

---

## 5. Required Environment Variables (backend, enforced in `config/index.js` for production)
`JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
Frontend reads `VITE_API_URL` (optional; defaults to `/api`).

---

## 6. Commands

```bash
npm run install:all     # install frontend + backend deps
npm run dev             # run both (concurrently): frontend :5173, backend :4000+
npm run dev:fe          # frontend only
npm run dev:be          # backend only (node --watch)
npm run build           # build frontend to frontend/dist
npm run preview         # preview production frontend build

# tests
npm run test --prefix frontend   # vitest
npm run test --prefix backend    # jest + supertest
```

---

## 7. Pre-Change Verification Checklist (run before saying "done")
- [ ] No `.env` / `accesstoken` / `*.log` read, printed, or committed.
- [ ] New/changed backend routes use `authenticate` (+ `authorize` where needed) and `validate`/`validateQuery` with a real Zod schema.
- [ ] No raw SQL in controllers; DB access via `db/supabase.js`.
- [ ] `helmet`/`cors`/rate-limit/`auditMiddleware` untouched in `server.js`.
- [ ] Frontend uses `src/api/client.js` only; no hardcoded URLs or tokens.
- [ ] No hardcoded colors; only tokens from `variables.css`; class names use domain prefixes.
- [ ] Both test suites pass: `npm run test --prefix frontend` and `npm run test --prefix backend`.
- [ ] Frontend builds: `npm run build`.

---

*Owner is a vibe-coder; this file is the authoritative guardrail. When unsure, prefer the existing
pattern in a neighboring file over inventing a new one.*
