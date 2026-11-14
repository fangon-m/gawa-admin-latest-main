# Team invitations

One-time email link, hashed at rest, materialised into an account only when the
invitee sets a password. No temporary credential ever leaves the server.

## Flow

```
admin POST /api/users/invite
  └─ team_invites row (status=pending, token_hash=HMAC(token), expires_at=now+TTL)
  └─ email with link  ${INVITE_LINK_BASE_URL}/accept-invite#token=<raw>
       └─ success → status=sent / failure → status=failed (+ email_events)

invitee POST /api/auth/accept-invite {token, password}
  └─ hash lookup + timing-safe compare + expiry check
  └─ atomic claim (UPDATE ... WHERE status IN (pending,sent,failed) AND expires_at > now())
  └─ auth user → users_table row → user_roles → invite.accepted_user_id
```

The raw token only exists in memory and in the emailed URL (fragment, never sent
to the server in a Referer header). A database leak therefore yields unusable
links without `INVITE_TOKEN_PEPPER`.

## Environment

| Variable | Default | Notes |
|---|---|---|
| `INVITE_EMAIL_ENABLED` | `true` | `false` → invite endpoints return 503 |
| `INVITE_LINK_BASE_URL` | `FRONTEND_URL` or `http://localhost:3000` | Admin SPA origin |
| `INVITE_TOKEN_TTL_MINUTES` | `2880` (48h) | 5 min – 30 days |
| `INVITE_TOKEN_PEPPER` | — | **required in production**, 32+ chars |
| `INVITE_RATE_LIMIT_PER_IP` | `10` | per 15 min, per IP |
| `INVITE_RATE_LIMIT_PER_ACTOR_PER_DAY` | `50` | counted from existing rows |
| `EMAIL_PROVIDER` | `console` dev / `smtp` prod | `console`, `smtp`, `ses`, `sendgrid` |
| `MAIL_FROM` | `GAWA Admin <no-reply@gawa.local>` | must be verified with the provider |
| `MAIL_TIMEOUT_MS` | `10000` | per delivery attempt |
| `MAIL_MAX_ATTEMPTS` | `3` | exponential backoff 250ms → 500ms |

Generate a pepper:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`NODE_ENV=production` exits on boot if the pepper is missing/short, if
`EMAIL_PROVIDER=console`, or if any core Supabase/JWT variable is absent.

## Migration

`server/db/migrations/005_team_invites.sql` — apply manually in the Supabase SQL
Editor (this repo has no migration runner). It creates `team_invites` and
`email_events`, enables RLS with no policies (service-role only), and recreates
`activity_log_activity_type_check` with the four invite types.

## curl examples

```bash
BASE=http://localhost:4000/api
TOKEN=gawa-local-admin-token

# Invite
curl -s -X POST "$BASE/users/invite" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Maria Santos","email":"maria@example.com","role":"admin"}'

# Resend (rotates the token — the previous link dies immediately)
curl -s -X POST "$BASE/users/invites/<INVITE_ID>/resend" -H "Authorization: Bearer $TOKEN"

# Revoke
curl -s -X POST "$BASE/users/invites/<INVITE_ID>/revoke" -H "Authorization: Bearer $TOKEN"

# Team listing (members + pending invites)
curl -s "$BASE/users/team" -H "Authorization: Bearer $TOKEN"

# Accept (public, unauthenticated)
curl -s -X POST "$BASE/auth/accept-invite" -H 'Content-Type: application/json' \
  -d '{"token":"<raw token from the email>","password":"StrongPassw0rd!"}'
```

Password policy: **7–128 characters.**

## Responses

| Status | Code | Meaning |
|---|---|---|
| 201 | — | Invite created (check `data.delivery`: `sent` \| `failed`) |
| 400 | `INVITE_INVALID` | Bad/expired/used token — deliberately generic |
| 403 | — | Caller is not an admin |
| 409 | `USER_EXISTS` | Email already belongs to a team member |
| 409 | `INVITE_EXISTS` | A live invite already exists — resend instead |
| 409 | `ACCOUNT_EXISTS` | Profile appeared between invite and accept |
| 409 | `INVITE_INACTIVE` | Resend attempted on a terminal invite |
| 429 | `ACTOR_QUOTA_EXCEEDED` / limiter | Rate limited |
| 503 | `INVITES_DISABLED` | `INVITE_EMAIL_ENABLED=false` |

A failed delivery still returns 201 with `delivery: "failed"`; the invite row
survives so an admin can resend it instead of losing the record.

## Monitoring

```sql
-- Delivery health, last 24h
select provider, status, count(*), round(avg(latency_ms)) as avg_ms
from public.email_events
where created_at > now() - interval '24 hours'
group by 1, 2 order by 1, 2;

-- Failures in the last 24h
select created_at, email, provider, attempt, error_code
from public.email_events
where status = 'failed' and created_at > now() - interval '24 hours'
order by created_at desc;

-- Live invites and their age
select invite_id, email, role, status, delivery_attempts, last_error_code,
       expires_at - now() as ttl
from public.team_invites
where status in ('pending', 'sent', 'failed')
order by created_at;

-- Stale invites never cleaned up (safe to delete after 90 days)
select count(*) from public.team_invites
where status in ('expired', 'revoked') and updated_at < now() - interval '90 days';

-- Audit trail
select created_at, activity_type, description
from public.activity_log
where activity_type like 'invite\_%'
order by created_at desc limit 50;
```

Alerting suggestions:
- `email_events` failure rate > 5% over 15 min → mail provider issue.
- Any `status='failed'` invite older than 1h → admin resend needed.
- `delivery_attempts >= 3` → repeated provider rejection (bad `MAIL_FROM`/credentials).

## Rollback

```sql
begin;
drop table if exists public.email_events;
drop table if exists public.team_invites;
alter table public.activity_log drop constraint if exists activity_log_activity_type_check;
alter table public.activity_log add constraint activity_log_activity_type_check
  check (activity_type = any (array[
    'deposit_refunded','equipment_returned','equipment_paid','deposit_paid',
    'job_posted','talent_hired','job_payment_paid','points_topped_up',
    'proposal_sent','proposal_received','job_cancelled','equipment_listed',
    'rental_requested','rental_request_received','rental_request_approved',
    'rental_request_rejected','rental_request_cancelled','user_suspended',
    'user_reinstated','user_archived','user_unarchived','user_deleted',
    'user_flagged','user_warned','user_auto_suspended','user_warning_complied',
    'password_reset','user_invited','points_deducted','content_flagged'
  ]));
commit;
```

Dropping the tables kills every pending link. Accounts already accepted stay
intact (they are ordinary `users_table` rows). To disable invites without a
schema change, set `INVITE_EMAIL_ENABLED=false` and restart the server.

## Tests

```bash
npx jest server/services server/controllers/__tests__/invites.test.js server/routes/__tests__/inviteRoutes.test.js
```
