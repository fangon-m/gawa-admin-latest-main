const supabase = require('../db/supabase');
const { toCamelCase, getFullName } = require('../utilities/helpers');

async function listReviews(req, res) {
  const { page = 1, limit = 20, status, targetType, flagsGt } = req.query;
  const offset = (Math.max(1, +page) - 1) * +limit;

  let query = supabase.from('reviews').select('*', { count: 'exact' });
  if (status) query = query.eq('status', status);
  if (targetType) query = query.eq('target_type', targetType);
  if (flagsGt) query = query.gt('flags', +flagsGt);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + +limit - 1);

  if (error) return res.status(500).json({ error: error.message });

  // Enrich with reviewer and target names
  // target_type values are: talent, equipment_owner, contractor — all reference profiles
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const userIds = new Set();

  data.forEach((r) => {
    if (r.reviewer_id) userIds.add(r.reviewer_id);
    if (r.target_id && uuidRegex.test(r.target_id)) userIds.add(r.target_id);
  });

  let userMap = {};
  if (userIds.size > 0) {
    const { data: users } = await supabase
      .from('users_table')
      .select('id, first_name, last_name')
      .in('id', [...userIds]);
    if (users) users.forEach((u) => { userMap[u.id] = getFullName(u); });
  }

  const enriched = (data || []).map((r) => ({
    ...toCamelCase(r),
    reviewerName: userMap[r.reviewer_id] || r.reviewer_id,
    // target_id may be a UUID or a non-UUID reference string; only resolve if it looks like a UUID
    targetName: uuidRegex.test(r.target_id) ? (userMap[r.target_id] || r.target_id) : r.target_id,
  }));

  res.json({
    data: enriched,
    pagination: { total: count, page: +page, limit: +limit, totalPages: Math.ceil(count / +limit) },
  });
}

async function getReviewById(req, res) {
  const { data: review, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error || !review) return res.status(404).json({ error: 'Review not found' });

  const { data: reviewer } = await supabase
    .from('users_table')
    .select('first_name, last_name')
    .eq('id', review.reviewer_id)
    .single();

  const { data: target } = review.target_id
    ? await supabase.from('users_table').select('first_name, last_name').eq('id', review.target_id).single()
    : { data: null };

  res.json({
    data: {
      ...toCamelCase(review),
      reviewerName: reviewer ? getFullName(reviewer) : review.reviewer_id,
      targetName: target ? getFullName(target) : review.target_id,
    },
  });
}

async function moderateReview(req, res) {
  const { action } = req.body;
  if (!action || !['keep', 'warn', 'hide', 'remove'].includes(action)) {
    return res.status(400).json({ error: 'Action must be keep, warn, hide, or remove' });
  }

  const updates = {};
  if (action === 'keep') {
    updates.status = 'published';
    updates.flags = 0;
  } else if (action === 'warn' || action === 'hide') {
    updates.status = 'hidden';
  } else if (action === 'remove') {
    updates.status = 'hidden';
  }

  const { data, error } = await supabase
    .from('reviews')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error || !data) return res.status(404).json({ error: 'Review not found' });
  res.json({ data: toCamelCase(data), message: `Review moderated: ${action}` });
}

module.exports = { listReviews, getReviewById, moderateReview };
