const supabase = require('../db/supabase');
const { toCamelCase, getFullName } = require('../utilities/helpers');

async function getStats(req, res) {
  const now = new Date();
  // Use a fixed early start date to include seed data and all historical transactions
  const chartStartDate = '2024-01-01T00:00:00Z';

  async function safeQuery(promise) {
    try { return await promise; } catch { return { data: null, count: 0, error: null }; }
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
    safeQuery(supabase.from('id_verifications').select('user_id', { count: 'exact', head: true }).eq('status', 'approved')),
    safeQuery(supabase.from('job_posts').select('*', { count: 'exact', head: true }).eq('job_status', 'active')),
    safeQuery(supabase.from('rentals').select('*', { count: 'exact', head: true }).eq('status', 'active')),
    safeQuery(supabase.from('disputes').select('id', { count: 'exact', head: true }).not('status', 'in', '("resolved","dismissed")')),
    safeQuery(supabase.from('entity_flags').select('flag_id', { count: 'exact', head: true }).eq('entity_type', 'job_post')),
    safeQuery(supabase.from('entity_flags').select('flag_id', { count: 'exact', head: true }).eq('entity_type', 'equipment_listing')),
    safeQuery(supabase.from('entity_flags').select('flag_id', { count: 'exact', head: true }).eq('entity_type', 'review')),
    safeQuery(supabase.from('transactions').select('*', { count: 'exact', head: true })),
    safeQuery(supabase.from('id_verifications').select('*', { count: 'exact', head: true }).eq('status', 'pending')),
    safeQuery(supabase.from('appeals').select('*', { count: 'exact', head: true }).eq('status', 'pending')),
    safeQuery(supabase.from('galaw_points_transactions').select('points').in('type', ['purchase', 'issued'])),
    safeQuery(supabase.from('galaw_points_transactions').select('points').in('type', ['consumed', 'deducted'])),
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

  const pendingVerificationsList = (pendingVerificationsListData.data || []).map(v => ({
    ...toCamelCase(v),
    userName: nameMap[v.user_id]?.fullName || v.user_id,
    userRole: nameMap[v.user_id]?.role || null,
  }));

  const openDisputesList = (openDisputesListData.data || []).map(d => ({
    ...toCamelCase(d),
    reporterName: nameMap[d.reporter_id]?.fullName || d.reporter_id,
    respondentName: nameMap[d.respondent_id]?.fullName || d.respondent_id,
    assignedName: nameMap[d.assigned_to]?.fullName || null,
  }));

  // Compute galaw points totals
  const totalGalawPointsPurchased = (purchasedData.data || []).reduce((s, r) => s + Math.abs(r.points), 0);
  const totalGalawPointsConsumed = (consumedData.data || []).reduce((s, r) => s + Math.abs(r.points), 0);
  const outstandingGalawPoints = totalGalawPointsPurchased - totalGalawPointsConsumed;

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
    safeQuery(supabase.from('job_posts').select('*', { count: 'exact', head: true }).gte('created_at', currentMonthStart)),
    safeQuery(supabase.from('job_posts').select('*', { count: 'exact', head: true }).lt('created_at', currentMonthStart).gte('created_at', prevMonthStart)),
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
    verifiedUsers: verifiedUsers || 0,
    activeJobs: activeJobs || 0,
    activeRentals: activeRentals || 0,
    pendingDisputes: pendingDisputesData.count || 0,
    flaggedContent,
    totalTransactions: totalTransactions || 0,
    pendingVerifications: pendingVerifications || 0,
    pendingAppeals: pendingAppeals || 0,
    totalGalawPointsPurchased,
    totalGalawPointsConsumed,
    outstandingGalawPoints,
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
