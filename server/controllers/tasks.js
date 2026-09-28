const supabase = require('../db/supabase');
const { toCamelCase } = require('../utilities/helpers');

async function listCompletions(req, res) {
  const { data, error } = await supabase
    .from('job_completion')
    .select('*')
    .eq('job_match_id', req.params.matchId)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
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

  if (error) return res.status(500).json({ error: error.message });
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
  const { error } = await supabase
    .from('job_completion')
    .delete()
    .eq('job_completion_id', req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Completion record deleted' });
}

module.exports = { listCompletions, createCompletion, updateCompletion, deleteCompletion };
