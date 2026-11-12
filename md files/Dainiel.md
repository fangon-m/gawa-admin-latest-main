# GAWA Admin — Changes & Added Features

## Schema Alignment (Phase 1)

### Equipment Listing Skills
- Renamed `equipment_listing_skill` → `equipment_listing_skills` across all code + schema.sql

### Reviews — Read-Only
- Server: `listReviews`, `getReviewById` only (no moderate)
- Client: Oversight → Reviews tab (read-only list + detail), SupportDashboard → Recent Reviews
- Removed `moderateReview` permission

### Rentals — Read-Only on `equipment_rentals`
- Live columns: `rental_id`, `listing_id`, `renter_id`, `owner_id`, `start_date`, `end_date`, `total_price`, `security_deposit_paid`, `rental_status`, `created_at`, `updated_at`
- Server: `listRentals`, `getRentalById` on `equipment_rentals`
- Dashboard: `equipment_rentals` + `rental_status = 'active'`
- Client: Rentals page (Jobs-style header/search + Listings-style columns), RentalDetail (live fields only)

### Schema Docs
- `reviews` table → live columns
- Replace `rentals`/`return_records`/`rental_check_ins` → `equipment_rentals`
- `job_completion.supporting_images_url` text → `text[]`

---

## Flag/Report Pipeline (Phase 2)

### Report Decision UI (Oversight)
- Keep / Warn / Remove buttons on report detail (uses existing `moderateReport` permission)
- ConfirmModal for Remove

### "Remove" Decision Acts on Content
- `job` → hard delete `job_posts`
- `listing` → hard delete `equipment_listings`
- `review` → hard delete `reviews` + audit log
- `user` → suspend via `user_suspensions`

### Review Reports
- Migration: add `'review'` to `reports.target_type` check constraint
- Mobile adds report button on reviews

### Direct Admin Review Removal
- `POST /reviews/:id/flag` → `entity_flags`
- `POST /reviews/:id/remove` → hard delete + audit log
- Detail panel: Flag (admin+support) + Remove (admin-only) buttons

---

## Rental Management — Data & Actions

### Seeded Data (6 rows)
| Equipment | Renter | Owner | Days | Price | Deposit | Status |
|---|---|---|---|---|---|---|
| Pipe Wrench Set | Juan Dela Cruz | Daniel Reyes | 3 | ₱750 | ₱500 | completed |
| Extension Ladder 20ft | Jose Ramirez | Angela Cruz | 7 | ₱1,800 | ₱1,000 | active |
| Portable Welding Machine | Roberto Garcia | Rommel Santos | 5 | ₱4,000 | ₱3,000 | active |
| Circular Saw | Maria Santos | Bea Fernandez | 2 | ₱700 | ₱800 | active |
| Concrete Mixer | Pedro Reyes | Daniel Reyes | 14 | ₱10,000 | ₱4,000 | cancelled |
| HVAC Vacuum Pump Kit | Mark Torres | Angela Cruz | 7 | ₱2,200 | ₱1,200 | completed |

- Live constraint allows: `active`, `completed`, `cancelled` only
- Fixed UUIDs `51000000-...`, `ON CONFLICT DO NOTHING`

### Rental Actions (Job-Style)
- `POST /rentals/:id/flag` → `entity_flags` (fallback audit log)
- `POST /rentals/:id/remove` → hard delete + audit log
- Detail page: Flag/Remove buttons with confirm modals
- Permissions: `flagRental` (admin+support), `removeRental` (admin only)

---

## Files Modified

### Server
- `server/controllers/rentals.js` — read-only + flag/remove
- `server/routes/rentals.js` — GET + POST flag/remove
- `server/controllers/dashboard.js:44` — `equipment_rentals` + `rental_status`
- `server/controllers/reviews.js` — read-only
- `server/routes/reviews.js` — removed moderate
- `server/controllers/skills.js`, `listings.js`, `users.js` — plural table name

### Client
- `client/src/api/rentals.js` — flag/remove
- `client/src/api/reviews.js` — removed moderate
- `client/src/pages/Rentals.jsx` — Jobs layout + Listings columns
- `client/src/pages/RentalDetail.jsx` — live fields + Flag/Remove
- `client/src/pages/ListingDetail.jsx` — rental history field mapping
- `client/src/pages/Oversight.jsx` — Reviews tab (read-only)
- `client/src/pages/SupportDashboard.jsx` — Recent Reviews
- `client/src/utils/permissions.js` — removed `moderateReview`, added `flagRental`/`removeRental`

### DB
- `server/db/seed-equipment-rentals.sql` — deterministic, live-constraint-aware
- `server/db/schema.sql` — plural table refs (documentation)

---

## Verification
- `npm run build` ✅
- Grep clean: no `equipment_listing_skill`, `from('rentals')`, `depositStatus`, `return_records`, `rental_check_ins`, `moderateReview`, `totalAmount`
- 6 rentals visible in admin with Flag/Remove actions

---

# Moderation Warning Lifecycle (warn -> 7-day window -> 3-day auto-suspension)

## Behaviour
- `warn` on an `issue_reports` profile report moves the report to `warned`, records
  `warned_at`, `warning_due_at`, `warning_window_days`, `warning_issued_by`, and keeps
  sending the existing chat message (now with the window + suspension terms).
- Compliance is admin-only (`mark_compliant`): the report becomes `resolved`,
  `warning_compliance_flag = true`, and no suspension occurs. Enforced in
  `server/routes/reports.js` (`requireAdminForCompliance`) and inside the RPC.
- The in-process sweep (`server/utilities/moderationWarnings.js`, 30s warm-up then
  every 5 min) sends notification rows and, when `warning_due_at` has passed, calls
  `apply_warning_auto_suspension` which atomically suspends the user for
  `autoSuspendDays`, marks the report `resolved`, and writes an immutable
  `issue_report_action_events` row with `actor_role = 'system'`.
- Notifications are DB rows in `public.notifications` (`entity_type = 'user_account'`,
  unique `dedupe_key`), so re-runs never duplicate: warning, day-3 reminder,
  auto-suspension, compliance. Email/push remain out of scope.
- Suspensions record provenance in `users_table.suspension_source`
  (`manual` | `auto_warning`) and `users_table.suspended_at`.

## Migration order (apply in the Supabase SQL editor)
1. `server/db/migrations/008_moderation_warning_lifecycle.sql`
   (columns, indexes, notification dedupe, immutable audit trigger,
   `execute_issue_report_action` replacement, `apply_warning_auto_suspension`,
   optional `app_settings` seed)
2. `server/db/migrations/009_activity_log_moderation_types.sql`
   (`user_auto_suspended`, `user_warning_complied`)
3. Deploy the server build so the sweep and new routes are active.

Rollback: `server/db/migrations/rollback_008_moderation_warning_lifecycle.sql`
(set `DISABLE_MODERATION_SWEEP=true` and deploy the previous version first, and run
`SET gawa.allow_rollback = 'true';` in the same session - the script refuses to run
otherwise, so it can never be applied alongside `008`/`009` by mistake). It
deletes moderation notifications before restoring the old `entity_type` check and
does not reinstate auto-suspended users; review
`SELECT id, email, suspended_until, suspension_reason FROM public.users_table WHERE suspension_source = 'auto_warning'`
and reinstate deliberately via `POST /api/users/:id/reinstate`. Re-apply the
`execute_issue_report_action` body from `006` after rolling back.
Note: `009` has no rollback script; the previous constraint from `007` must be
restored by hand if `009` is reverted.

## Environment variables
| Variable | Default | Range |
|---|---|---|
| `MODERATION_WARNING_DAYS` | 7 | 1-30 |
| `MODERATION_REMINDER_DAY` | 3 | 1-30 (clamped to window) |
| `MODERATION_AUTO_SUSPEND_DAYS` | 3 | 1-90 |
| `MODERATION_SWEEP_INTERVAL_MS` | 300000 | 1000-3600000 |
| `MODERATION_ENFORCEMENT_ENABLED` | true | `false` to notify only |
| `DISABLE_MODERATION_SWEEP` | unset | `true` to stop the timer |

DB values in `app_settings` (`moderation_warning_window_days`,
`moderation_reminder_day`, `moderation_auto_suspend_days`) override the env
defaults at runtime; the seed uses `ON CONFLICT DO NOTHING` and is skipped when the
table is absent. Bounds are clamped in `server/utilities/moderationWarnings.js`.
The reminder fires when `warned_at + moderation_reminder_day` is reached (evaluated on
each sweep), so changing the setting applies to open warnings without a data patch.
`users_table.suspension_source`/`suspended_at` are written by both the RPCs and
`POST /api/users/:id/suspend` (`manual`).

## API
- `GET /api/reports/:id/warning` (admin + support)
- `GET /api/reports/moderation/metrics?days=30` (admin)
- `GET /api/reports/moderation/health` (admin) - last sweep result, backlog, failures
- `POST /api/reports/:id/actions/mark_compliant` (admin only, `Idempotency-Key` + `If-Match`)
- `GET /api/reports/:id/actions` now returns `reportStatus`, `warning`, and `moderation`
  defaults alongside the permitted actions.

## Operations
- Watch `moderation.auto_suspended` / `moderation.suspension_skipped` log lines and
  `GET /api/reports/moderation/health`: `consecutiveFailures > 0` or a rising
  `dueBacklog` means the sweep is not draining.
- Rate limits still apply (`/api` 100 req / 15 min, `/api/auth` 20 req / 15 min).

## Verification
- `npx jest --testPathIgnorePatterns=appeals.test.js` -> 17 suites / 98 tests pass
- `npx vitest run` -> 12 files / 45 tests pass
- `npm run build` succeeds
- Known pre-existing failure: `server/controllers/__tests__/appeals.test.js` is a
  0-byte file, so a plain `npx jest` (and therefore `npm test`) fails with
  "Your test suite must contain at least one test". Unrelated to this feature.

---

## Temporary Password Reset (admin → team member)

### Behaviour change
`POST /api/users/:id/reset-password` no longer accepts a password. The server
generates the credential, applies it to the Supabase auth user, and emails the
login email plus that password. The password is never returned to the portal and
never written to logs or `activity_log`.

- `PUT`-style manual entry removed from `UserDetail.jsx`; the existing
  "Reset Password" button now opens a confirmation and emails the credential.
- Only `admin` / `customer_support` accounts qualify (`400 NOT_TEAM_MEMBER`);
  archived accounts return `409 USER_ARCHIVED`; missing email `400 NO_EMAIL`;
  auth provider failure `400 RESET_FAILED`.
- Delivery failures still return `200` with `data.delivery = "failed"` so the
  admin can retry or fall back to the one-time reset link.
- Route is rate limited per target account (`TEMP_PASSWORD_MAX_PER_HOUR`, default 3/hour).

### Config
- `TEMP_PASSWORD_LENGTH` (default 12, 10-64)
- `TEMP_PASSWORD_MAX_PER_HOUR` (default 3, 1-20)

### Files
- New: `server/services/tempPasswords.js`, `server/services/emailTemplates/tempPassword.js`
- Changed: `server/controllers/users.js`, `server/routes/users.js`,
  `server/config/index.js`, `server/middleware/validate.js` (dropped
  `schemas.adminResetPassword`), `client/src/api/users.js`,
  `client/src/pages/UserDetail.jsx`
- Tests: `adminTempPassword.test.js`, `tempPasswords.test.js`,
  `tempPasswordTemplate.test.js`, updated `UserDetail.test.jsx`

### Note
In development `EMAIL_PROVIDER` defaults to `console`, so the temporary password
is printed to the server stdout instead of being delivered.

## Verification
- `npx jest --testPathIgnorePatterns=appeals.test.js` -> passes
- `npx vitest run` -> passes
- `npm run build` -> succeeds
- Pre-existing: `server/controllers/__tests__/appeals.test.js` is empty, so plain
  `npx jest` / `npm test` still reports that suite as failed.

## Archived Account Content Visibility

Archiving a user (archive + auth ban) no longer leaves their content in active views.
Job posts and proposals are hidden by archive markers (status untouched); equipment
listings are additionally flipped to `unavailable`, which is what the mobile app
reads. Unarchiving reverses both.

### Archive / unarchive markers
- `POST /users/:id/archive` stamps `job_posts.client_archived_at` for the client's
  posts, `job_proposals.proposer_archived_at` for talent and contractor proposals,
  and stamps `equipment_listings.archived_at` + flips its status from `available`
  to `unavailable` (the signal the mobile app reads). Response gains
  `archivedContent: { jobPosts, proposals, listings }`.
- `POST /users/:id/unarchive` clears the marker stamped with that same
  `archived_at` (so posts the owner archived themselves are left alone) and
  falls back to clearing **every** archive marker when the timestamp does not
  match (legacy/re-archive data). Listings are restored **by marker**, not by
  `updated_at` equality, so listings touched after the archive still return.
  Markerless rows are restored when `updated_at >= archived_at`, and as a last
  resort every `unavailable` listing owned by the restored account is brought
  back. Response gains `restoredContent`.
- `rented` / already-`unavailable` listings are untouched on archive.
- Code tolerates databases without the listing marker columns (PostgREST
  `42703` / `PGRST204`): it falls back to status-only flips and timestamp-based
  restores.

### Startup reconciliation
- `server/utilities/archiveContent.js` exports `reconcileArchivedAccounts()`.
  `server/server.js` runs it once after a 30s warm-up (disable with
  `DISABLE_ARCHIVE_RECONCILE=true`).
- It re-stamps every archived account and heals listings left `unavailable` by
  accounts that were already unarchived before the markers existed, so legacy
  cases self-correct without manual SQL.

### Active views vs. history
- `GET /jobs` and `GET /listings` exclude content owned by archived accounts;
  `GET /jobs` also excludes posts with `client_archived_at` set and
  `GET /listings` excludes listings with `archived_at` set
  (`server/utilities/visibility.js`), so visibility no longer depends on status
  alone.
- Owner-scoped requests (`/jobs?userId=`, `/jobs?clientId=`, `/listings?ownerId=`)
  skip those filters, so UserDetail keeps showing the archived account's jobs,
  listings and proposals.
- `GET /activity-log` accepts `relatedUserId`, which lets UserDetail show the
  `user_archived` / `user_unarchived` entries for the account.

### UserDetail
- Profile shows Archived At, Archived By (resolved name when available) and
  Archive Reason.
- New History tab (admin only, `viewAuditLogs`) lists the account's admin activity.

### Files
- New: `server/utilities/visibility.js`, `server/utilities/archiveContent.js`,
  `server/controllers/__tests__/archivedOwnerVisibility.test.js`,
  `server/controllers/__tests__/archiveContent.test.js`
- Changed: `server/controllers/{users,jobs,listings,activityLog}.js`,
  `server/server.js`, `server/middleware/validate.js`, `server/db/schema.sql`,
  `client/src/pages/UserDetail.jsx`, `client/src/pages/UserDetail.test.jsx`,
  `server/controllers/__tests__/usersArchive.test.js`

### Transactions (financial records are never hidden)
Transactions and the trust ledger keep every archived account's records for audit.
`GET /transactions` and `GET /transactions/:id` now return `userArchived` and
`counterpartyArchived`; the Transactions list and detail show an Archived badge
next to the user/counterparty instead of dropping the row.
- Changed: `server/controllers/transactions.js`,
  `client/src/pages/Transactions.jsx`, `client/src/pages/TransactionDetail.jsx`,
  `server/controllers/__tests__/transactionsTrustLedgerVisibility.test.js`

### Dashboard activity + notification settings cleanup
- Recent Admin/Support Actions now only shows admin-portal activity types
  (mobile consumer activity stays out), renders human labels (`User Archived`)
  instead of raw codes, resolves the target account name instead of its UUID
  (including rewriting UUIDs embedded in older descriptions, deduped per
  action + account), and shows `Daniel Reyes` rather than `d4444444-...`.
- User/account activity descriptions (suspend, reinstate, flag, archive,
  unarchive, delete) now use the account's display name, not its UUID.
- Removed Settings -> Notifications preferences tab; notification preferences
  (`gawa_notification_prefs`) and `preferences`/`togglePreference` are gone from
  `NotificationContext`. Notifications are inbound events (verification,
  messages, reports/CRM) and no longer filtered by admin preferences.
- Changed: `server/controllers/{dashboard,activityLog,users}.js`,
  `client/src/context/NotificationContext.jsx`, `client/src/pages/Settings.jsx`

### Friendly user URLs (no UUID in the address bar)
- User detail is now addressed as `/users/USR-630212` (the same short numeric ID
  the UI already shows) instead of the raw account UUID.
- New `server/utilities/entityIds.js` mirrors the client `formatEntityIdNumeric`
  hash and resolves a friendly ID back to the account UUID (60s cache over
  `users_table` ids; ambiguous IDs resolve to 404 so the wrong account never
  opens).
- New `server/middleware/resolveUser.js` resolves `:id` on every user route
  (`GET/PATCH/DELETE /users/:id`, `/users/:id/proposals`, suspend, reinstate,
  archive, unarchive, flag, password actions); UUIDs still work.
- New `client/src/utils/helpers.js` helper `userEntityPath(id)`; all admin
  links to a user profile (Users, Transactions, Trust Ledger, Gawa Points,
  Jobs, Rentals, Listings, Verification, Review Workflow, Disputes, Escalations)
  now use it, and UserDetail uses the resolved UUID for its data calls.

### Friendly URLs for every entity type
- `server/utilities/entityIds.js` now resolves friendly IDs for all entity types:
  `user` (users_table), `job` (job_posts), `listing` (equipment_listings),
  `rental` (equipment_rentals) and `transaction` (transactions), each with its
  own prefix (USR-, JOB-, LST-, RNT-, TXN-) and a 60s per-type cache.
- `server/middleware/resolveEntity.js` (`resolveEntityParam(type)`) resolves the
  `:id` route param for the user, job, listing, rental and transaction routes;
  raw UUIDs still work and ambiguous IDs answer 404.
- Client helpers `jobEntityPath`, `listingEntityPath`, `rentalEntityPath` and
  `transactionEntityPath` join `userEntityPath`; every admin link now uses a
  friendly URL (`/jobs/JOB-358839`, `/listings/LST-534976`,
  `/rentals/RNT-195912`, `/transactions/TXN-529804`).
- Detail pages resolve the real UUID from the loaded row before calling notes,
  flag/remove and escrow endpoints.
