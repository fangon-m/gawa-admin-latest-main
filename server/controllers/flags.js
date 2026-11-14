const supabase = require('../db/supabase');
const { toCamelCase, sendError } = require('../utilities/helpers');
const { logAdminActivity } = require('../utilities/activityLogger');

function openFlagQuery(query) {
  // Backward-compatible: treat legacy rows without a status as open.
  return query.or('status.eq.open,status.is.null');
}

async function listFlags(req, res) {
  const { entityType, entityId, status } = req.query;
  let query = supabase.from('entity_flags').select('*');

  if (entityType) query = query.eq('entity_type', entityType);
  if (entityId) query = query.eq('entity_id', entityId);
  if (status) query = query.eq('status', status);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) return sendError(res, error, { status: 500 });
  res.json({ data: (data || []).map(toCamelCase) });
}

async function createFlag(req, res) {
  const { entityType, entityId, reason } = req.body;
  if (!entityType || !entityId) {
    return res.status(400).json({ error: 'entityType and entityId are required' });
  }

  const { data, error } = await supabase
    .from('entity_flags')
    .insert({
      entity_type: entityType,
      entity_id: entityId,
      flagged_by: req.user?.id || null,
      reason: reason?.trim() || null,
      status: 'open',
    })
    .select()
    .single();

  if (error) return sendError(res, error, { status: 500 });
  res.status(201).json({ data: toCamelCase(data) });
}

async function removeFlag(req, res) {
  const { error } = await supabase.from('entity_flags').delete().eq('flag_id', req.params.id);
  if (error) return sendError(res, error, { status: 500 });
  res.json({ message: 'Flag removed' });
}

async function getFlaggedContentCounts(req, res) {
  const countOpen = async (entityType) => {
    const { count } = await supabase
      .from('entity_flags')
      .select('flag_id', { count: 'exact', head: true })
      .eq('entity_type', entityType)
      .eq('status', 'open');
    return count || 0;
  };

  const [jobFlags, listingFlags, reviewFlags] = await Promise.all([
    countOpen('job_post'),
    countOpen('equipment_listing'),
    countOpen('review'),
  ]);

  const total = jobFlags + listingFlags + reviewFlags;

  res.json({
    data: {
      total,
      byType: {
        jobPost: jobFlags,
        equipmentListing: listingFlags,
        review: reviewFlags,
      },
    },
  });
}

async function resolveFlagState(req, res, nextStatus) {
  const { id } = req.params;
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';

  const { data: flag, error: fetchErr } = await supabase
    .from('entity_flags')
    .select('*')
    .eq('flag_id', id)
    .maybeSingle();

  if (fetchErr) return sendError(res, fetchErr, { status: 500 });
  if (!flag) return res.status(404).json({ error: 'Flag not found' });
  if (flag.status && flag.status !== 'open') {
    return res.status(409).json({ error: 'Flag is already closed' });
  }

  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from('entity_flags')
    .update({
      status: nextStatus,
      resolved_by: req.user?.id || null,
      resolved_at: now,
      resolution_note: note || null,
    })
    .eq('flag_id', id)
    .select()
    .single();

  if (error) return sendError(res, error, { status: 500 });

  if (flag.entity_type === 'job_post') {
    logAdminActivity({
      actorId: req.user?.id,
      activityType: 'content_flagged',
      category: 'job',
      relatedJobPostId: flag.entity_id,
      description: `Admin ${nextStatus} flag for job post ${flag.entity_id}${note ? `: ${note}` : ''}`,
    });
  }

  res.json({ data: toCamelCase(updated), message: `Flag ${nextStatus}` });
}

async function resolveFlag(req, res) {
  return resolveFlagState(req, res, 'resolved');
}

async function dismissFlag(req, res) {
  return resolveFlagState(req, res, 'dismissed');
}

module.exports = { listFlags, createFlag, removeFlag, getFlaggedContentCounts, resolveFlag, dismissFlag };
