const supabase = require('../db/supabase');
const { toCamelCase, getFullName, calculatePagination, sendError } = require('../utilities/helpers');
const { logAdminActivity } = require('../utilities/activityLogger');

async function enrichWithUser(items, userIdKey = 'user_id') {
  if (!items || items.length === 0) return [];
  const userIds = new Set();
  items.forEach(item => { if (item[userIdKey]) userIds.add(item[userIdKey]); });

  const userMap = {};
  const userEmailMap = {};
  if (userIds.size > 0) {
    const { data: users } = await supabase.from('users_table').select('id, first_name, last_name, email').in('id', [...userIds]);
    if (users) {
      users.forEach(u => { 
        userMap[u.id] = getFullName(u);
        userEmailMap[u.id] = u.email;
      });
    }
  }

  return items.map(item => ({ ...toCamelCase(item), userName: userMap[item[userIdKey]] || item[userIdKey], userEmail: userEmailMap[item[userIdKey]] }));
}

async function enrichWallets(wallets) {
  return enrichWithUser(wallets, 'user_id');
}

async function listPacks(req, res) {
  const { isActive } = req.query;
  let query = supabase.from('gawa_points_packs').select('*');
  if (isActive !== undefined) query = query.eq('is_active', isActive === 'true');
  query = query.order('sort_order', { ascending: true }).order('price_php', { ascending: true });

  const { data, error } = await query;
  if (error) return sendError(res, error, { status: 500 });
  res.json({ data: data.map(p => ({ ...p, isActive: p.is_active, packId: p.pack_id, displayName: p.display_name, pricePhp: p.price_php, costPerPoint: p.cost_per_point, sortOrder: p.sort_order, createdAt: p.created_at, updatedAt: p.updated_at })) });
}

async function createPack(req, res) {
  const { displayName, points, pricePhp, description, costPerPoint, sortOrder } = req.body;
  if (!displayName || !points || !pricePhp) return res.status(400).json({ error: 'Display name, points, and price are required' });

  const { data, error } = await supabase
    .from('gawa_points_packs')
    .insert({
      display_name: displayName,
      points: +points,
      price_php: +pricePhp,
      description: description || null,
      cost_per_point: costPerPoint ? +costPerPoint : +pricePhp / +points,
      sort_order: sortOrder || 0,
      is_active: true,
    })
    .select()
    .single();

  if (error) return sendError(res, error, { status: 500 });
  res.status(201).json({ data: { ...data, isActive: data.is_active, packId: data.pack_id, displayName: data.display_name, pricePhp: data.price_php, costPerPoint: data.cost_per_point, sortOrder: data.sort_order, createdAt: data.created_at }, message: 'Pack created' });
}

async function updatePack(req, res) {
  const allowed = ['displayName', 'points', 'pricePhp', 'description', 'costPerPoint', 'sortOrder', 'isActive'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      updates[dbKey] = req.body[key];
    }
  }
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('gawa_points_packs')
    .update(updates)
    .eq('pack_id', req.params.id)
    .select()
    .single();

  if (error || !data) return res.status(404).json({ error: 'Pack not found' });
  res.json({ data: { ...data, isActive: data.is_active, packId: data.pack_id, displayName: data.display_name, pricePhp: data.price_php, costPerPoint: data.cost_per_point, sortOrder: data.sort_order, createdAt: data.created_at, updatedAt: data.updated_at }, message: 'Pack updated' });
}

async function deletePack(req, res) {
  const { error } = await supabase.from('gawa_points_packs').delete().eq('pack_id', req.params.id);
  if (error) return sendError(res, error, { status: 500 });
  res.json({ message: 'Pack deleted' });
}

async function issuePoints(req, res) {
  const { userId, amount: pts, reason } = req.body;
  if (!userId || !pts) return res.status(400).json({ error: 'userId and amount are required' });
  if (+pts <= 0) return res.status(400).json({ error: 'Amount must be a positive number' });

  const { data: txn, error: txnErr } = await supabase
    .from('gawa_points_transactions')
    .insert({
      user_id: userId,
      transaction_type: 'credit',
      amount: +pts,
      description: reason || 'Manual issue',
    })
    .select()
    .single();

  if (txnErr) return sendError(res, txnErr, { status: 500 });

  const { data: wallet } = await supabase.from('gawa_points_wallets').select('balance').eq('user_id', userId).single();
  if (wallet) {
    const newBalance = (parseFloat(wallet.balance) || 0) + +pts;
    const { error: walletErr } = await supabase
      .from('gawa_points_wallets')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    if (walletErr) return sendError(res, walletErr, { status: 500 });
  } else {
    const { error: walletErr } = await supabase
      .from('gawa_points_wallets')
      .insert({ user_id: userId, balance: +pts, updated_at: new Date().toISOString() });
    if (walletErr) return sendError(res, walletErr, { status: 500 });
  }

  res.json({ data: txn, message: `${pts} points issued to user ${userId}` });

  logAdminActivity({
    actorId: req.user?.id,
    activityType: 'points_topped_up',
    category: 'wallet',
    relatedUserId: userId,
    amount: +pts,
    description: `Admin issued ${pts} points to user ${userId}: ${reason || 'no reason'}`,
  });
}

async function deductPoints(req, res) {
  const { userId, amount: pts, reason } = req.body;
  if (!userId || !pts) return res.status(400).json({ error: 'userId and amount are required' });
  if (+pts <= 0) return res.status(400).json({ error: 'Amount must be a positive number' });

  const absPts = +pts;

  const { data: wallet } = await supabase.from('gawa_points_wallets').select('balance').eq('user_id', userId).single();
  if (wallet && (+wallet.balance || 0) < absPts) return res.status(400).json({ error: 'Insufficient balance' });

  const { data: txn, error: txnErr } = await supabase
    .from('gawa_points_transactions')
    .insert({
      user_id: userId,
      transaction_type: 'proposal_charge',
      amount: -absPts,
      description: reason || 'Manual deduction',
    })
    .select()
    .single();

  if (txnErr) return sendError(res, txnErr, { status: 500 });

  if (wallet) {
    const newBalance = (parseFloat(wallet.balance) || 0) - absPts;
    const { error: walletErr } = await supabase
      .from('gawa_points_wallets')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    if (walletErr) return sendError(res, walletErr, { status: 500 });
  } else {
    const { error: walletErr } = await supabase
      .from('gawa_points_wallets')
      .insert({ user_id: userId, balance: -absPts, updated_at: new Date().toISOString() });
    if (walletErr) return sendError(res, walletErr, { status: 500 });
  }

  res.json({ data: txn, message: `${absPts} points deducted from user ${userId}` });
}

async function listPointsTransactions(req, res) {
  const { page, limit, offset } = calculatePagination(req.query.page, req.query.limit);
  const { userId, transactionType } = req.query;
  let query = supabase.from('gawa_points_transactions').select('*', { count: 'exact' });
  if (userId) query = query.eq('user_id', userId);
  if (transactionType) query = query.eq('transaction_type', transactionType);
  query = query.order('created_at', { ascending: false }).range(offset, offset + +limit - 1);

  const { data, error, count } = await query;
  if (error) return sendError(res, error, { status: 500 });
  const enriched = await enrichWithUser(data || [], 'user_id');
  res.json({
    data: enriched,
    pagination: { total: count, page: +page, limit: +limit, totalPages: Math.ceil(count / +limit) },
  });
}

async function listWallets(req, res) {
  const { page, limit, offset } = calculatePagination(req.query.page, req.query.limit);
  const { userId } = req.query;

  let query = supabase.from('gawa_points_wallets').select('*', { count: 'exact' });
  if (userId) query = query.eq('user_id', userId);
  query = query.order('updated_at', { ascending: false }).range(offset, offset + +limit - 1);

  const { data, error, count } = await query;
  if (error) return sendError(res, error, { status: 500 });
  const enriched = await enrichWallets(data || []);
  res.json({
    data: enriched,
    pagination: { total: count, page: +page, limit: +limit, totalPages: Math.ceil(count / +limit) },
  });
}

async function adjustWallet(req, res) {
  const { amount, description } = req.body;
  if (amount === undefined || !description || !description.trim()) {
    return res.status(400).json({ error: 'amount and description are required' });
  }

  const { data: wallet, error: fetchErr } = await supabase.from('gawa_points_wallets').select('*').eq('user_id', req.params.userId).single();
  if (fetchErr || !wallet) return res.status(404).json({ error: 'Wallet not found' });

  const newBalance = (parseFloat(wallet.balance) || 0) + parseFloat(amount);
  if (newBalance < 0) return res.status(400).json({ error: 'Insufficient balance' });

  // The balance is only overwritten if it has not changed since it was read.
  // Without this guard two concurrent adjustments would both succeed and the
  // second write would discard the first one.
  const { data, error } = await supabase
    .from('gawa_points_wallets')
    .update({ balance: newBalance, updated_at: new Date().toISOString() })
    .eq('user_id', req.params.userId)
    .eq('balance', wallet.balance)
    .select()
    .maybeSingle();

  if (error) return sendError(res, error, { status: 500 });
  if (!data) {
    return res.status(409).json({
      error: 'The wallet balance changed while this adjustment was being applied. Reload and try again.',
      code: 'WALLET_CHANGED',
    });
  }
  const enriched = await enrichWallets([data]);
  res.json({ data: enriched[0], message: `Balance adjusted by ${amount}` });
}

module.exports = { listPacks, createPack, updatePack, deletePack, issuePoints, deductPoints, listPointsTransactions, listWallets, adjustWallet };