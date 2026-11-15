const supabase = require('../db/supabase');
const { isAdmin } = require('../utilities/permissions');
const { toCamelCase, getFullName, sendError } = require('../utilities/helpers');

const ACTIVITY_TYPE_MAP = {
  deposit_refunded: 'Deposit Refunded',
  equipment_returned: 'Equipment Returned',
  equipment_paid: 'Equipment Paid',
  deposit_paid: 'Deposit Paid',
  job_posted: 'Job Posted',
  talent_hired: 'Talent Hired',
  job_payment_paid: 'Job Payment Paid',
  points_topped_up: 'Points Topped Up',
  proposal_sent: 'Proposal Sent',
  proposal_received: 'Proposal Received',
  job_cancelled: 'Job Cancelled',
  equipment_listed: 'Equipment Listed',
  rental_requested: 'Rental Requested',
  rental_request_received: 'Rental Request Received',
  rental_request_approved: 'Rental Request Approved',
  rental_request_rejected: 'Rental Request Rejected',
  rental_request_cancelled: 'Rental Request Cancelled',
  user_suspended: 'User Suspended',
  user_reinstated: 'User Reinstated',
  user_archived: 'User Archived',
  user_unarchived: 'User Unarchived',
  user_deleted: 'User Deleted',
  user_flagged: 'User Flagged',
  user_warned: 'User Warned',
  user_auto_suspended: 'User Auto-Suspended',
  user_warning_complied: 'Warning Complied',
  password_reset: 'Password Reset',
  user_invited: 'User Invited',
  invite_accepted: 'Invite Accepted',
  invite_resent: 'Invite Resent',
  invite_revoked: 'Invite Revoked',
  invite_delivery_failed: 'Invite Email Failed',
  points_deducted: 'Points Deducted',
  content_flagged: 'Content Flagged',
};

function activityTypeLabel(type) {
  return ACTIVITY_TYPE_MAP[type] || type;
}

// Activity types written by the admin portal (server/utilities/activityLogger.js).
// public.activity_log also stores consumer activity from the mobile app, so the
// admin portal's Activity Log view is scoped to these types via ?scope=admin.
// `points_topped_up` is intentionally excluded: it is a wallet event, not a
// moderation/administrative action, and it cluttered the admin activity view.
const ADMIN_ACTIVITY_TYPES = [
  'user_suspended',
  'user_reinstated',
  'user_archived',
  'user_unarchived',
  'user_deleted',
  'user_flagged',
  'user_warned',
  'user_auto_suspended',
  'user_warning_complied',
  'password_reset',
  'user_invited',
  'invite_accepted',
  'invite_resent',
  'invite_revoked',
  'invite_delivery_failed',
  'points_deducted',
  'content_flagged',
];

function normalizeDateBound(value, endOfDay = false) {
  if (!value) return null;
  const raw = String(value).trim();
  // Date-only inputs (YYYY-MM-DD) are treated as inclusive day bounds.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return endOfDay ? `${raw}T23:59:59.999Z` : `${raw}T00:00:00.000Z`;
  }
  return raw;
}

async function listActivityLog(req, res) {
  const {
    userId,
    relatedUserId,
    activityType,
    category,
    scope,
    actorRole,
    startDate,
    endDate,
    limit,
    page,
    order,
  } = req.query;

  const p = Math.max(1, parseInt(page || '1', 10));
  const l = Math.min(100, Math.max(1, parseInt(limit || '50', 10)));

  // Admins can audit any staff agent. Support accounts may only read their own
  // action history, so their user filter is forced to the authenticated caller.
  const adminViewer = isAdmin(req);
  const effectiveUserId = adminViewer ? userId : req.user?.id;

  let query = supabase
    .from('activity_log')
    .select('*, users_table!activity_log_user_id_fkey(first_name, last_name, email), target:users_table!activity_log_related_user_id_fkey(first_name, last_name, email)', { count: 'exact' });

  if (effectiveUserId) query = query.eq('user_id', effectiveUserId);
  if (relatedUserId) query = query.eq('related_user_id', relatedUserId);
  if (activityType) query = query.eq('activity_type', activityType);
  if (category) query = query.eq('category', category);
  // Non-admins always get the staff action types, never the consumer feed.
  if (scope === 'admin' || !adminViewer) query = query.in('activity_type', ADMIN_ACTIVITY_TYPES);

  // Narrow to the staff role that performed the action (admin support auditing).
  // A concrete agent selection already implies the role, so it wins.
  if (adminViewer && !effectiveUserId && actorRole && actorRole !== 'all') {
    const { data: actors, error: actorError } = await supabase
      .from('users_table')
      .select('id')
      .eq('role', actorRole);
    if (actorError) return sendError(res, actorError, { status: 500 });

    const actorIds = (actors || []).map((actor) => actor.id);
    if (actorIds.length === 0) {
      return res.json({
        data: [],
        pagination: { total: 0, page: p, limit: l, totalPages: 0 },
      });
    }
    query = query.in('user_id', actorIds);
  }

  const startBound = normalizeDateBound(startDate, false);
  const endBound = normalizeDateBound(endDate, true);
  if (startBound) query = query.gte('created_at', startBound);
  if (endBound) query = query.lte('created_at', endBound);

  const ascending = order === 'asc';
  query = query.range((p - 1) * l, p * l - 1).order('created_at', { ascending });

  const { data, error, count } = await query;
  if (error) return sendError(res, error, { status: 500 });

  const rows = (data || []).map((row) => {
    const camel = toCamelCase(row);
    const user = row.users_table || {};
    const target = row.target || {};
    return {
      ...camel,
      agentName: getFullName(user) || user.email || 'Unknown',
      relatedUserName: getFullName(target) || target.email || null,
      activityTypeLabel: activityTypeLabel(camel.activityType),
    };
  });

  res.json({
    data: rows,
    pagination: {
      total: count || 0,
      page: p,
      limit: l,
      totalPages: Math.ceil((count || 0) / l),
    },
  });
}

async function createActivityLog(req, res) {
  const {
    userId,
    activityType,
    category,
    description,
    relatedListingId,
    relatedJobPostId,
    relatedUserId,
    relatedPaymentRequestId,
    amount,
  } = req.body;

  const agentId = req.user?.id || null;

  const { data, error } = await supabase
    .from('activity_log')
    .insert({
      user_id: userId || agentId,
      activity_type: activityType,
      category: category,
      description: description,
      related_listing_id: relatedListingId || null,
      related_job_post_id: relatedJobPostId || null,
      related_user_id: relatedUserId || null,
      related_payment_request_id: relatedPaymentRequestId || null,
      amount: amount !== undefined && amount !== null ? Number(amount) : null,
    })
    .select()
    .single();

  if (error) return sendError(res, error, { status: 500 });

  const inserted = toCamelCase(data);
  inserted.agentName = req.user?.name || req.user?.email || 'Admin';

  res.status(201).json({ data: inserted });
}

module.exports = {
  listActivityLog,
  createActivityLog,
  activityTypeLabel,
  ACTIVITY_TYPE_MAP,
  ADMIN_ACTIVITY_TYPES,
};
