const supabase = require('../db/supabase');

/**
 * GET /api/settings
 * Returns all app settings as a flat object { key: value, ... }
 */
async function listSettings(req, res) {
  const { data, error } = await supabase
    .from('app_settings')
    .select('*')
    .order('key');

  if (error) return res.status(500).json({ error: error.message });

  const settings = {};
  for (const row of data || []) {
    settings[row.key] = row.value;
  }

  res.json({ data: settings });
}

/**
 * GET /api/settings/:key
 * Returns a single setting value
 */
async function getSetting(req, res) {
  const { data, error } = await supabase
    .from('app_settings')
    .select('*')
    .eq('key', req.params.key)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Setting not found' });

  res.json({ data: { key: data.key, value: data.value, updatedAt: data.updated_at } });
}

/**
 * PUT /api/settings/:key
 * Creates or updates a setting value. Upserts by key.
 */
async function upsertSetting(req, res) {
  const { value } = req.body;
  if (value === undefined || value === null) {
    return res.status(400).json({ error: 'Value is required' });
  }

  const updates = {
    key: req.params.key,
    value: String(value),
    updated_by: req.user?.id || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('app_settings')
    .upsert(updates, { onConflict: 'key' })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.json({
    data: { key: data.key, value: data.value, updatedAt: data.updated_at },
    message: 'Setting saved successfully',
  });
}

module.exports = { listSettings, getSetting, upsertSetting };
