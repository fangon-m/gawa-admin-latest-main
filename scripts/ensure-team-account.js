#!/usr/bin/env node
/**
 * Makes sure a team account can actually sign in to the admin portal.
 *
 * Three things have to line up for a successful login:
 *   1. an auth account with a known password,
 *   2. a `users_table` profile row (the server refuses to issue a session for
 *      an account that has no profile), and
 *   3. a team role, stored in `auth.users.app_metadata` until the
 *      `user_roles` table exists in the database.
 *
 * This script checks all three and repairs whatever is missing.
 *
 * Usage:
 *   node scripts/ensure-team-account.js --email=you@example.com --role=admin
 *   node scripts/ensure-team-account.js --email=you@example.com --role=admin --password='...'
 *
 * With no --password a strong password is generated and printed once.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { APP_METADATA_ROLE_KEY, STAFF_ROLES } = require('../server/utilities/permissions');

const ROOT = path.join(__dirname, '..');

function parseArgs(argv) {
  const args = {};
  for (const entry of argv.slice(2)) {
    const match = entry.match(/^--([^=]+)=(.*)$/);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

function loadEnv() {
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

function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%^&*';
  const bytes = crypto.randomBytes(20);
  let out = '';
  for (let i = 0; i < 20; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

async function findAuthUser(supabase, email) {
  const target = String(email).toLowerCase();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`could not list auth users: ${error.message}`);
    const users = data?.users || [];
    const hit = users.find((u) => (u.email || '').toLowerCase() === target);
    if (hit) return hit;
    if (users.length < 1000) return null;
  }
  return null;
}

async function main() {
  loadEnv();
  const args = parseArgs(process.argv);

  const email = (args.email || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const role = (args.role || process.env.ADMIN_ROLE || 'admin').trim().toLowerCase();
  const password = args.password || process.env.ADMIN_PASSWORD || generatePassword();
  const generated = !(args.password || process.env.ADMIN_PASSWORD);

  if (!email) {
    console.error('[account] --email (or ADMIN_EMAIL) is required.');
    process.exit(1);
  }
  if (!STAFF_ROLES.includes(role)) {
    console.error(`[account] --role must be one of: ${STAFF_ROLES.join(', ')}`);
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('[account] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  console.log(`[account] ${email} (${role})`);

  // 1. auth account + password
  let authUser = await findAuthUser(supabase, email);
  if (!authUser) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) {
      console.error(`[account] could not create the auth account: ${error.message}`);
      process.exit(1);
    }
    authUser = data.user;
    console.log('  created the auth account');
  } else {
    const { error } = await supabase.auth.admin.updateUserById(authUser.id, {
      password,
      email_confirm: true,
    });
    if (error) {
      console.error(`[account] could not set the password: ${error.message}`);
      process.exit(1);
    }
    console.log('  password updated');
  }

  // 2. role in app_metadata (server-managed, unforgeable by the account holder)
  const appMetadata = { ...(authUser.app_metadata || {}), [APP_METADATA_ROLE_KEY]: role };
  const { error: metaError } = await supabase.auth.admin.updateUserById(authUser.id, { app_metadata: appMetadata });
  if (metaError) {
    console.error(`[account] could not set the role: ${metaError.message}`);
    process.exit(1);
  }
  console.log(`  role set to ${role}`);

  // 3. users_table profile
  const { data: profile } = await supabase
    .from('users_table')
    .select('id, role')
    .eq('id', authUser.id)
    .maybeSingle();

  if (!profile) {
    const { error: insertError } = await supabase.from('users_table').insert({
      id: authUser.id,
      email,
      first_name: args.name || 'GAWA',
      last_name: args.name || 'Admin',
      role,
      is_verified: true,
    });
    if (insertError) {
      console.error(`[account] could not create the profile: ${insertError.message}`);
      process.exit(1);
    }
    console.log('  created the users_table profile');
  } else {
    const { error: updateError } = await supabase
      .from('users_table')
      .update({ role, email })
      .eq('id', authUser.id);
    if (updateError) {
      console.error(`[account] could not update the profile: ${updateError.message}`);
      process.exit(1);
    }
    console.log('  profile updated');
  }

  console.log('\n  email    :', email);
  console.log('  role     :', role);
  if (generated) {
    console.log('  password :', password);
    console.log('             (generated — store it now, it is not shown again)');
  } else {
    console.log('  password : (unchanged)');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[account] failed:', err?.message || err);
    process.exit(1);
  });
