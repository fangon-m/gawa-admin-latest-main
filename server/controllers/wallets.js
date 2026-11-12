const supabase = require('../db/supabase');
const { toCamelCase, getFullName, calculatePagination, sendError } = require('../utilities/helpers');

// The wallet table is `gawa_points_wallets`, keyed by `user_id`. The wallet
// identifier used throughout the API is the owner's user id.
const WALLETS_TABLE = 'gawa_points_wallets';

async function enrichWallets(wallets) {
  if (!wallets || wallets.length === 0) return [];
  const userIds = new Set();
  wallets.forEach(w => { if(w.user_id) userIds.add(w.user_id); });

  const userMap = {};
  if (userIds.size > 0) {
    const { data: users } = await supabase.from('users_table').select('id, first_name, last_name').in('id', [...userIds]);
    (users || []).forEach(u => { userMap[u.id] = getFullName(u); });
  }

  return wallets.map(w => ({ ...toCamelCase(w), userName: userMap[w.user_id] || w.user_id }));
}

async function listWallets(req, res) {
  const { page, limit, offset } = calculatePagination(req.query.page, req.query.limit);
  const { userId } = req.query;

  let query = supabase.from(WALLETS_TABLE).select('*', { count: 'exact' });
  if (userId) query = query.eq('user_id', userId);
  query = query.order('updated_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) return sendError(res, error, { status: 500 });
  res.json({
    data: await enrichWallets(data || []),
    pagination: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
  });
}

async function getWalletById(req, res) {
  const { data, error } = await supabase.from(WALLETS_TABLE).select('*').eq('user_id', req.params.id).single();
  if (error || !data) return res.status(404).json({ error: 'Wallet not found' });
  const enriched = await enrichWallets([data]);
  res.json({ data: enriched[0] });
}

async function getWalletByUserId(req, res) {
  const { data, error } = await supabase.from(WALLETS_TABLE).select('*').eq('user_id', req.params.userId).maybeSingle();
  if (error || !data) return res.status(404).json({ error: 'Wallet not found for this user' });
  const enriched = await enrichWallets([data]);
  res.json({ data: enriched[0] });
}

async function adjustBalance(req, res) {
  const { amount, description } = req.body;
  if (amount === undefined || !description || !description.trim()) {
    return res.status(400).json({ error: 'amount and description are required' });
  }

  const { data: wallet, error: fetchErr } = await supabase.from(WALLETS_TABLE).select('*').eq('user_id', req.params.id).single();
  if (fetchErr || !wallet) return res.status(404).json({ error: 'Wallet not found' });

  const newBalance = (parseFloat(wallet.balance) || 0) + parseFloat(amount);
  if (newBalance < 0) return res.status(400).json({ error: 'Insufficient balance' });

  // The balance is only overwritten if it has not changed since it was read.
  // Without this guard two concurrent adjustments would both succeed and the
  // second write would discard the first one.
  const { data, error } = await supabase
    .from(WALLETS_TABLE)
    .update({ balance: newBalance, updated_at: new Date().toISOString() })
    .eq('user_id', req.params.id)
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

module.exports = { listWallets, getWalletById, getWalletByUserId, adjustBalance };
