const supabase = require('../db/supabase');

/**
 * Supabase's admin API has no "get user by email" call, so page through the
 * auth user list. Used to adopt an orphaned auth account (auth user without a
 * users_table profile) instead of failing an invitation.
 */
async function findAuthUserByEmail(email) {
  if (typeof supabase.auth?.admin?.listUsers !== 'function') return null;
  const target = String(email || '').toLowerCase();
  if (!target) return null;

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return null;
    const users = data?.users || [];
    const hit = users.find((u) => (u.email || '').toLowerCase() === target);
    if (hit) return hit;
    if (users.length < 1000) return null;
  }
  return null;
}

module.exports = { findAuthUserByEmail };
