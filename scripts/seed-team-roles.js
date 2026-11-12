#!/usr/bin/env node
/**
 * Repairs team-role assignment for accounts that already exist.
 *
 * Background
 * ----------
 * The `roles` and `user_roles` tables are the intended source of truth for
 * team membership, but they may not exist in the database yet. Until they do,
 * the role is carried in `auth.users.app_metadata.gawa_role`, which only the
 * service role can write — a consumer account cannot promote itself that way.
 *
 * This script copies the role already recorded on each `users_table` profile
 * into the auth metadata, so existing staff accounts keep working after the
 * server stops trusting the profile column.
 *
 * It is idempotent and only ever writes the role that the profile already
 * claims, for accounts whose role is a known team role.
 *
 * Usage:
 *   node scripts/seed-team-roles.js
 *   node scripts/seed-team-roles.js --dry-run
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { APP_METADATA_ROLE_KEY, STAFF_ROLES } = require('../server/utilities/permissions');

const ROOT = path.join(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');

function loadEnv() {
  const fs = require('fs');
  for (const file of [path.join(ROOT, '.env'), path.join(ROOT, 'server', '.env')]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key]) continue;
      process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
    }
  }
}

async function main() {
  loadEnv();

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('[seed] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  console.log(`[seed] project ${url}${dryRun ? ' (dry run)' : ''}`);

  const { data: profiles, error: profileError } = await supabase
    .from('users_table')
    .select('id, email, role, first_name, last_name')
    .in('role', STAFF_ROLES);

  if (profileError) {
    console.error(`[seed] could not read users_table: ${profileError.message}`);
    process.exit(1);
  }

  if (!profiles || profiles.length === 0) {
    console.log('[seed] no accounts with a team role were found — nothing to do.');
    return;
  }

  const { data: authList, error: authError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (authError) {
    console.error(`[seed] could not list auth users: ${authError.message}`);
    process.exit(1);
  }
  const authById = new Map((authList?.users || []).map((u) => [u.id, u]));

  let changed = 0;
  for (const profile of profiles) {
    const authUser = authById.get(profile.id);
    if (!authUser) {
      console.log(`  skip  ${profile.email} — no auth account with id ${profile.id}`);
      continue;
    }

    const current = authUser.app_metadata?.[APP_METADATA_ROLE_KEY];
    if (current === profile.role) {
      console.log(`  ok    ${profile.email} — already ${profile.role}`);
      continue;
    }

    if (dryRun) {
      console.log(`  would set ${profile.email}: ${current || '(none)'} -> ${profile.role}`);
      changed += 1;
      continue;
    }

    // app_metadata is replaced wholesale by the admin API, so the existing
    // values are preserved and the role key is added.
    const appMetadata = { ...(authUser.app_metadata || {}), [APP_METADATA_ROLE_KEY]: profile.role };
    const { error } = await supabase.auth.admin.updateUserById(profile.id, { app_metadata: appMetadata });
    if (error) {
      console.error(`  FAIL  ${profile.email}: ${error.message}`);
      continue;
    }
    console.log(`  set   ${profile.email}: ${current || '(none)'} -> ${profile.role}`);
    changed += 1;
  }

  console.log(`\n[seed] ${changed} account(s) ${dryRun ? 'would be ' : ''}updated.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed] failed:', err?.message || err);
    process.exit(1);
  });
