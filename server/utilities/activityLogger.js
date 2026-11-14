const supabase = require('../db/supabase');

/**
 * Fire-and-forget helper to write an admin activity record to public.activity_log.
 * Never blocks the calling request — errors are logged to console only.
 *
 * NOTE: public.activity_log has a CHECK constraint on activity_type that only
 * permits the 16 consumer-facing types until migration
 *   server/db/migrations/004_activity_log_admin_types.sql
 * is applied via the Supabase SQL Editor. Admin types (user_suspended,
 * user_archived, points_deducted, ...) are rejected by that constraint until
 * the migration runs. This helper still attempts every insert so that once the
 * migration is applied, admin activity is recorded automatically.
 */
async function logAdminActivity({
  actorId,
  activityType,
  category,
  description,
  relatedListingId = null,
  relatedJobPostId = null,
  relatedUserId = null,
  relatedPaymentRequestId = null,
  amount = null,
}) {
  try {
    const { data, error } = await supabase.from('activity_log').insert({
      user_id: actorId || null,
      activity_type: activityType,
      category,
      description: description || '',
      related_listing_id: relatedListingId,
      related_job_post_id: relatedJobPostId,
      related_user_id: relatedUserId,
      related_payment_request_id: relatedPaymentRequestId,
      amount: amount !== undefined && amount !== null ? Number(amount) : null,
    });

    if (error) {
      console.error('[ACTIVITY] Insert rejected:', {
        activityType,
        category,
        actorId,
        error: error.message,
        hint: error.hint,
        code: error.code,
      });
      return;
    }

    console.log('[ACTIVITY] Logged admin activity:', { activityId: data?.activity_id, activityType, category, actorId });
  } catch (err) {
    console.error('[ACTIVITY] Failed to log admin activity:', {
      activityType,
      category,
      actorId,
      error: err.message,
      detail: err.details || err.hint || err.code,
      body: err.body || null,
    });
  }
}

module.exports = { logAdminActivity };
