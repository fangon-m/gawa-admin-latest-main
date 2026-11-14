/**
 * Server-side role resolution.
 *
 * The authoritative source of a caller's roles is the `user_roles` join that
 * `authenticate` performs with the service-role client.
 *
 * The legacy `users_table.role` column is deliberately NOT consulted. It is a
 * free-text column with no CHECK constraint, and the consumer mobile app
 * writes to the same table through the Supabase anon key, so a self-service
 * profile update could otherwise set `role = 'admin'` and promote itself.
 * Resolving roles from `user_roles` only means an account with no role row
 * is a non-staff account, and stays one.
 */

const ROLES = {
  ADMIN: 'admin',
  CUSTOMER_SUPPORT: 'customer_support',
};

const STAFF_ROLES = [ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT];

/**
 * The key used to store the role in `auth.users.app_metadata`.
 *
 * `app_metadata` can only be written by the service role, so a consumer
 * account cannot forge a role for itself the way it could write the legacy
 * `users_table.role` column. That makes it a safe carrier for the role until
 * the `user_roles` table exists in the database.
 */
const APP_METADATA_ROLE_KEY = 'gawa_role';

/**
 * The key used to store the session version in `auth.users.app_metadata`.
 *
 * Supabase copies app_metadata into every access token it issues, so the
 * token carries the version it was minted with. Bumping the counter
 * invalidates every access token already handed out — see
 * server/utilities/sessionRevocation.js.
 */
const APP_METADATA_TOKEN_VERSION_KEY = 'gawa_token_version';

/** Normalises a stored role value, rejecting anything that is not a team role. */
function normalizeRole(role) {
  if (typeof role !== 'string') return null;
  const value = role.trim().toLowerCase();
  return STAFF_ROLES.includes(value) ? value : null;
}

/**
 * Resolves the caller's roles.
 *
 * Sources, in order of preference:
 *
 *   1. the `user_roles` table — the intended source of truth;
 *   2. `auth.users.app_metadata.gawa_role` — written by the server with the
 *      service role, so an account holder cannot forge it;
 *   3. `users_table.role` — where the role is recorded today.
 *
 * Only the first source that yields a role is used, so the role table
 * overrides everything else as soon as it exists.
 *
 * The profile column is the weakest of the three: it is a free-text column
 * with no CHECK constraint. It is protected by the row level security
 * policies on `users_table`, which stop an account from writing its own
 * `role` — that protection is made explicit and version-controlled in
 * `server/db/migrations/20261112_missing_admin_tables.sql`.
 */
function resolveRoles({ roleRows = [], appMetadata = {}, profileRole = null } = {}) {
  const fromTable = (roleRows || [])
    .map((row) => row?.roles?.role_name)
    .map(normalizeRole)
    .filter(Boolean);

  const fromAppMetadata = [normalizeRole(appMetadata?.[APP_METADATA_ROLE_KEY])].filter(Boolean);

  const fromProfile = [normalizeRole(profileRole)].filter(Boolean);

  const roles = fromTable.length
    ? fromTable
    : fromAppMetadata.length
      ? fromAppMetadata
      : fromProfile;

  const unique = [...new Set(roles)];

  return {
    roles: unique,
    role: unique.includes(ROLES.ADMIN)
      ? ROLES.ADMIN
      : unique.includes(ROLES.CUSTOMER_SUPPORT)
        ? ROLES.CUSTOMER_SUPPORT
        : null,
  };
}

/** Returns the caller's roles as a plain array of strings. */
function getUserRoles(req) {
  const roles = req?.user?.roles;
  if (!Array.isArray(roles)) return [];
  return roles.filter((role) => typeof role === 'string' && role.length > 0);
}

function hasRole(req, role) {
  return getUserRoles(req).includes(role);
}

/** True when the caller holds any team role. */
function isStaff(req) {
  return getUserRoles(req).some((role) => STAFF_ROLES.includes(role));
}

function isAdmin(req) {
  return hasRole(req, ROLES.ADMIN);
}

module.exports = {
  ROLES,
  STAFF_ROLES,
  APP_METADATA_ROLE_KEY,
  APP_METADATA_TOKEN_VERSION_KEY,
  normalizeRole,
  resolveRoles,
  getUserRoles,
  hasRole,
  isStaff,
  isAdmin,
};
