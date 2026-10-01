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
    pendingDisputesData,
    flaggedJobsData,
    flaggedListingsData,
    flaggedReviewsData,
    { count: totalTransactions },
    { count: pendingVerifications },
    { count: pendingAppeals },
    purchasedData,
    consumedData,
    incidentsThisMonthData,
    rawMonthlyTx,
    roleDistData,
    recentActionsData,
    pendingVerificationsListData,
    openDisputesListData,
  ] = await Promise.all([
    safeQuery(supabase.from('users_table').select('*', { count: 'exact', head: true }).not('role', 'in', '("admin","customer_support")')),
    safeQuery(supabase.from('users_table').select('*', { count: 'exact', head: true }).eq('is_verified', true).not('role', 'in', '("admin","customer_support")')),
    safeQuery(supabase.from('job_posts').select('*', { count: 'exact', head: true }).in('job_status', ['open', 'in_progress'])),
    safeQuery(supabase.from('equipment_rentals').select('*', { count: 'exact', head: true }).eq('rental_status', 'active')),
    safeQuery(supabase.from('disputes').select('id', { count: 'exact', head: true }).not('status', 'in', '("resolved","dismissed")')),
    safeQuery(supabase.from('entity_flags').select('flag_id', { count: 'exact', head: true }).eq('entity_type', 'job_post')),
    safeQuery(supabase.from('entity_flags').select('flag_id', { count: 'exact', head: true }).eq('entity_type', 'equipment_listing')),
    safeQuery(supabase.from('entity_flags').select('flag_id', { count: 'exact', head: true }).eq('entity_type', 'review')),
    safeQuery(supabase.from('transactions').select('*', { count: 'exact', head: true })),
    safeQuery(supabase.from('id_verifications').select('*', { count: 'exact', head: true }).eq('status', 'pending')),
    safeQuery(supabase.from('appeals').select('*', { count: 'exact', head: true }).eq('status', 'pending')),
    safeQuery(supabase.from('gawa_points_transactions').select('points').in('type', ['purchase', 'issued'])),
    safeQuery(supabase.from('gawa_points_transactions').select('points').in('type', ['consumed', 'deducted'])),
    safeQuery(supabase.from('incident_logs').select('*', { count: 'exact', head: true })
      .gte('created_at', new Date(now.getFullYear(), now.getMonth(), 1).toISOString())),
    safeQuery(supabase.from('transactions').select('amount, created_at')
      .gte('created_at', chartStartDate)
      .in('status', ['completed', 'escrow', 'held'])
      .order('created_at', { ascending: true })),
    safeQuery(supabase.from('users_table').select('role').not('role', 'in', '("admin","customer_support")')),
    safeQuery(supabase.from('incident_logs').select('*').order('created_at', { ascending: false }).limit(10)),
    safeQuery(supabase.from('id_verifications').select('*').eq('status', 'pending').order('submitted_at', { ascending: false }).limit(5)),
    safeQuery(supabase.from('disputes').select('*').not('status', 'in', '("resolved","dismissed")').order('created_at', { ascending: false }).limit(4)),
  ]);

  // Enrich names for dashboard list cards
  const verifUserIds = new Set();
  (pendingVerificationsListData.data || []).forEach(v => { if (v.user_id) verifUserIds.add(v.user_id); });
  const disputeUserIds = new Set();
  (openDisputesListData.data || []).forEach(d => {
    if (d.reporter_id) disputeUserIds.add(d.reporter_id);
    if (d.respondent_id) disputeUserIds.add(d.respondent_id);
    if (d.assigned_to) disputeUserIds.add(d.assigned_to);
  });

  const allNameIds = new Set([...verifUserIds, ...disputeUserIds]);
  let nameMap = {};
  if (allNameIds.size > 0) {
    const { data: users } = await supabase.from('users_table').select('id, first_name, last_name, role').in('id', [...allNameIds]);
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

  const openDisputesList = (openDisputesListData.data || []).map(d => ({
    ...toCamelCase(d),
    reporterName: nameMap[d.reporter_id]?.fullName || d.reporter_id,
    respondentName: nameMap[d.respondent_id]?.fullName || d.respondent_id,
    assignedName: nameMap[d.assigned_to]?.fullName || null,
  }));

  // Compute gawa points totals
  const totalGawaPointsPurchased = (purchasedData.data || []).reduce((s, r) => s + Math.abs(r.points), 0);
  const totalGawaPointsConsumed = (consumedData.data || []).reduce((s, r) => s + Math.abs(r.points), 0);
  const outstandingGawaPoints = totalGawaPointsPurchased - totalGawaPointsConsumed;

  // Count flagged content
  const flaggedContent = (flaggedJobsData.count || 0) + (flaggedListingsData.count || 0) + (flaggedReviewsData.count || 0);

  // User role distribution
  const roleCounts = {};
  for (const p of roleDistData.data || []) {
    roleCounts[p.role] = (roleCounts[p.role] || 0) + 1;
  }
  const userRoleDistribution = Object.entries(roleCounts)
    .map(([role, count]) => ({ role: role.charAt(0).toUpperCase() + role.slice(1).replace(/_/g, ' '), count }));

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
  const recentActions = (recentActionsData.data || []).map(a => ({
    action: a.action,
    agent: a.agent_name,
    target: a.target_type ? `${a.target_type} ${a.target_id || ''}` : a.module,
    date: a.created_at,
  }));

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
    { count: currentDisputes },
    { count: prevDisputes },
  ] = await Promise.all([
    safeQuery(supabase.from('users_table').select('*', { count: 'exact', head: true }).not('role', 'in', '("admin","customer_support")').gte('created_at', currentMonthStart)),
    safeQuery(supabase.from('users_table').select('*', { count: 'exact', head: true }).not('role', 'in', '("admin","customer_support")').lt('created_at', currentMonthStart).gte('created_at', prevMonthStart)),
    safeQuery(supabase.from('job_posts').select('*', { count: 'exact', head: true }).in('job_status', ['open', 'in_progress']).gte('created_at', currentMonthStart)),
    safeQuery(supabase.from('job_posts').select('*', { count: 'exact', head: true }).in('job_status', ['open', 'in_progress']).lt('created_at', currentMonthStart).gte('created_at', prevMonthStart)),
    safeQuery(supabase.from('transactions').select('*', { count: 'exact', head: true }).gte('created_at', currentMonthStart)),
    safeQuery(supabase.from('transactions').select('*', { count: 'exact', head: true }).lt('created_at', currentMonthStart).gte('created_at', prevMonthStart)),
    safeQuery(supabase.from('disputes').select('*', { count: 'exact', head: true }).gte('created_at', currentMonthStart)),
    safeQuery(supabase.from('disputes').select('*', { count: 'exact', head: true }).lt('created_at', currentMonthStart).gte('created_at', prevMonthStart)),
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
    pendingDisputes: pendingDisputesData.count || 0,
    pendingDisputesGrowth: calcGrowth(currentDisputes, prevDisputes),
    flaggedContent,
    flaggedContentGrowth: 0,
    totalTransactions: totalTransactions || 0,
    totalTransactionsGrowth: calcGrowth(currentTxns, prevTxns),
    pendingVerifications: pendingVerifications || 0,
    pendingVerificationsGrowth: 0,
    pendingAppeals: pendingAppeals || 0,
    totalGawaPointsPurchased,
    totalGawaPointsConsumed,
    outstandingGawaPoints,
    incidentsThisMonth: incidentsThisMonthData.count || 0,
    monthlyTransactions,
    userRoleDistribution,
    recentActions,
    userGrowth: calcGrowth(currentUsers, prevUsers),
    jobGrowth: calcGrowth(currentJobs, prevJobs),
    transactionGrowth: calcGrowth(currentTxns, prevTxns),
    disputeGrowth: calcGrowth(currentDisputes, prevDisputes),
    pendingVerificationsList,
    openDisputesList,
  };

  res.json({ data: result });
}

module.exports = { getStats };
