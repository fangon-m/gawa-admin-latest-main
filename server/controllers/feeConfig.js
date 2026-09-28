const supabase = require('../db/supabase');
const { toCamelCase } = require('../utilities/helpers');

async function listConfigs(req, res) {
  const { data, error } = await supabase
    .from('fee_configs')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ data: (data || []).map(toCamelCase) });
}

async function getActiveConfig(req, res) {
  const { data, error } = await supabase
    .from('fee_configs')
    .select('*')
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return res.status(404).json({ error: 'No active fee configuration found' });
  res.json({ data: toCamelCase(data) });
}

async function createConfig(req, res) {
  const { name, proposalGpCost, platformFeePercent, gpConversionRate, listingFee, rentalCommission } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const { count } = await supabase
    .from('fee_configs')
    .select('*', { count: 'exact', head: true });

  const { data, error } = await supabase
    .from('fee_configs')
    .insert({
      name,
      proposal_gp_cost: proposalGpCost ?? 50,
      platform_fee_percent: platformFeePercent ?? 2.5,
      gp_conversion_rate: gpConversionRate ?? 1.0,
      listing_fee: listingFee ?? 0,
      rental_commission: rentalCommission ?? 10,
      is_active: count === 0,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ data: toCamelCase(data), message: 'Fee configuration created' });
}

async function updateConfig(req, res) {
  const allowed = ['name', 'proposalGpCost', 'platformFeePercent', 'gpConversionRate', 'listingFee', 'rentalCommission'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      updates[dbKey] = req.body[key];
    }
  }
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('fee_configs')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error || !data) return res.status(404).json({ error: 'Fee configuration not found' });
  res.json({ data: toCamelCase(data), message: 'Fee configuration updated' });
}

async function deleteConfig(req, res) {
  const { data: existing } = await supabase
    .from('fee_configs')
    .select('is_active')
    .eq('id', req.params.id)
    .single();

  if (!existing) return res.status(404).json({ error: 'Fee configuration not found' });
  if (existing.is_active) {
    return res.status(400).json({ error: 'Cannot delete active configuration. Set another as active first.' });
  }

  const { error } = await supabase.from('fee_configs').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Fee configuration deleted' });
}

async function setActiveConfig(req, res) {
  const { data: target } = await supabase
    .from('fee_configs')
    .select('id')
    .eq('id', req.params.id)
    .single();

  if (!target) return res.status(404).json({ error: 'Fee configuration not found' });

  await supabase.from('fee_configs').update({ is_active: false }).neq('id', req.params.id);
  const { data, error } = await supabase
    .from('fee_configs')
    .update({ is_active: true })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ data: toCamelCase(data), message: 'Active fee configuration updated' });
}

module.exports = { listConfigs, getActiveConfig, createConfig, updateConfig, deleteConfig, setActiveConfig };
