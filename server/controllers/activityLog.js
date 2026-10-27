const supabase = require('../db/supabase');
const { toCamelCase, getFullName } = require('../utilities/helpers');

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
  'points_topped_up',
  'content_flagged',
];

async function listActivityLog(req, res) {
  const {
    userId,
    activityType,
    category,
    scope,
    startDate,
    endDate,
    limit,
    page,
  } = req.query;

  let query = supabase
    .from('activity_log')
    .select('*, users_table!activity_log_user_id_fkey(first_name, last_name, email), target:users_table!activity_log_related_user_id_fkey(first_name, last_name, email)', { count: 'exact' });

  if (userId) query = query.eq('user_id', userId);
  if (activityType) query = query.eq('activity_type', activityType);
  if (category) query = query.eq('category', category);
  if (scope === 'admin') query = query.in('activity_type', ADMIN_ACTIVITY_TYPES);
  if (startDate) query = query.gte('created_at', startDate);
  if (endDate) query = query.lte('created_at', endDate);

  const p = Math.max(1, parseInt(page || '1', 10));
  const l = Math.min(100, Math.max(1, parseInt(limit || '50', 10)));
  query = query.range((p - 1) * l, p * l - 1).order('created_at', { ascending: false });

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });

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

  if (error) return res.status(500).json({ error: error.message });

  const inserted = toCamelCase(data);
  inserted.agentName = req.user?.name || req.user?.email || 'Admin';

  res.status(201).json({ data: inserted });
}

module.exports = { listActivityLog, createActivityLog };
