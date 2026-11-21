const supabase = require('../db/supabase');
const { toCamelCase, sendError } = require('../utilities/helpers');

async function listCompletions(req, res) {
  const { data, error } = await supabase
    .from('job_completion')
    .select('*')
    .eq('job_match_id', req.params.matchId)
    .order('created_at', { ascending: true });

  if (error) return sendError(res, error, { status: 500 });
  res.json({ data: (data || []).map(toCamelCase) });
}

async function createCompletion(req, res) {
  const { message } = req.body;

  const { data: match, error: matchErr } = await supabase
    .from('job_matches')
    .select('*')
    .eq('job_match_id', req.params.matchId)
    .single();

  if (matchErr || !match) return res.status(404).json({ error: 'Job match not found' });

  const { data, error } = await supabase
    .from('job_completion')
    .insert({
      job_match_id: req.params.matchId,
      client_id: match.client_id,
      user_id: match.user_id,
      message: message?.trim() || null,
      requested_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return sendError(res, error, { status: 500 });
  res.status(201).json({ data: toCamelCase(data), message: 'Completion record created' });
}

async function updateCompletion(req, res) {
  const { message, supportingImagesUrl } = req.body;

  const updates = {};
  if (message !== undefined) updates.message = message?.trim() || null;
  if (supportingImagesUrl !== undefined) updates.supporting_images_url = supportingImagesUrl;

  const { data, error } = await supabase
    .from('job_completion')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('job_completion_id', req.params.id)
    .select()
    .single();

  if (error || !data) return res.status(404).json({ error: 'Completion record not found' });
  res.json({ data: toCamelCase(data), message: 'Completion record updated' });
}

async function deleteCompletion(req, res) {
  const completionId = req.params.id;
  const { data: completion, error: fetchError } = await supabase
    .from('job_completion')
    .select('job_completion_id, job_match_id, confirmed_at')
    .eq('job_completion_id', completionId)
    .maybeSingle();
  if (fetchError) return sendError(res, fetchError, { status: 500 });
  if (!completion) return res.status(404).json({ error: 'Completion record not found' });

  const { data: match } = await supabase
    .from('job_matches')
    .select('job_post_id, status')
    .eq('job_match_id', completion.job_match_id)
    .maybeSingle();

  const { count: reviewCount, error: reviewError } = await supabase
    .from('reviews')
    .select('review_id', { count: 'exact', head: true })
    .eq('job_completion_id', completionId);
  if (reviewError) return sendError(res, reviewError, { status: 500 });

  let paymentCount = 0;
  if (match?.job_post_id) {
    const { count, error: paymentError } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('related_type', 'job_post')
      .eq('related_id', match.job_post_id);
    if (paymentError) return sendError(res, paymentError, { status: 500 });
    paymentCount = count || 0;
  }

  const completedWork = Boolean(completion.confirmed_at)
    || ['completed', 'verified'].includes(match?.status);
  if (completedWork || reviewCount > 0 || paymentCount > 0) {
    return res.status(409).json({
      error: 'This completion has confirmed work, a review, or payment history and cannot be deleted. It is part of the job audit trail.',
    });
  }

  const { error } = await supabase
    .from('job_completion')
    .delete()
    .eq('job_completion_id', completionId);

  if (error) return sendError(res, error, { status: 500 });
  res.json({ message: 'Completion record deleted' });
}

module.exports = { listCompletions, createCompletion, updateCompletion, deleteCompletion };
