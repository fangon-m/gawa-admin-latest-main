const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const serviceClient = require('../db/supabase'); // service_role client (bypasses RLS)
const { getFullName } = require('../utilities/helpers');
const { resolveRoles } = require('../utilities/permissions');
const { isRevoked } = require('../utilities/sessionRevocation');

// A missing .env must not take the whole server down: every request fails
// closed with 401 instead.
const anonClient = config.supabaseUrl && config.supabaseAnonKey
  ? createClient(config.supabaseUrl, config.supabaseAnonKey)
  : null;

function isSuspended(profile) {
  if (profile?.suspension_status !== 'active') return false;
  if (!profile.suspended_until) return true;
  const suspendedUntil = Date.parse(profile.suspended_until);
  return !Number.isFinite(suspendedUntil) || suspendedUntil > Date.now();
}

/**
 * The caller's effective role comes from the `user_roles` table, or — while
 * that table is still missing from the database — from the server-managed
 * `auth.users.app_metadata`, or from the role recorded on the profile row.
 *
 * The profile column is the weakest of the three and is protected by the row
 * level security policies on `users_table`, which stop an account from
 * writing its own `role`. The role table takes over as soon as it exists.
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Invalid or expired token' });

  if (!anonClient) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const { data, error } = await anonClient.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // A token that was issued before the account's sessions were revoked must
  // stop working immediately, not when it happens to expire.
  if (isRevoked(token, data.user.app_metadata || {})) {
    return res.status(401).json({ error: 'Session revoked. Please sign in again.' });
  }

  // Enrich with profile data (role, name, etc.) using service_role client (bypasses RLS)
  const [profileRes, rolesRes] = await Promise.all([
    serviceClient.from('users_table').select('*').eq('id', data.user.id).single(),
    serviceClient.from('user_roles').select('role_id, roles(role_name)').eq('user_id', data.user.id),
  ]);

  const profile = profileRes.data || {};
  const { roles, role } = resolveRoles({
    roleRows: rolesRes.data || [],
    appMetadata: data.user.app_metadata || {},
    profileRole: profile.role,
  });

  if (profile.is_archived) {
    return res.status(403).json({ error: 'This account is archived and cannot access the application' });
  }
  if (isSuspended(profile)) {
    return res.status(403).json({ error: 'This account is suspended and cannot access the application' });
  }

  req.user = {
    ...profile,
    id: data.user.id,
    email: data.user.email,
    name: getFullName(profile) || data.user.email,
    // Resolved from the role table, the auth metadata or the profile row,
    // in that order of preference.
    role,
    roles,
  };
  next();
}

function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ') && anonClient) {
    const token = authHeader.split(' ')[1];
    anonClient.auth.getUser(token).then(({ data }) => {
      if (data.user) {
        req.user = { id: data.user.id, email: data.user.email };
      }
      next();
    }).catch(() => next());
  } else {
    next();
  }
}

module.exports = { authenticate, optionalAuth };
