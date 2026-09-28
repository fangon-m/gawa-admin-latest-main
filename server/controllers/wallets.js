const supabase = require('../db/supabase');
const { toCamelCase, getFullName } = require('../utilities/helpers');

async function enrichWallets(wallets) {
  if (!wallets || wallets.length === 0) return [];
  const userIds = new Set();
  wallets.forEach(w => { if (w.user_id) userIds.add(w.user_id); });

  const userMap = {};
  if (userIds.size > 0) {
    const { data: users } = await supabase.from('users_table').select('id, first_name, last_name').in('id', [...userIds]);
    if (users) users.forEach(u => { userMap[u.id] = getFullName(u); });
  }

  return wallets.map(w => ({ ...toCamelCase(w), userName: userMap[w.user_id] || w.user_id }));
}

async function listWallets(req, res) {
  const { page = 1, limit = 20, userId } = req.query;
  const offset = (Math.max(1, +page) - 1) * +limit;

  let query = supabase.from('wallets').select('*', { count: 'exact' });
  if (userId) query = query.eq('user_id', userId);
  query = query.order('updated_at', { ascending: false }).range(offset, offset + +limit - 1);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({
    data: await enrichWallets(data || []),
    pagination: { total: count, page: +page, limit: +limit, totalPages: Math.ceil(count / +limit) },
  });
}

async function getWalletById(req, res) {
  const { data, error } = await supabase.from('wallets').select('*').eq('wallet_id', req.params.id).single();
  if (error || !data) return res.status(404).json({ error: 'Wallet not found' });
  const enriched = await enrichWallets([data]);
  res.json({ data: enriched[0] });
}

async function getWalletByUserId(req, res) {
  const { data, error } = await supabase.from('wallets').select('*').eq('user_id', req.params.userId).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Wallet not found for this user' });
  const enriched = await enrichWallets([data]);
  res.json({ data: enriched[0] });
}

async function adjustBalance(req, res) {
  const { amount, description } = req.body;
  if (amount === undefined || !description || !description.trim()) {
    return res.status(400).json({ error: 'amount and description are required' });
  }

  const { data: wallet, error: fetchErr } = await supabase.from('wallets').select('*').eq('wallet_id', req.params.id).single();
  if (fetchErr || !wallet) return res.status(404).json({ error: 'Wallet not found' });

  const newBalance = (parseFloat(wallet.balance) || 0) + parseFloat(amount);
  if (newBalance < 0) return res.status(400).json({ error: 'Insufficient balance' });

  const { data, error } = await supabase.from('wallets').update({ balance: newBalance, updated_at: new Date().toISOString() }).eq('wallet_id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  const enriched = await enrichWallets([data]);
  res.json({ data: enriched[0], message: `Balance adjusted by ${amount}` });
}

module.exports = { listWallets, getWalletById, getWalletByUserId, adjustBalance };
