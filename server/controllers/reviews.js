const supabase = require('../db/supabase');
const { toCamelCase, getFullName, calculatePagination, sendError } = require('../utilities/helpers');

async function enrichReviews(reviews) {
  if (!reviews || reviews.length === 0) return [];
  const userIds = new Set();
  reviews.forEach(r => {
    if (r.reviewer_id) userIds.add(r.reviewer_id);
    if (r.reviewee_id) userIds.add(r.reviewee_id);
  });

  let userMap = {};
  if (userIds.size > 0) {
    const { data: users } = await supabase
      .from('users_table')
      .select('id, first_name, last_name')
      .in('id', [...userIds]);
    if (users) users.forEach(u => { userMap[u.id] = getFullName(u); });
  }

  return reviews.map(r => ({
    ...toCamelCase(r),
    reviewerName: userMap[r.reviewer_id] || r.reviewer_id,
    revieweeName: userMap[r.reviewee_id] || r.reviewee_id,
  }));
}

async function listReviews(req, res) {
  const { page, limit, offset } = calculatePagination(req.query.page, req.query.limit);
  const { jobCompletionId, reviewerId, revieweeId } = req.query;

  let query = supabase.from('reviews').select('*', { count: 'exact' });
  if (jobCompletionId) query = query.eq('job_completion_id', jobCompletionId);
  if (reviewerId) query = query.eq('reviewer_id', reviewerId);
  if (revieweeId) query = query.eq('reviewee_id', revieweeId);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + +limit - 1);

  if (error) return sendError(res, error, { status: 500 });

  res.json({
    data: await enrichReviews(data || []),
    pagination: { total: count, page: +page, limit: +limit, totalPages: Math.ceil(count / +limit) },
  });
}

async function getReviewById(req, res) {
  const { data: review, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('review_id', req.params.id)
    .single();

  if (error || !review) return res.status(404).json({ error: 'Review not found' });

  const enriched = await enrichReviews([review]);
  res.json({ data: enriched[0] });
}

module.exports = { listReviews, getReviewById };