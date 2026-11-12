const supabase = require('../db/supabase');

/**
 * Archive/restore helpers for content owned by an archived (archived + banned)
 * account.
 *
 * Job posts and proposals carry archive markers stamped with the account's
 * archived_at. Equipment listings also carry markers (archived_at /
 * archive_removed_at) and additionally get their status flipped to
 * 'unavailable', because the mobile app reads status directly.
 *
 * All helpers are idempotent so they can be re-run as a reconciliation pass for
 * accounts archived before this logic existed.
 */

// Legacy databases without the listing marker columns reject these updates
// with Postgres error 42703, or PostgREST error PGRST204 when the column is
// missing from its schema cache; callers fall back to status-only updates.
const MISSING_COLUMN_CODES = ['42703', 'PGRST204'];

function isMissingColumn(error) {
  return Boolean(error && MISSING_COLUMN_CODES.includes(error.code));
}

async function stampListings(userId, archivedAt) {
  const marked = await supabase
    .from('equipment_listings')
    .update({
      status: 'unavailable',
      archived_at: archivedAt,
      archive_removed_at: null,
      updated_at: archivedAt,
    })
    .eq('owner_id', userId)
    .eq('status', 'available')
    .select('listing_id');

  if (!marked.error) return marked.data || [];
  if (!isMissingColumn(marked.error)) {
    console.error('[Archive] Could not mark equipment listings unavailable:', marked.error.message);
    return [];
  }

  const fallback = await supabase
    .from('equipment_listings')
    .update({ status: 'unavailable', updated_at: archivedAt })
    .eq('owner_id', userId)
    .eq('status', 'available')
    .select('listing_id');

  if (fallback.error) {
    console.error('[Archive] Could not mark equipment listings unavailable:', fallback.error.message);
    return [];
  }
  return fallback.data || [];
}

/**
 * Restores listings by their archive marker (not by timestamp equality), so a
 * listing touched after the archive still comes back. Rows archived before the
 * marker existed are restored by the legacy fallback, and as a last resort every
 * unavailable listing owned by the restored account is brought back (unarchiving
 * is an explicit admin restore, so it must not leave content stuck).
 */
async function restoreListings(userId, archivedAt) {
  const removedAt = new Date().toISOString();

  const marked = await supabase
    .from('equipment_listings')
    .update({ status: 'available', archived_at: null, archive_removed_at: removedAt, updated_at: removedAt })
    .eq('owner_id', userId)
    .eq('status', 'unavailable')
    .eq('archived_at', archivedAt)
    .select('listing_id');

  let useMarker = true;
  let restored = 0;
  if (!marked.error) {
    restored = (marked.data || []).length;
    if (restored > 0) return restored;
  } else if (isMissingColumn(marked.error)) {
    useMarker = false;
  } else {
    console.error('[Unarchive] Could not restore equipment listings:', marked.error.message);
    return 0;
  }

  // Unmarked rows: touched at or after the archive, so the archive flip likely
  // rewrote updated_at (which may differ from users_table.archived_at).
  restored += await restoreLegacyListings(userId, archivedAt, { useMarker, anyTime: false });

  // Last resort: the owner still has unavailable listings, so restore them all.
  if (restored === 0) {
    restored += await restoreLegacyListings(userId, archivedAt, { useMarker, anyTime: true });
  }

  return restored;
}

async function restoreLegacyListings(userId, archivedAt, { useMarker, anyTime }) {
  const removedAt = new Date().toISOString();

  const attempt = (withMarker) => {
    let query = supabase
      .from('equipment_listings')
      .update(withMarker
        ? { status: 'available', archive_removed_at: removedAt, updated_at: removedAt }
        : { status: 'available', updated_at: removedAt })
      .eq('owner_id', userId)
      .eq('status', 'unavailable');

    if (!anyTime) {
      query = query.gte('updated_at', archivedAt);
    }

    if (withMarker) {
      // Only touch rows the archive logic never marked.
      query = query.is('archived_at', null).is('archive_removed_at', null);
    }

    return query.select('listing_id');
  };

  let { data, error } = await attempt(useMarker);
  if (isMissingColumn(error) && useMarker) {
    ({ data, error } = await attempt(false));
  }
  if (error) {
    console.error('[Unarchive] Could not restore equipment listings:', error.message);
    return 0;
  }
  return (data || []).length;
}

async function stampArchivedContent(userId, archivedAt) {
  const results = { jobPosts: 0, proposals: 0, listings: 0 };

  const { data: posts, error: postsError } = await supabase
    .from('job_posts')
    .update({ client_archived_at: archivedAt, client_archive_removed_at: null })
    .eq('client_id', userId)
    .is('client_archived_at', null)
    .select('job_post_id');

  if (postsError) {
    console.error('[Archive] Could not archive job posts:', postsError.message);
  } else {
    results.jobPosts = (posts || []).length;
  }

  const { data: proposals, error: proposalsError } = await supabase
    .from('job_proposals')
    .update({ proposer_archived_at: archivedAt, proposer_archive_removed_at: null })
    .eq('proposer_id', userId)
    .is('proposer_archived_at', null)
    .select('proposal_id');

  if (proposalsError) {
    console.error('[Archive] Could not archive job proposals:', proposalsError.message);
  } else {
    results.proposals = (proposals || []).length;
  }

  results.listings = (await stampListings(userId, archivedAt)).length;

  return results;
}

async function clearArchivedContentMarkers(userId, archivedAt) {
  const results = { jobPosts: 0, proposals: 0, listings: 0 };
  const removedAt = new Date().toISOString();

  const { data: posts, error: postsError } = await supabase
    .from('job_posts')
    .update({ client_archived_at: null, client_archive_removed_at: removedAt })
    .eq('client_id', userId)
    .eq('client_archived_at', archivedAt)
    .select('job_post_id');

  if (postsError) {
    console.error('[Unarchive] Could not restore job posts:', postsError.message);
  } else if ((posts || []).length > 0) {
    results.jobPosts = posts.length;
  } else {
    // Marker stamped with a different timestamp (re-archive, legacy data):
    // unarchiving is an explicit admin restore, so clear every archive marker.
    const { data: allPosts, error: allPostsError } = await supabase
      .from('job_posts')
      .update({ client_archived_at: null, client_archive_removed_at: removedAt })
      .eq('client_id', userId)
      .not('client_archived_at', 'is', null)
      .select('job_post_id');

    if (allPostsError) {
      console.error('[Unarchive] Could not restore job posts:', allPostsError.message);
    } else {
      results.jobPosts = (allPosts || []).length;
    }
  }

  const { data: proposals, error: proposalsError } = await supabase
    .from('job_proposals')
    .update({ proposer_archived_at: null, proposer_archive_removed_at: removedAt })
    .eq('proposer_id', userId)
    .eq('proposer_archived_at', archivedAt)
    .select('proposal_id');

  if (proposalsError) {
    console.error('[Unarchive] Could not restore job proposals:', proposalsError.message);
  } else if ((proposals || []).length > 0) {
    results.proposals = proposals.length;
  } else {
    const { data: allProposals, error: allProposalsError } = await supabase
      .from('job_proposals')
      .update({ proposer_archived_at: null, proposer_archive_removed_at: removedAt })
      .eq('proposer_id', userId)
      .not('proposer_archived_at', 'is', null)
      .select('proposal_id');

    if (allProposalsError) {
      console.error('[Unarchive] Could not restore job proposals:', allProposalsError.message);
    } else {
      results.proposals = (allProposals || []).length;
    }
  }

  results.listings = await restoreListings(userId, archivedAt);

  return results;
}

/**
 * Re-applies the archive markers for every archived account and heals listings
 * left unavailable by accounts archived before the listing markers existed.
 * Runs once at startup so legacy rows self-correct without manual SQL.
 */
async function reconcileArchivedAccounts() {
  const { data: users, error } = await supabase
    .from('users_table')
    .select('id, is_archived, archived_at')
    .not('archived_at', 'is', null);

  if (error) {
    console.error('[Archive] Reconciliation could not load archived accounts:', error.message);
    return null;
  }

  const totals = { accounts: 0, healedAccounts: 0, jobPosts: 0, proposals: 0, listings: 0 };
  for (const user of users || []) {
    if (user.is_archived) {
      const stamped = await stampArchivedContent(user.id, user.archived_at);
      totals.accounts += 1;
      totals.jobPosts += stamped.jobPosts;
      totals.proposals += stamped.proposals;
      totals.listings += stamped.listings;
      continue;
    }

    // Account is no longer archived: clear any markers/status a legacy archive
    // left behind (jobs, proposals and listings) so restored content is visible.
    totals.healedAccounts += 1;
    const restored = await clearArchivedContentMarkers(user.id, user.archived_at);
    totals.jobPosts += restored.jobPosts;
    totals.proposals += restored.proposals;
    totals.listings += restored.listings;
  }
  return totals;
}

module.exports = { stampArchivedContent, clearArchivedContentMarkers, reconcileArchivedAccounts };
