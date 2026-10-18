const supabase = require('../db/supabase');
const { toCamelCase, getFullName } = require('../utilities/helpers');

async function getStats(req, res) {
  // Ensure connection is alive before running queries
  await supabase.ensureConnection();
  
  const now = new Date();
  // Use a fixed early start date to include seed data and all historical transactions
  const chartStartDate = '2024-01-01T00:00:00Z';

  async function safeQuery(promise) {
    try { return await promise; } catch (err) { 
      console.error('[Dashboard] Query error:', err.message);
      return { data: null, count: 0, error: err }; 
    }
  }

  // Run all aggregation queries in parallel
  const [
    { count: totalUsers },
    { count: verifiedUsers },
    { count: activeJobs },
    { count: activeRentals },
    flaggedJobsData,
    flaggedListingsData,
    flaggedReviewsData,
    { count: totalTransactions },
    { count: pendingVerifications },
    purchasedData,
    consumedData,
    rawMonthlyTx,
    roleDistData,
    recentActionsData,
    pendingVerificationsListData,
  ] = await Promise.all([
    safeQuery(supabase.from('users_table').select('*', { count: 'exact', head: true }).not('role', 'in', '("admin","customer_support")')),
    safeQuery(supabase.from('users_table').select('*', { count: 'exact', head: true }).eq('is_verified', true).not('role', 'in', '("admin","customer_support")')),
    safeQuery(supabase.from('job_posts').select('*', { count: 'exact', head: true }).in('job_status', ['open', 'in_progress'])),
    safeQuery(supabase.from('equipment_rentals').select('*', { count: 'exact', head: true }).eq('rental_status', 'active')),
    safeQuery(supabase.from('entity_flags').select('flag_id', { count: 'exact', head: true }).eq('entity_type', 'job_post')),
    safeQuery(supabase.from('entity_flags').select('flag_id', { count: 'exact', head: true }).eq('entity_type', 'equipment_listing')),
    safeQuery(supabase.from('entity_flags').select('flag_id', { count: 'exact', head: true }).eq('entity_type', 'review')),
    safeQuery(supabase.from('transactions').select('*', { count: 'exact', head: true })),
    safeQuery(supabase.from('id_verifications').select('*', { count: 'exact', head: true }).eq('status', 'pending')),
    safeQuery(supabase.from('gawa_points_transactions').select('amount').in('transaction_type', ['credit'])),
    safeQuery(supabase.from('gawa_points_transactions').select('amount').in('transaction_type', ['proposal_charge'])),
    safeQuery(supabase.from('transactions').select('amount, created_at')
      .gte('created_at', chartStartDate)
      .in('status', ['completed', 'escrow', 'held'])
      .order('created_at', { ascending: true })),
    safeQuery(supabase.from('users_table').select('role').not('role', 'in', '("admin","customer_support")')),
    safeQuery(supabase.from('activity_log').select('*, users_table!activity_log_user_id_fkey(first_name, last_name, email)').order('created_at', { ascending: false }).limit(10)),
    safeQuery(supabase.from('id_verifications').select('*').eq('status', 'pending').order('submitted_at', { ascending: false }).limit(5)),
  ]);

  // Enrich names for dashboard list cards
  const verifUserIds = new Set();
  (pendingVerificationsListData.data || []).forEach(v => { if (v.user_id) verifUserIds.add(v.user_id); });

  let nameMap = {};
  if (verifUserIds.size > 0) {
    const { data: users } = await supabase.from('users_table').select('id, first_name, last_name, role').in('id', [...verifUserIds]);
    if (users) users.forEach(u => { nameMap[u.id] = { ...u, fullName: getFullName(u) }; });
  }

  const pendingVerificationsList = (pendingVerificationsListData.data || []).map(v => {
    const user = nameMap[v.user_id];
    const fullName = user?.fullName || `${v.first_name || ''} ${v.middle_name ? v.middle_name + ' ' : ''}${v.last_name || ''}`.trim();
    return {
      ...toCamelCase(v),
      userName: fullName || v.user_id,
      userRole: user?.role || v.role || 'Client',
      userEmail: v.email,
      idType: v.government_id_type,
    };
  });

  // Compute gawa points totals
  const totalGawaPointsPurchased = (purchasedData.data || []).reduce((s, r) => s + Math.abs(r.amount), 0);
  const totalGawaPointsConsumed = (consumedData.data || []).reduce((s, r) => s + Math.abs(r.amount), 0);
  const outstandingGawaPoints = totalGawaPointsPurchased - totalGawaPointsConsumed;

  // Count flagged content
  const flaggedContent = (flaggedJobsData.count || 0) + (flaggedListingsData.count || 0) + (flaggedReviewsData.count || 0);

  // User role distribution
  const roleCounts = {};
  for (const p of roleDistData.data || []) {
    const normalizedRole = String(p.role || '')
      .toLowerCase()
      .replace(/_/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
    if (!normalizedRole || normalizedRole === 'admin' || normalizedRole === 'customer support') continue;
    roleCounts[normalizedRole] = (roleCounts[normalizedRole] || 0) + 1;
  }
  const userRoleDistribution = Object.entries(roleCounts)
    .map(([role, count]) => ({
      role: role.charAt(0).toUpperCase() + role.slice(1),
      count,
    }));

  // Build monthly chart data from parallel query
  const monthlyMap = {};
  for (const t of rawMonthlyTx?.data || []) {
    const monthKey = t.created_at.slice(0, 7);
    monthlyMap[monthKey] = (monthlyMap[monthKey] || 0) + Number(t.amount);
  }
  const monthlyTransactions = Object.entries(monthlyMap).map(([month, amount]) => ({
    month,
    amount: Math.round(amount),
  }));

  // Recent actions
  const recentActions = (recentActionsData.data || []).map(a => {
    const actor = a.users_table || {};
    return {
      action: a.activity_type,
      agent: getFullName(actor) || actor.email || 'System',
      target: a.description,
      date: a.created_at,
    };
  });

  // Growth rates (compare current month vs previous month)
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

  const [
    { count: currentUsers },
    { count: prevUsers },
    { count: currentJobs },
    { count: prevJobs },
    { count: currentTxns },
    { count: prevTxns },
  ] = await Promise.all([
    safeQuery(supabase.from('users_table').select('*', { count: 'exact', head: true }).not('role', 'in', '("admin","customer_support")').gte('created_at', currentMonthStart)),
    safeQuery(supabase.from('users_table').select('*', { count: 'exact', head: true }).not('role', 'in', '("admin","customer_support")').lt('created_at', currentMonthStart).gte('created_at', prevMonthStart)),
    safeQuery(supabase.from('job_posts').select('*', { count: 'exact', head: true }).in('job_status', ['open', 'in_progress']).gte('created_at', currentMonthStart)),
    safeQuery(supabase.from('job_posts').select('*', { count: 'exact', head: true }).in('job_status', ['open', 'in_progress']).lt('created_at', currentMonthStart).gte('created_at', prevMonthStart)),
    safeQuery(supabase.from('transactions').select('*', { count: 'exact', head: true }).gte('created_at', currentMonthStart)),
    safeQuery(supabase.from('transactions').select('*', { count: 'exact', head: true }).lt('created_at', currentMonthStart).gte('created_at', prevMonthStart)),
  ]);

  const calcGrowth = (curr, prev) => {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  };

  const result = {
    totalUsers: totalUsers || 0,
    totalUsersGrowth: calcGrowth(currentUsers, prevUsers),
    verifiedUsers: verifiedUsers || 0,
    verifiedUsersGrowth: 0, // no direct query for this, could compute if needed
    activeJobs: activeJobs || 0,
    activeJobsGrowth: calcGrowth(currentJobs, prevJobs),
    activeRentals: activeRentals || 0,
    activeRentalsGrowth: 0,
    flaggedContent,
    flaggedContentGrowth: 0,
    totalTransactions: totalTransactions || 0,
    totalTransactionsGrowth: calcGrowth(currentTxns, prevTxns),
    pendingVerifications: pendingVerifications || 0,
    pendingVerificationsGrowth: 0,
    totalGawaPointsPurchased,
    totalGawaPointsConsumed,
    outstandingGawaPoints,
    monthlyTransactions,
    userRoleDistribution,
    recentActions,
    userGrowth: calcGrowth(currentUsers, prevUsers),
    jobGrowth: calcGrowth(currentJobs, prevJobs),
    transactionGrowth: calcGrowth(currentTxns, prevTxns),
    pendingVerificationsList,
  };

  res.json({ data: result });
}

module.exports = { getStats };
