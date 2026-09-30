# Plan — Transaction Monitoring

Populate `public.transactions` from jobs + rentals so the Transaction Monitoring pages work.

## Findings

Verified read-only against the live project in `.env` (`dohwfnndsgnbmoetgaql`):

- **Missing tables:** `transactions`, `wallets`, `trust_ledger`, `fee_configs`, `incident_logs`, `reports`, `entity_flags`, `disputes`, `appeals`, `messages` — so these admin pages currently 500.
- **Live tables:** `users_table`, `job_posts`, `job_matches`, `job_completion`, `equipment_listings`, `equipment_rentals`, `equipment_requests`, `check_ins`, `reviews`, `skills`, `user_skills`, `job_skills`, `equipment_listing_skills`, `id_verifications`, `activity_log`, `otp_codes`.
- FK embedding works: `job_matches → job_posts`, `equipment_rentals → equipment_listings`, `users_table`.
- Derivable data: 6 `equipment_rentals` (`total_price` + `security_deposit_paid`), 8 `job_matches` (`agreed_price` ₱1,500–22,000, 5 `completed`).

`server/db/schema.sql` is **stale** and contradicts the live DB:

| Column | schema.sql says | live values |
|---|---|---|
| `job_posts.job_status` | `active / finished / …` | `open / in_progress / completed` |
| `job_matches.status` | no `matched` | `pending / matched / completed` |
| `equipment_listings.status` | `published / …` | `available` |
| `payment_method` | `gcash / bank_transfer / card / wallet` | free text: `cash`, `Cash`, `Bank Transfer`, `GCash, Bank Transfer` |

Also: `processRefund` writes `status: 'refunded'`, which the documented `check` constraint forbids.

## Step 1 — `server/db/seed-transactions.sql` (new)

Idempotent DDL + backfill, run once in the **Supabase Dashboard SQL Editor** (no local DB password, and the linked CLI project is a different ref).

Table shape matches what `server/controllers/transactions.js` already selects:
`id, user_id, type, amount, status, payment_method, reference, fee, description, net_amount, created_at, related_id, related_type, direction`

- `id uuid primary key`, no FK to `wallets` (table absent)
- Widen checks: `status` += `refunded`; `payment_method` += `cash`; `related_type in ('job_post','equipment_rental','gawa_pack')`
- Indexes: `created_at desc`, `user_id`, `status`, `(related_type, related_id)`

Backfill keys: `md5('gawa:txn:' || <key>)::uuid` + `on conflict (id) do nothing` — re-runnable and can never clobber an admin-mutated status. Normalize `payment_method` into the allowed set.

| Row | Source | `user_id` | `amount` | `status` | `related` |
|---|---|---|---|---|---|
| `job_payment` | `job_matches` where status in `matched, in_progress, completed, verified` | `client_id` | `agreed_price` | `confirmed_at` set → `completed`; `completed` → `escrow`; else `pending` | `job_post` / `job_post_id` |
| `rental_payment` | all `equipment_rentals` | `renter_id` | `total_price` | `completed`→`completed`, `active`→`held`, `cancelled`→`cancelled` | `equipment_rental` / `rental_id` |
| `deposit` | `equipment_rentals` where `security_deposit_paid > 0` | `renter_id` | `security_deposit_paid` | `active`→`held`, else `completed` (returned) | `equipment_rental` / `rental_id` |
| `payout` | completed `job_matches` + `equipment_rentals` | `user_id` / `owner_id` | source amount − fee | source `completed` → `completed`, else `pending` | same as source |

`direction` = `in` for payments/deposits, `out` for payouts. `fee = 0` (no `fee_configs` table). `reference` = `JOB-xxxxxxxx` / `RENT-xxxxxxxx`. `created_at` = `matched_at ?? created_at` for jobs.

Result: ~18 rows, with pending payouts and escrow rows so the existing admin buttons have real data.

Also update `server/db/schema.sql` to match (add `refunded`, `cash`, the two `related_type` values).

## Step 2 — `server/controllers/transactions.js`

Contract already matches; targeted edits only:
- `enrichTransactions` resolves `job_posts.job_title` / `equipment_listings.equipment_name` → `relatedTitle`, plus counterparty name (talent `user_id` / rental `owner_id`)
- Accept `paymentMethod` query filter — the client already sends it, the controller ignores it

`server/server.js` needs **no change** — the auto-review timer already inserts `related_type: 'job_post'`.

## Step 3 — Client

- `Transactions.jsx` — add `cash` to payment-method options; add In/Out direction column; show related job/equipment title
- `TransactionDetail.jsx` — add a "Related" field linking to `/jobs/:relatedId` or `/rentals/:relatedId`
- No permission changes — `viewTransactions / releaseEscrow / processRefund / approvePayout` are already admin-only in both `client/src/utils/permissions.js` and `server/routes/transactions.js`

## Step 4 — Verify

```bash
npm run build
npm test
```

One request only (100 req/15 min `/api` rate limit):
`GET /api/transactions` with `Authorization: Bearer gawa-local-admin-token`

```sql
select type, status, count(*), sum(amount) from transactions group by 1,2 order by 1,2;
```

## Out of scope

1. `incident_logs` missing → `auditMiddleware` silently swallows audit writes; refunds/releases leave no DB audit trail.
2. `fee_configs` + `wallets` missing → `fee` is 0; Gawa Points → Wallets / Fee Configuration tabs stay broken.
3. `supabase/.temp/project-ref` = `boxxslvuzeycmkyjkpuf` but `.env` = `dohwfnndsgnbmoetgaql`. Re-link or delete `.temp`.
4. `schema.sql` should be regenerated from the live DB — wrong on 4 tables.
5. Backfill emits no `refund` rows; refunds only come from the admin action.