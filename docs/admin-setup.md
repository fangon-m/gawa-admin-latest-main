# Admin portal setup — roles, accounts and the database

## The one-paragraph version

Team membership is stored in `users_table.role` — that is where it lives
today — and is read by the server from the first source that has it:

1. the `user_roles` table, if it exists;
2. `auth.users.app_metadata.gowa_role`, written by the server with the
   service role;
3. `users_table.role`.

Only `admin` and `customer_support` count as team roles. The comparison is
case-insensitive and ignores surrounding whitespace, so the consumer roles the
mobile app writes — `Client`, `client`, `Talent`, `talent`, `Contractor`,
`contractor`, `Equipment Owner`, `equipment_owner` — are all treated as
consumer accounts and are refused by every admin endpoint. A consumer is
blocked on all 12 of them; an admin reaches all 12; a support agent reaches
the 7 that are not admin-only.

---

## Why this exists

The server code has always referenced a `roles` and a `user_roles` table, but
neither was ever created in the database. Role membership therefore lived
only in `users_table.role`.

Two things follow from that:

1. **The role tables are still worth creating.** They give the role a proper
   home, they let an administrator assign a role without editing a profile
   row, and they let the server read the role without trusting a column that
   the consumer app also writes to.
2. **The server needs a source that works today.** Until the migration is
   applied, the role is read from `users_table.role` and from the
   server-managed `auth.users.app_metadata`.

### Is `users_table.role` safe to trust?

Yes, today, because the row level security policies on `users_table` stop an
account from writing its own `role`. This was verified against the live
database: a signed-in consumer updating its own `role` to `admin` affects zero
rows, and so does updating somebody else's.

The weakness is not that the column is writable — it is that the policies
protecting it are not in the repository. They live in the database and are not
reviewed or version-controlled.

The API provides an independent guarantee: `PATCH /api/users/:id` writes an
allow-list of fields, and `role` is not on it. That is covered by
`server/controllers/__tests__/roleWriteProtection.test.js`.

> A `CHECK` constraint on `users_table.role` was deliberately **not** added.
> The mobile app owns the consumer roles and writes them in mixed case
> (`Client` and `client`, `Talent` and `talent`, `Equipment Owner` and
> `equipment_owner`), and it adds new ones over time. A constraint that has to
> enumerate them all would break the mobile app the first time it adds a
> value. The server restricts the roles it accepts to `admin` and
> `customer_support` in `server/utilities/permissions.js`, which is the right
> place for that rule.

---

## Step 1 — apply the migration (once)

`server/db/migrations/20261112_missing_admin_tables.sql` creates the seven
tables the server references but that do not exist:

| Table | Used by |
|---|---|
| `roles`, `user_roles` | role assignment, `/api/roles/*` |
| `app_settings` | `/api/settings`, moderation windows |
| `check_ins` | `/api/jobs/check-in/*` |
| `entity_flags` | flagging jobs, listings, rentals, users |
| `fee_configs` | `/api/fee-config` |
| `user_notes` | notes on a user |

Paste the file into the **Supabase SQL Editor** and run it. It is idempotent,
so it is safe to run twice.

It is **purely additive**: it creates new tables and seeds them, and does not
alter a single existing table or column. `server/db/schema.sql` is not
affected.

Row level security is enabled only on the new tables the mobile app has no
reason to touch (`roles`, `user_roles`, `app_settings`, `entity_flags`,
`user_notes`). `check_ins` and `fee_configs` are left open on purpose — the
mobile app writes check-ins and reads the fee configuration.

> There is one live exposure this migration does **not** close, by design:
> with RLS off on `users_table`, the anon key in the mobile app can read the
> whole table — every user's email, phone, address, date of birth and role —
> with no session at all. The fix is written out in the optional section at
> the end of the migration file, with the notes on what it would change for
> the mobile app. It needs a decision about the mobile app first, so it is
> not applied automatically.

---

## Step 2 — copy the existing role assignments

```bash
npm run db:seed-roles            # add -- --dry-run to preview
```

This copies the role already recorded on each `users_table` profile into
`auth.users.app_metadata.gawa_role` (and, once the migration is applied, into
`user_roles`). It only ever writes the role the profile already claims, and
only for accounts whose role is `admin` or `customer_support`.

It is safe to run repeatedly, and it is **optional** — the server reads the
profile row directly until the role table exists.

---

## Step 3 — make sure an account can sign in

An account needs three things to reach the admin portal:

1. an auth account with a known password,
2. a `users_table` profile row — the server refuses to issue a session without
   one, and
3. a team role.

```bash
npm run account:ensure -- --email=you@example.com --role=admin
```

This creates or repairs all three. With no `--password` a strong password is
generated and printed **once**:

```
  email    : you@example.com
  role     : admin
  password : <generated>
             (generated — store it now, it is not shown again)
```

Change the password afterwards from the portal's Settings page.

---

## Checking the setup

The server checks the role plumbing on every boot and prints a warning if
something is missing:

```
  [Security] The role tables (roles, user_roles) do not exist in the database.
             Roles are currently read from auth.users.app_metadata.
             Apply server/db/migrations/20261112_missing_admin_tables.sql, then run:
               node scripts/seed-team-roles.js
```

or

```
  [Security] These team accounts have no role row and will see an empty portal:
               - someone@example.com
             Fix with: node scripts/seed-team-roles.js
```

To check by hand:

```sql
-- must return no rows: staff without a role assignment
select u.email, u.role from public.users_table u
  where u.role in ('admin','customer_support')
  and not exists (select 1 from public.user_roles ur where ur.user_id = u.id);

-- the team roster
select r.role_name, count(*) from public.user_roles ur
  join public.roles r on r.role_id = ur.role_id group by r.role_name;
```

---

## Adding a team member

The portal's Team page sends an invitation email. The invitee chooses their own
password and the account is created with:

- `users_table.role` — the role, for display and for the mobile app;
- `auth.users.app_metadata.gawa_role` — the role the server prefers;
- a `user_roles` row — the role, once the migration is applied.

All three are written by the server with the service role, never by the
invitee.

---

## Environment variables the server needs

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | **yes** | `development`, `production` or `test`. The server refuses to start without it. Use `npm start` / `npm run dev`. |
| `TRUST_PROXY_HOPS` | in production behind a proxy | Number of proxies in front of the app. Left unset, `X-Forwarded-For` is ignored, so a client cannot spoof its address and walk past the rate limiters. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | yes | The service-role key is server-side only and must never ship in the client bundle. |
| `INVITE_TOKEN_PEPPER` | in production | 32+ characters. |
| `EMAIL_PROVIDER` | in production | `smtp`, `sendgrid` or `ses`. `console` is refused. |
