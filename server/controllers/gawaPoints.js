const supabase = require('../db/supabase');
const { toCamelCase } = require('../utilities/helpers');

async function listPacks(req, res) {
  const { isActive } = req.query;
  let query = supabase.from('gawa_points_packs').select('*');
  if (isActive !== undefined) query = query.eq('is_active', isActive === 'true');
  query = query.order('price', { ascending: true });

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data: data.map(p => ({ ...p, isActive: p.is_active, createdAt: p.created_at, updatedAt: p.updated_at })) });
}

async function createPack(req, res) {
  const { name, points, price, description } = req.body;
  if (!name || !points || !price) return res.status(400).json({ error: 'Name, points, and price are required' });

  const { data, error } = await supabase
    .from('gawa_points_packs')
    .insert({
      name,
      points: +points,
      price: +price,
      description: description || null,
      is_active: true,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ data: { ...data, isActive: data.is_active, createdAt: data.created_at }, message: 'Pack created' });
}

async function updatePack(req, res) {
  const allowed = ['name', 'points', 'price', 'description', 'isActive'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      const dbKey = key === 'isActive' ? 'is_active' : key;
      updates[dbKey] = req.body[key];
    }
  }
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('gawa_points_packs')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error || !data) return res.status(404).json({ error: 'Pack not found' });
  res.json({ data: { ...data, isActive: data.is_active, createdAt: data.created_at, updatedAt: data.updated_at }, message: 'Pack updated' });
}

async function deletePack(req, res) {
  const { error } = await supabase.from('gawa_points_packs').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Pack deleted' });
}

async function issuePoints(req, res) {
  const { userId, points: pts, reason } = req.body;
  if (!userId || !pts) return res.status(400).json({ error: 'userId and points are required' });
  if (+pts <= 0) return res.status(400).json({ error: 'Points must be a positive number' });

  const { data: txn, error: txnErr } = await supabase
    .from('gawa_points_transactions')
    .insert({
      user_id: userId,
      type: 'issued',
      points: +pts,
      description: reason || 'Manual issue',
    })
    .select()
    .single();

  if (txnErr) return res.status(500).json({ error: txnErr.message });

  res.json({ data: txn, message: `${pts} points issued to user ${userId}` });
}

async function deductPoints(req, res) {
  const { userId, points: pts, reason } = req.body;
  if (!userId || !pts) return res.status(400).json({ error: 'userId and points are required' });
  if (+pts <= 0) return res.status(400).json({ error: 'Points must be a positive number' });

  const absPts = +pts;

  const { data: txn, error: txnErr } = await supabase
    .from('gawa_points_transactions')
    .insert({
      user_id: userId,
      type: 'deducted',
      points: -absPts,
      description: reason || 'Manual deduction',
    })
    .select()
    .single();

  if (txnErr) return res.status(500).json({ error: txnErr.message });

  res.json({ data: txn, message: `${absPts} points deducted from user ${userId}` });
}

async function listPointsTransactions(req, res) {
  const { page = 1, limit = 20, userId, type } = req.query;
  const offset = (Math.max(1, +page) - 1) * +limit;
  let query = supabase.from('gawa_points_transactions').select('*', { count: 'exact' });
  if (userId) query = query.eq('user_id', userId);
  if (type) query = query.eq('type', type);
  query = query.order('created_at', { ascending: false }).range(offset, offset + +limit - 1);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({
    data: (data || []).map(toCamelCase),
    pagination: { total: count, page: +page, limit: +limit, totalPages: Math.ceil(count / +limit) },
  });
}

module.exports = { listPacks, createPack, updatePack, deletePack, issuePoints, deductPoints, listPointsTransactions };
