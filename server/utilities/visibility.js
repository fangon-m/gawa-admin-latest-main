const supabase = require('../db/supabase');

/**
 * Content visibility rules for archived (archived + banned) accounts.
 *
 * Archiving an account never mutates content status. Active views hide the
 * owner's content by filtering here, so unarchiving restores visibility with no
 * follow-up writes.
 *
 * The filter helpers stay synchronous on purpose: Supabase query builders are
 * thenables, so awaiting a helper that returns one would resolve the query
 * itself instead of the builder.
 */
async function getArchivedUserIds() {
  const { data, error } = await supabase
    .from('users_table')
    .select('id')
    .eq('is_archived', true);

  if (error) {
    console.error('[Visibility] Could not load archived accounts:', error.message);
    return [];
  }
  return (data || []).map((user) => user.id);
}

// PostgREST `in` list syntax, used with .not() for id exclusion.
function postgrestIdList(ids) {
  return `(${ids.map((id) => `"${id}"`).join(',')})`;
}

/**
 * Excludes content owned by archived accounts from an active list query.
 * Pass archivedAtColumn when the table also marks content archived by its owner.
 */
function applyArchivedOwnerFilter(query, ownerColumn, archivedUserIds, archivedAtColumn = null) {
  if (archivedAtColumn) query = query.is(archivedAtColumn, null);

  if (archivedUserIds.length > 0) {
    query = query.not(ownerColumn, 'in', postgrestIdList(archivedUserIds));
  }
  return query;
}

module.exports = { getArchivedUserIds, applyArchivedOwnerFilter };
