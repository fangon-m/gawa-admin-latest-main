import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../utils/permissions';
import { useApiData } from '../utils/useApiData';
import { get } from '../api/client';
import { formatNumber, formatDate, timeAgo } from '../utils/helpers';
import Header from '../components/layout/Header';
import StatCard from '../components/common/StatCard';
import ChartCard from '../components/common/ChartCard';
import StatusBadge from '../components/common/StatusBadge';
import SeverityBadge from '../components/common/SeverityBadge';
import { Users, UserRoundCheck, Briefcase, Building2, ShieldAlertIcon, AlertTriangle, ArrowLeftRightIcon, Star, Sword, RotateCcw, Activity, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import styles from './Dashboard.module.css';

const chartColors = ['#2563EB', '#C75A1B', '#16A34A', '#9333EA', '#D97706', '#0891B2', '#BE123C'];

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isSupport } = usePermissions(user?.role);

  const { data: dashStats, loading } = useApiData(
    () => get('/dashboard/stats'),
    [],
    { defaultValue: {}, transform: (r) => r?.data ?? r ?? {} }
  );

  const stats = {
    totalUsers: dashStats.totalUsers || 0,
    verifiedUsers: dashStats.verifiedUsers || 0,
    activeJobs: dashStats.activeJobs || 0,
    activeRentals: dashStats.activeRentals || 0,
    pendingDisputes: dashStats.pendingDisputes || 0,
    flaggedContent: dashStats.flaggedContent || 0,
    totalTransactions: dashStats.totalTransactions || 0,
    pendingVerifications: dashStats.pendingVerifications || 0,
  };

  const pendingV = (dashStats.pendingVerificationsList || []).slice(0, 5);
  const openD = (dashStats.openDisputesList || []).slice(0, 4);
  const recentActions = dashStats.recentActions || [];

  // Backend already excludes admin + customer_support from role queries.
  // This client-side filter is a safety net for any leftover edge cases.
  const userRoleDistribution = (dashStats.userRoleDistribution || []).filter(
    (item) => item.role !== 'Admin' && item.role !== 'Customer support'
  );

  const verificationPct = stats.totalUsers > 0 ? Math.round((stats.verifiedUsers / stats.totalUsers) * 100) : 0;

  const summaryCards = [
    { label: 'Total Users', value: formatNumber(stats.totalUsers), icon: <Users size={20} />, color: 'var(--color-blue)' },
    { label: 'Verified Users', value: formatNumber(stats.verifiedUsers), icon: <UserRoundCheck size={20} />, color: 'var(--color-success)' },
    { label: 'Active Jobs', value: formatNumber(stats.activeJobs), icon: <Briefcase size={20} />, color: 'var(--color-text)' },
    { label: 'Active Rentals', value: formatNumber(stats.activeRentals), icon: <Building2 size={20} />, color: 'var(--color-accent)' },
    { label: 'Pending Disputes', value: formatNumber(stats.pendingDisputes), icon: <ShieldAlertIcon size={20} />, color: 'var(--color-warning)' },
    { label: 'Flagged Content', value: formatNumber(stats.flaggedContent), icon: <AlertTriangle size={20} />, color: 'var(--color-error)' },
    { label: 'Total Transactions', value: formatNumber(stats.totalTransactions), icon: <ArrowLeftRightIcon size={20} />, color: 'var(--color-success)' },
    { label: 'Pending Verifications', value: formatNumber(stats.pendingVerifications), icon: <UserRoundCheck size={20} />, color: 'var(--color-text-muted)' },
  ];

  const quickActions = [
    { label: 'Review Verifications', icon: <UserRoundCheck size={18} />, path: '/verifications', permission: 'viewVerifications' },
    { label: 'View Disputes', icon: <ShieldAlertIcon size={18} />, path: '/oversight', permission: 'viewDisputes' },
    { label: 'Moderate Content', icon: <Sword size={18} />, path: '/oversight', permission: 'viewDisputes' },
    { label: 'Check Appeals', icon: <RotateCcw size={18} />, path: '/oversight', permission: 'viewDisputes' },
    { label: 'Monitor Transactions', icon: <ArrowLeftRightIcon size={18} />, path: '/transactions', permission: 'viewTransactions' },
    { label: 'Manage Galaw Points', icon: <Star size={18} />, path: '/galaw-points', permission: 'viewGalawPoints' },
  ];

  if (loading) {
    return (
      <div>
        <Header title="Dashboard" />
        <div className="page-loading">
          <div className="page-loading__spinner" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Dashboard" />
      <div className="kpi-row">
        {summaryCards.map((card, idx) => (
          <StatCard key={idx} {...card} />
        ))}
      </div>

      <div className={styles.dashboardContent}>
        <div className={styles.dashboardMain}>
          <div className="charts-row">
            <ChartCard title="Monthly Transactions">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={dashStats.monthlyTransactions || []}>
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Bar dataKey="amount" fill="var(--color-blue)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Users by Role">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={userRoleDistribution}
                    dataKey="count"
                    nameKey="role"
                    cx="50%"
                    cy="45%"
                    outerRadius={90}
                    innerRadius={40}
                    paddingAngle={3}
                    labelLine
                    label={({ role, count, percent }) =>
                      `${role} (${(percent * 100).toFixed(0)}%)`
                    }
                  >
                    {userRoleDistribution.map((_, idx) => (
                      <Cell key={idx} fill={chartColors[idx % chartColors.length]} stroke="var(--color-bg)" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name) => [value, name]} />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    formatter={(value) => (
                      <span style={{ color: 'var(--color-text)', fontSize: 12 }}>{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Platform Overview">
              <div className={styles.overviewGrid}>
                <div className={styles.overviewItem}>
                  <div className={styles.overviewItemLabel}>Galaw Points</div>
                  <div className={styles.overviewItemValue}>{formatNumber(dashStats.totalGalawPointsPurchased || 0)}</div>
                </div>
                <div className={styles.overviewItem}>
                  <div className={styles.overviewItemLabel}>Consumed</div>
                  <div className={styles.overviewItemValue}>{formatNumber(dashStats.totalGalawPointsConsumed || 0)}</div>
                </div>
                <div className={styles.overviewItem}>
                  <div className={styles.overviewItemLabel}>Outstanding</div>
                  <div className={styles.overviewItemValue}>{formatNumber(dashStats.outstandingGalawPoints || 0)}</div>
                </div>
                <div className={styles.overviewItem}>
                  <div className={styles.overviewItemLabel}>Incidents</div>
                  <div className={styles.overviewItemValue}>{dashStats.incidentsThisMonth || 0}</div>
                </div>
              </div>
              <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--color-divider)' }}>
                <div className={styles.metricsList}>
                  <div className={styles.metricRow}>
                    <span className={styles.metricLabel}>User Growth</span>
                    <span className={styles.metricValue}>{dashStats.userGrowth || 0}%</span>
                  </div>
                  <div className={styles.metricRow}>
                    <span className={styles.metricLabel}>Job Growth</span>
                    <span className={styles.metricValue} style={{ color: 'var(--color-error)' }}>{dashStats.jobGrowth || 0}%</span>
                  </div>
                  <div className={styles.metricRow}>
                    <span className={styles.metricLabel}>Transaction Growth</span>
                    <span className={styles.metricValue}>{(dashStats.transactionGrowth || 0) >= 0 ? '+' : ''}{dashStats.transactionGrowth || 0}%</span>
                  </div>
                </div>
              </div>
            </ChartCard>
          </div>

          <div className="metrics-row">
            <div className="card">
              <div className="card-header">
                <h3>Recent Verification Requests</h3>
              </div>
              <div className="card-body">
                {pendingV.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-text">No pending verifications</div>
                  </div>
                ) : (
                  pendingV.map((v) => (
                    <div key={v.id} className="recent-item clickable" onClick={() => navigate('/verifications')}>
                      <div className="recent-item-info">
                        <div className="recent-item-title">{v.userName || v.name || 'Unknown'}</div>
                        <div className="recent-item-sub">{v.userRole || v.role} - {formatDate(v.submittedAt || v.createdAt)}</div>
                      </div>
                      <StatusBadge status="pending" />
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h3>Recent Disputes & Reports</h3>
              </div>
              <div className="card-body">
                {openD.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-text">No open disputes</div>
                  </div>
                ) : (
                  openD.map((d) => (
                    <div key={d.id} className="recent-item clickable" onClick={() => navigate(`/disputes/${d.id}`)}>
                      <div className="recent-item-info">
                        <div className="recent-item-title">{d.title}</div>
                        <div className="recent-item-sub">{d.type} - {timeAgo(d.createdAt)}</div>
                      </div>
                      <SeverityBadge severity={d.severity} />
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h3>Recent Admin/Support Actions</h3>
              </div>
              <div className="card-body">
                {recentActions.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-text">No recent actions</div>
                  </div>
                ) : (
                  recentActions.slice(0, 5).map((a, idx) => (
                    <div key={idx} className="recent-item">
                      <div className="recent-item-info">
                        <div className="recent-item-title">{a.action}</div>
                        <div className="recent-item-sub">by {a.agent} - {a.target}</div>
                      </div>
                      <div className="recent-item-date">{timeAgo(a.date)}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <aside className={styles.dashboardSidebar}>
          {!isSupport && (
            <div className={styles.statusCard}>
              <div className={styles.statusCardHeader}>
                <h3>Quick Actions</h3>
              </div>
              <div className={styles.quickActionList}>
                {quickActions.map((action, idx) => (
                  <button
                    key={idx}
                    className={styles.quickActionItem}
                    onClick={() => navigate(action.path)}
                  >
                    <span className={styles.quickActionIcon}>{action.icon}</span>
                    <span>{action.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={styles.statusCard}>
            <div className={styles.statusCardHeader}>
              <h3><Activity size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />System Status</h3>
            </div>
            <div className={styles.statusCardBody}>
              <div className={styles.statusItem}>
                <span className={styles.statusItemLabel}>
                  <span className={styles.statusItemDot} style={{ background: 'var(--color-success)' }} />
                  Verification Rate
                </span>
                <span className={styles.statusItemValue}>{verificationPct}%</span>
              </div>
              <div className={styles.statusItem}>
                <span className={styles.statusItemLabel}>
                  <span className={styles.statusItemDot} style={{ background: 'var(--color-blue)' }} />
                  User Growth
                </span>
                <span className={styles.statusItemValue}>{dashStats.userGrowth || 0}%</span>
              </div>
              <div className={styles.statusItem}>
                <span className={styles.statusItemLabel}>
                  <span className={styles.statusItemDot} style={{ background: 'var(--color-warning)' }} />
                  Dispute Growth
                </span>
                <span className={styles.statusItemValue}>{dashStats.disputeGrowth || 0}%</span>
              </div>
              <div className={styles.statusItem}>
                <span className={styles.statusItemLabel}>
                  <span className={styles.statusItemDot} style={{ background: (dashStats.transactionGrowth || 0) >= 0 ? 'var(--color-success)' : 'var(--color-error)' }} />
                  Transaction Growth
                </span>
                <span className={styles.statusItemValue}>{(dashStats.transactionGrowth || 0) >= 0 ? '+' : ''}{dashStats.transactionGrowth || 0}%</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
