const supabase = require('../db/supabase');
const { toCamelCase, getFullName } = require('../utilities/helpers');

async function getMatchWithPost(matchId) {
  const { data, error } = await supabase
    .from('job_matches')
    .select('*, job_posts(*)')
    .eq('job_match_id', matchId)
    .single();
  return { match: data, error };
}

async function releasePayment(post, match, adminUser) {
  const { error: txnErr } = await supabase
    .from('transactions')
    .insert({
      type: 'job_payment',
      amount: match.agreed_price || 0,
      status: 'completed',
      payment_method: 'wallet',
      user_id: match.user_id,
      related_id: post.job_post_id,
      related_type: 'job_post',
      description: `Payment for job "${post.job_title}"`,
      net_amount: match.agreed_price || 0,
    });
  return txnErr;
}

async function markDone(req, res) {
  const { matchId } = req.params;
  const { match, error: fetchErr } = await getMatchWithPost(matchId);
  if (fetchErr || !match) return res.status(404).json({ error: 'Match not found' });
  if (match.status !== 'accepted' && match.status !== 'in_progress') {
    return res.status(400).json({ error: 'Match must be accepted to mark as done' });
  }

  const { error } = await supabase
    .from('job_matches')
    .update({ status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('job_match_id', matchId);

  if (error) return res.status(500).json({ error: error.message });

  const { error: compErr } = await supabase
    .from('job_completion')
    .insert({
      job_match_id: matchId,
      client_id: match.client_id,
      user_id: match.user_id,
      requested_at: new Date().toISOString(),
    });

  if (compErr) console.error('[markDone] completion record error:', compErr.message);

  res.json({ message: 'Completion requested' });
}

async function confirmCompletion(req, res) {
  const { matchId } = req.params;
  const { match, error: fetchErr } = await getMatchWithPost(matchId);
  if (fetchErr || !match) return res.status(404).json({ error: 'Match not found' });
  if (match.status !== 'completed') return res.status(400).json({ error: 'Match is not in completed status' });

  const post = match.job_posts;
  const txnErr = await releasePayment(post, match, req.user);
  if (txnErr) return res.status(500).json({ error: 'Payment failed: ' + txnErr.message });

  await supabase.from('job_posts').update({ job_status: 'finished', updated_at: new Date().toISOString() }).eq('job_post_id', post.job_post_id);
  await supabase.from('job_matches').update({ status: 'verified', confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('job_match_id', matchId);
  await supabase.from('job_completion').update({ confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('job_match_id', matchId).is('confirmed_at', null);

  res.json({ message: 'Completion confirmed, payment released' });
}

async function disputeCompletion(req, res) {
  const { matchId } = req.params;
  const { match, error: fetchErr } = await getMatchWithPost(matchId);
  if (fetchErr || !match) return res.status(404).json({ error: 'Match not found' });

  await supabase.from('job_matches').update({ status: 'in_progress', updated_at: new Date().toISOString() }).eq('job_match_id', matchId);

  res.json({ message: 'Completion disputed, status reverted to in_progress' });
}

async function listDisputed(req, res) {
  const { page = 1, limit = 20 } = req.query;
  const offset = (Math.max(1, +page) - 1) * +limit;

  const { data, error, count } = await supabase
    .from('job_posts')
    .select('*, job_matches!inner(*)', { count: 'exact' })
    .eq('job_matches.status', 'completed')
    .range(offset, offset + +limit - 1)
    .order('updated_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  const userIds = new Set();
  (data || []).forEach(p => {
    if (p.client_id) userIds.add(p.client_id);
    (p.job_matches || []).forEach(m => { if (m.user_id) userIds.add(m.user_id); });
  });

  const userMap = {};
  if (userIds.size > 0) {
    const { data: users } = await supabase.from('users_table').select('id, first_name, last_name, role').in('id', [...userIds]);
    if (users) users.forEach(u => { userMap[u.id] = { ...u, fullName: getFullName(u) }; });
  }

  const enriched = (data || []).map(p => {
    const match = (p.job_matches || [])[0];
    return {
      ...toCamelCase(p),
      match: match ? toCamelCase(match) : null,
      clientName: userMap[p.client_id]?.fullName || p.client_id,
      talentName: match ? (userMap[match.user_id]?.fullName || match.user_id) : null,
    };
  });

  res.json({
    data: enriched,
    pagination: { total: count, page: +page, limit: +limit, totalPages: Math.ceil(count / +limit) },
  });
}

async function resolveDispute(req, res) {
  const { matchId } = req.params;
  const { action } = req.body;
  if (!action || !['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'action must be "approve" or "reject"' });
  }

  const { match, error: fetchErr } = await getMatchWithPost(matchId);
  if (fetchErr || !match) return res.status(404).json({ error: 'Match not found' });

  const post = match.job_posts;

  if (action === 'approve') {
    const txnErr = await releasePayment(post, match, req.user);
    if (txnErr) return res.status(500).json({ error: 'Payment failed: ' + txnErr.message });

    await supabase.from('job_posts').update({ job_status: 'finished', updated_at: new Date().toISOString() }).eq('job_post_id', post.job_post_id);
    await supabase.from('job_matches').update({ status: 'verified', confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('job_match_id', matchId);
    await supabase.from('job_completion').update({ confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('job_match_id', matchId).is('confirmed_at', null);

    return res.json({ message: 'Dispute resolved — payment approved and released' });
  }

  await supabase.from('job_posts').update({ job_status: 'flagged', updated_at: new Date().toISOString() }).eq('job_post_id', post.job_post_id);
  await supabase.from('job_matches').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('job_match_id', matchId);

  res.json({ message: 'Dispute resolved — payment rejected, job flagged' });
}

async function processExpiredReviews(req, res) {
  const REVIEW_DAYS = 3;
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - REVIEW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: expired } = await supabase
    .from('job_matches')
    .select('*, job_posts(*)')
    .eq('status', 'completed')
    .is('confirmed_at', null)
    .lt('completed_at', cutoff);

  if (!expired || expired.length === 0) return res.json({ message: 'No expired reviews to process' });

  for (const match of expired) {
    try {
      const post = match.job_posts;
      const txnErr = await releasePayment(post, match, req.user);
      if (txnErr) { console.error('[Auto-complete] Payment error:', txnErr.message); continue; }

      await supabase.from('job_posts').update({ job_status: 'finished', updated_at: now }).eq('job_post_id', post.job_post_id);
      await supabase.from('job_matches').update({ status: 'verified', confirmed_at: now, updated_at: now }).eq('job_match_id', match.job_match_id);
      await supabase.from('job_completion').update({ confirmed_at: now, updated_at: now }).eq('job_match_id', match.job_match_id).is('confirmed_at', null);

      console.log(`[Auto-complete] Job "${post.job_title}" auto-completed — payment released.`);
    } catch (err) {
      console.error(`[Auto-complete] Failed for match ${match.job_match_id}:`, err.message);
    }
  }

  res.json({ message: `Processed ${expired.length} expired completions` });
}

module.exports = { markDone, confirmCompletion, disputeCompletion, listDisputed, resolveDispute, processExpiredReviews };
