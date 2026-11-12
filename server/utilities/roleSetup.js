const supabase = require('../db/supabase');

/**
 * Checks that the role plumbing is actually in place.
 *
 * The role table is created by
 * `server/db/migrations/20261112_missing_admin_tables.sql`. Until that
 * migration has been applied the server reads the role from the profile row
 * (`users_table.role`), with `auth.users.app_metadata.gawa_role` as the
 * server-managed overlay.
 *
 * Two things are worth reporting:
 *   1. the role table has not been created yet, so the role lives on the
 *      profile row — which works, but is one step away from the table the
 *      server would rather use;
 *   2. the role table exists but a team account has no row in it, so the
 *      profile row is still deciding that account's role.
 *
 * Neither is a crash, so without this check both look like "the login is
 * broken" with no explanation.
 */
async function checkRoleSetup() {
  const result = {
    roleTableMissing: false,
    unassignedStaff: [],
    staffCount: 0,
    error: null,
  };

  try {
    const { error } = await supabase.from('user_roles').select('user_id').limit(1);
    if (error) {
      result.roleTableMissing = /PGRST205|does not exist/i.test(error.message);
      if (!result.roleTableMissing) result.error = error.message;
    }
  } catch (err) {
    result.error = err?.message || String(err);
    return result;
  }

  try {
    const { data: staff, error: staffError } = await supabase
      .from('users_table')
      .select('id, email, role')
      .in('role', ['admin', 'customer_support']);

    if (staffError) {
      result.error = staffError.message;
      return result;
    }

    result.staffCount = (staff || []).length;

    if (result.roleTableMissing) {
      // The fallback lives in auth metadata, which cannot be inspected with
      // a single cheap query, so the check stops here.
      return result;
    }

    const { data: assigned } = await supabase.from('user_roles').select('user_id');
    const assignedIds = new Set((assigned || []).map((row) => row.user_id));
    result.unassignedStaff = (staff || [])
      .filter((member) => !assignedIds.has(member.id))
      .map((member) => member.email);
  } catch (err) {
    result.error = err?.message || String(err);
  }

  return result;
}

/** Prints the outcome of the check in a form that is useful in a boot log. */
function reportRoleSetup(result) {
  if (!result) return;

  if (result.error) {
    console.warn(`  [Security] Could not verify the role setup: ${result.error}`);
    return;
  }

  if (result.roleTableMissing) {
    console.warn(
      '  [Roles] The role tables (roles, user_roles) do not exist in the database.\n' +
      '          Roles are read from the profile row, so staff can still sign in.\n' +
      '          To give the role its own table, apply\n' +
      '            server/db/migrations/20261112_missing_admin_tables.sql\n' +
      '          and then run: node scripts/seed-team-roles.js'
    );
    return;
  }

  if (result.unassignedStaff.length > 0) {
    // Not a blocker: the profile row still carries the role. It only means
    // the role table and the profile row have drifted apart.
    console.warn(
      '  [Roles] These team accounts have no row in the role table, so they fall back\n' +
      '          to the role on their profile row:\n' +
      result.unassignedStaff.map((email) => `             - ${email}`).join('\n') +
      '\n          Sync them with: node scripts/seed-team-roles.js'
    );
    return;
  }

  if (result.staffCount > 0) {
    console.log(`  Roles: ${result.staffCount} team account(s) configured.`);
  }
}

module.exports = { checkRoleSetup, reportRoleSetup };
