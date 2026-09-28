const supabase = require('../db/supabase');
const { toCamelCase } = require('../utilities/helpers');

async function listFlags(req, res) {
  const { entityType, entityId } = req.query;
  let query = supabase.from('entity_flags').select('*');

  if (entityType) query = query.eq('entity_type', entityType);
  if (entityId) query = query.eq('entity_id', entityId);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
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
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ data: toCamelCase(data) });
}

async function removeFlag(req, res) {
  const { error } = await supabase.from('entity_flags').delete().eq('flag_id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Flag removed' });
}

async function getFlaggedContentCounts(req, res) {
  const [jobFlags, listingFlags, reviewFlags] = await Promise.all([
    supabase.from('entity_flags').select('flag_id', { count: 'exact', head: true }).eq('entity_type', 'job_post'),
    supabase.from('entity_flags').select('flag_id', { count: 'exact', head: true }).eq('entity_type', 'equipment_listing'),
    supabase.from('entity_flags').select('flag_id', { count: 'exact', head: true }).eq('entity_type', 'review'),
  ]);

  const total = (jobFlags.count || 0) + (listingFlags.count || 0) + (reviewFlags.count || 0);

  res.json({
    data: {
      total,
      byType: {
        jobPost: jobFlags.count || 0,
        equipmentListing: listingFlags.count || 0,
        review: reviewFlags.count || 0,
      },
    },
  });
}

module.exports = { listFlags, createFlag, removeFlag, getFlaggedContentCounts };
