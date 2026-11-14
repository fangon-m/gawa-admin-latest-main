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

// The `gawa_points_packs` table has no `description`, `created_at` or
// `updated_at` columns, so the controller must only ever touch the columns
// that actually exist: pack_id, display_name, points, price_php,
// cost_per_point, sort_order and is_active.
//
// `cost_per_point` is a GENERATED ALWAYS AS (round(price_php / points, 2))
// STORED column, so it is read-only: PostgREST rejects any insert or update
// that names it (SQLSTATE 428C9). The database derives it for us and we only
// read it back.
function serializePack(pack) {
  return {
    packId: pack.pack_id,
    displayName: pack.display_name,
    points: pack.points,
    pricePhp: pack.price_php,
    costPerPoint: pack.cost_per_point,
    sortOrder: pack.sort_order,
    isActive: pack.is_active,
  };
}

function toPositiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function slugifyPackId(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * `pack_id` is a text primary key with no database default, so a new pack has
 * to be given one. A slug of the display name is readable and stable; a
 * numeric suffix keeps it unique when two packs share a name.
 */
async function uniquePackId(displayName) {
  const root = slugifyPackId(displayName) || 'pack';
  let candidate = root;
  let suffix = 2;
  for (;;) {
    const { data, error } = await supabase
      .from('gawa_points_packs')
      .select('pack_id')
      .eq('pack_id', candidate)
      .maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
    candidate = `${root}-${suffix++}`;
  }
}

/** `sort_order` is NOT NULL and UNIQUE with no default, so pick the next slot. */
async function nextSortOrder() {
  const { data, error } = await supabase
    .from('gawa_points_packs')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data && data.length ? (Number(data[0].sort_order) || 0) + 1 : 1;
}

async function listPacks(req, res) {
  const { isActive } = req.query;
  let query = supabase.from('gawa_points_packs').select('*');
  if (isActive !== undefined) query = query.eq('is_active', isActive === 'true');
  query = query.order('sort_order', { ascending: true }).order('price_php', { ascending: true });

  const { data, error } = await query;
  if (error) return sendError(res, error, { status: 500 });
  res.json({ data: (data || []).map(serializePack) });
}

async function createPack(req, res) {
  const { displayName, points, pricePhp, sortOrder } = req.body;
  const parsedPoints = toPositiveNumber(points);
  const parsedPrice = toPositiveNumber(pricePhp);

  if (!displayName || !String(displayName).trim()) {
    return res.status(400).json({ error: 'Pack name is required' });
  }
  if (!parsedPoints) return res.status(400).json({ error: 'Points must be a positive number' });
  if (!parsedPrice) return res.status(400).json({ error: 'Price must be a positive number' });

  let packId;
  let order;
  try {
    packId = await uniquePackId(displayName);
    order = sortOrder === undefined || sortOrder === null || sortOrder === ''
      ? await nextSortOrder()
      : Number(sortOrder);
  } catch (err) {
    return sendError(res, err, { status: 500, fallback: 'Could not prepare the new pack' });
  }
  if (!Number.isFinite(order) || order < 0) {
    return res.status(400).json({ error: 'Sort order must be zero or greater' });
  }

  const { data, error } = await supabase
    .from('gawa_points_packs')
    .insert({
      pack_id: packId,
      display_name: String(displayName).trim(),
      points: parsedPoints,
      price_php: parsedPrice,
      sort_order: order,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'That sort order is already in use. Choose a different one.' });
    }
    return sendError(res, error, { status: 500, fallback: 'Could not create the pack' });
  }
  res.status(201).json({ data: serializePack(data), message: 'Pack created' });
}

async function updatePack(req, res) {
  const { data: existing, error: fetchErr } = await supabase
    .from('gawa_points_packs')
    .select('*')
    .eq('pack_id', req.params.id)
    .maybeSingle();

  if (fetchErr) return sendError(res, fetchErr, { status: 500 });
  if (!existing) return res.status(404).json({ error: 'Pack not found' });

  const updates = {};
  if (req.body.displayName !== undefined) {
    if (!String(req.body.displayName).trim()) return res.status(400).json({ error: 'Pack name is required' });
    updates.display_name = String(req.body.displayName).trim();
  }
  if (req.body.points !== undefined) {
    const parsed = toPositiveNumber(req.body.points);
    if (!parsed) return res.status(400).json({ error: 'Points must be a positive number' });
    updates.points = parsed;
  }
  if (req.body.pricePhp !== undefined) {
    const parsed = toPositiveNumber(req.body.pricePhp);
    if (!parsed) return res.status(400).json({ error: 'Price must be a positive number' });
    updates.price_php = parsed;
  }
  // `cost_per_point` is generated from price and points, so any client-supplied
  // value is ignored rather than written (the database rejects it, SQLSTATE 428C9).
  if (req.body.sortOrder !== undefined && req.body.sortOrder !== null && req.body.sortOrder !== '') {
    const parsed = Number(req.body.sortOrder);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return res.status(400).json({ error: 'Sort order must be zero or greater' });
    }
    updates.sort_order = parsed;
  }
  if (req.body.isActive !== undefined) {
    updates.is_active = !!req.body.isActive;
  }

  if (Object.keys(updates).length === 0) {
    return res.json({ data: serializePack(existing), message: 'No changes to apply' });
  }

  const { data, error } = await supabase
    .from('gawa_points_packs')
    .update(updates)
    .eq('pack_id', req.params.id)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'That sort order is already in use. Choose a different one.' });
    }
    return sendError(res, error, { status: 500, fallback: 'Could not update the pack' });
  }
  res.json({ data: serializePack(data), message: 'Pack updated' });
}

async function deletePack(req, res) {
  const { data, error } = await supabase
    .from('gawa_points_packs')
    .delete()
    .eq('pack_id', req.params.id)
    .select('pack_id');

  if (error) return sendError(res, error, { status: 500 });
  if (!data || data.length === 0) return res.status(404).json({ error: 'Pack not found' });
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