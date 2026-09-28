import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { usePermissions } from '../utils/permissions';
import { useApiData, useMutation } from '../utils/useApiData';
import { getById as getUserById, suspend, reinstate, flagUser, resetPassword } from '../api/users';
import * as notesApi from '../api/notes';
import * as transactionsApi from '../api/transactions';
import * as jobsApi from '../api/jobs';
import * as listingsApi from '../api/listings';
import * as disputesApi from '../api/disputes';
import * as proposalsApi from '../api/proposals';
import * as assessmentsApi from '../api/assessments';
import * as assessmentAttemptsApi from '../api/assessmentAttempts';
import { formatDate, formatDateTime, formatCurrency, getInitials, capitalizeWords, timeAgo } from '../utils/helpers';
import Header from '../components/layout/Header';
import StatusBadge from '../components/common/StatusBadge';
import Tabs from '../components/common/Tabs';
import NotesPanel from '../components/common/NotesPanel';
import ConfirmModal from '../components/common/ConfirmModal';
import DataTable from '../components/common/DataTable';
import { Mail, Phone, Ban, RotateCcw, Flag, MapPin, ClipboardCheck, RefreshCw, Award, XCircle, Gavel } from 'lucide-react';

export default function UserDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { can } = usePermissions(currentUser?.role);
  const { addNotification } = useNotifications();

  // Guard against missing or invalid IDs
  if (!id || id === 'undefined' || id === 'null') {
    return (
      <div>
        <Header title="User Not Found" />
        <div className="empty-state">
          <div className="empty-state-text">User not found</div>
          <button className="btn btn-outline mt-4" onClick={() => navigate('/users')}>Back to Users</button>
        </div>
      </div>
    );
  }

  const { data: user, loading, error, refetch } = useApiData(() => getUserById(id), [id], {
    defaultValue: null,
    transform: (r) => r?.data ?? r,
  });
  const [doAddNote] = useMutation(notesApi.add);
  const { data: userTransactions, loading: transactionsLoading } = useApiData(() => transactionsApi.list({ userId: id, limit: 50 }), [id], {
    defaultValue: [],
    transform: (r) => r?.data ?? r ?? [],
  });
  const { data: userJobs, loading: jobsLoading } = useApiData(() => {
    if (!user) return Promise.resolve([]);
    if (user.role === 'client') return jobsApi.list({ userId: id, limit: 50 });
    return proposalsApi.listByUser(id);
  }, [id, user?.role], {
    defaultValue: [],
    transform: (r) => {
      const rows = r?.data ?? r ?? [];
      return Array.isArray(rows)
        ? rows.map((row) => ({
            ...row,
            jobPostId: row.jobPostId || row.job_post_id || row.id,
            jobTitle: row.jobTitle || row.job_title || row.title,
            hiringOption: row.hiringOption || row.hiring_option,
            jobStatus: row.jobStatus || row.job_status || row.status,
            createdAt: row.createdAt || row.created_at,
            agreedPrice: row.agreedPrice || row.agreed_price,
            matchedAt: row.matchedAt || row.matched_at,
            status: row.status || row.match_status,
            jobPost: row.jobPost || row.job_post || null,
          }))
        : [];
    },
  });
  const { data: userListings, loading: listingsLoading } = useApiData(
    () => listingsApi.list({ ownerId: id, limit: 50 }),
    [id],
    {
      defaultValue: [],
      transform: (r) => r?.data ?? r ?? [],
    }
  );
  const { data: userDisputes, loading: disputesLoading } = useApiData(() => disputesApi.list({ limit: 50 }).then(r => (r?.data || r || []).filter(d => d.reporterId === id || d.respondentId === id)), [id]);

  const [activeTab, setActiveTab] = useState('profile');
  const [showConfirm, setShowConfirm] = useState(null);
  const [suspensionDays, setSuspensionDays] = useState(7);
  const [suspensionReason, setSuspensionReason] = useState('');
  const [showPwReset, setShowPwReset] = useState(false);
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwProcessing, setPwProcessing] = useState(false);

  const [showOverrideModal, setShowOverrideModal] = useState({ open: false, assessmentId: '' });
  const [overrideReason, setOverrideReason] = useState('');
  const [processingOverride, setProcessingOverride] = useState(false);

  const { data: attemptHistory, loading: attemptsLoading, refetch: refetchAttempts } = useApiData(
    () => assessmentAttemptsApi.getUserAttempts(id),
    [id],
    {
      defaultValue: { data: [], stats: { totalAttempts: 0, passedAttempts: 0, failedAttempts: 0, passRate: 0, lastAttemptDate: null, lastResult: null } },
      immediate: false,
    }
  );

  const { data: activeOverrides, refetch: refetchOverrides } = useApiData(
    () => assessmentAttemptsApi.getActiveOverrides(id),
    [id],
    { defaultValue: [], immediate: false }
  );

  // Auto-load attempts + overrides when assessments tab becomes active
  useEffect(() => {
    if (activeTab === 'assessments') {
      refetchAttempts();
      refetchOverrides();
    }
  }, [activeTab]);

  if (loading || error) {
    return (
      <div>
        <Header title={error ? "Error Loading User" : "User Detail"} />
        <div className="page-loading"><div className="page-loading__spinner" /></div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Header title="Error Loading User" />
        <div className="empty-state">
          <div className="empty-state-text">Error loading user: {error}</div>
          <button className="btn btn-outline mt-4" onClick={() => navigate('/users')}>Back to Users</button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div>
        <Header title="User Not Found" />
        <div className="empty-state">
          <div className="empty-state-text">User not found</div>
          <button className="btn btn-outline mt-4" onClick={() => navigate('/users')}>Back to Users</button>
        </div>
      </div>
    );
  }

  const tabs = ['profile', 'jobs', 'listings', 'transactions', 'disputes', 'assessments', 'notes'];

  const resetPwForm = () => { setPwNew(''); setPwConfirm(''); setPwError(''); };

  const handleAction = async (action) => {
    try {
      if (action === 'suspend') {
        await suspend(id, { duration: suspensionDays, reason: suspensionReason });
      } else if (action === 'reinstate') {
        await reinstate(id);
      } else if (action === 'flag') {
        await flagUser(id);
      } else return;
      addNotification('moderation_decision', 'User Action Applied', `Action: ${action} applied to ${user.name}`, `/users/${user.id}`);
      refetch();
    } catch (err) { console.error('User action failed:', err); }
    setShowConfirm(null);
    setSuspensionDays(7);
    setSuspensionReason('');
  };

  const handlePasswordReset = async () => {
    if (pwNew !== pwConfirm) {
      setPwError('Passwords do not match');
      return;
    }
    if (pwNew.length < 6) {
      setPwError('Password must be at least 6 characters');
      return;
    }
    setPwProcessing(true);
    setPwError('');
    try {
      await resetPassword(id, pwNew);
      addNotification('moderation_decision', 'Password Reset', `Password reset for ${user.name}`, `/users/${user.id}`);
      setShowPwReset(false);
      resetPwForm();
    } catch (err) {
      setPwError(err?.error || 'Failed to reset password');
    } finally {
      setPwProcessing(false);
    }
  };

  const isSuspended = user.status === 'suspended';
  const isExpiredSuspension = isSuspended && user.suspendedUntil && new Date(user.suspendedUntil) < new Date();

  const actionButtons = [
    { label: 'Suspend Account', action: 'suspend', permission: 'suspendUser', show: !isSuspended },
    { label: 'Reinstate Account', action: 'reinstate', permission: 'reinstateUser', show: isSuspended },
    { label: 'Reset Password', action: 'reset-password', permission: 'resetPassword', show: true },
    { label: 'Flag Account', action: 'flag', permission: 'flagUser', show: true },
  ];

  const getJobId = (row) => row.jobPostId || row.job_post_id || row.id || row.jobPost?.jobPostId || row.jobPost?.job_post_id;
  
  const clientJobColumns = [
    { key: 'id', label: 'ID', render: (row) => <span className="text-xs text-muted font-mono">{getJobId(row)?.slice(0, 8)}</span> },
    { key: 'jobTitle', label: 'Job', render: (row) => <span className="cell-link" onClick={() => { const jobId = getJobId(row); if (jobId) navigate(`/jobs/${jobId}`); }}>{row.jobTitle || row.job_title || row.title || 'Untitled job'}</span> },
    { key: 'hiringOption', label: 'Type', render: (row) => <StatusBadge status={row.hiringOption || row.hiring_option} /> },
    { key: 'jobStatus', label: 'Status', render: (row) => <StatusBadge status={row.jobStatus || row.job_status || row.status} /> },
    { key: 'createdAt', label: 'Created', render: (row) => formatDate(row.createdAt || row.created_at) },
  ];

  const matchColumns = [
    { key: 'id', label: 'Job ID', render: (row) => <span className="text-xs text-muted font-mono">{getJobId(row)?.slice(0, 8)}</span> },
    { key: 'jobTitle', label: 'Job Title', render: (row) => <span className="cell-link" onClick={() => { const jobId = getJobId(row); if (jobId) navigate(`/jobs/${jobId}`); }}>{row.jobPost?.jobTitle || row.jobPost?.job_title || row.jobTitle || row.job_title || row.jobPostId || row.job_post_id || 'Untitled job'}</span> },
    { key: 'agreedPrice', label: 'Agreed Price', render: (row) => formatCurrency(row.agreedPrice || row.agreed_price) },
    { key: 'status', label: 'Match Status', render: (row) => <StatusBadge status={row.status || row.match_status} /> },
    { key: 'connections', label: 'GP Used', render: (row) => row.connections ?? '-' },
    { key: 'matchedAt', label: 'Matched', render: (row) => formatDate(row.matchedAt || row.matched_at) },
  ];

  return (
    <div>
      <Header title="User Detail" />
      <div className="user-detail-header card p-4">
        <div className="user-avatar-lg">{getInitials(user.name)}</div>
        <div className="user-detail-info flex-1">
          <h1>{user.name}</h1>
          <div className="user-detail-meta">
            <span><Mail size={15} /> {user.email}</span>
            <span><Phone size={15} /> {user.phone || 'N/A'}</span>
            <span><MapPin size={15} /> {user.location || user.completeAddress || 'N/A'}</span>
          </div>
          <div className="flex gap-2 mt-2 flex-wrap">
            <StatusBadge status={user.status} />
            <span className="status-badge" style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}>{capitalizeWords(user.role)}</span>
            {user.flags > 0 && <StatusBadge status="flagged" label={`${user.flags} flag(s)`} />}
            {isSuspended && user.suspendedUntil && (
              <span className="status-badge" style={{
                background: isExpiredSuspension ? 'var(--color-warning-subtle, #fef3c7)' : 'var(--color-error-subtle, #fee2e2)',
                color: isExpiredSuspension ? 'var(--color-warning)' : 'var(--color-error)',
                fontSize: '0.75rem',
              }}>
                {isExpiredSuspension ? 'Suspension Expired' : `Suspended until ${formatDate(user.suspendedUntil)}`}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {actionButtons.filter(b => b.show && can(b.permission)).map((btn) => (
            <button key={btn.action} className="btn btn-outline btn-sm" onClick={() => {
              if (btn.action === 'reset-password') setShowPwReset(true);
              else setShowConfirm(btn.action);
            }}>{btn.label}</button>
          ))}
          <button className="btn btn-accent btn-sm" onClick={() => navigate('/messages')}>Send Message</button>
        </div>
      </div>

      <Tabs tabs={tabs.map(t => ({ key: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))} activeTab={activeTab} onChange={setActiveTab} />
      <div className="tab-content">
        {activeTab === 'profile' && (
          <div className="card">
            <div className="card-body">
              <div className="detail-grid">
                <div className="detail-field"><div className="detail-label">Full Name</div><div className="detail-value">{user.name || user.fullName}</div></div>
                <div className="detail-field"><div className="detail-label">Email</div><div className="detail-value">{user.email}</div></div>
                <div className="detail-field"><div className="detail-label">Phone</div><div className="detail-value">{user.phone || 'N/A'}</div></div>
                <div className="detail-field"><div className="detail-label">Birth Date</div><div className="detail-value">{user.birthDate ? formatDate(user.birthDate) : 'N/A'}</div></div>
                <div className="detail-field"><div className="detail-label">Role</div><div className="detail-value">{capitalizeWords(user.role)}</div></div>
                <div className="detail-field"><div className="detail-label">Status</div><div className="detail-value"><StatusBadge status={user.status} /></div></div>
                <div className="detail-field"><div className="detail-label">User ID</div><div className="detail-value"><span className="text-xs font-mono">{user.id?.slice(0, 8) || 'N/A'}</span></div></div>
                <div className="detail-field"><div className="detail-label">Location</div><div className="detail-value">{user.location || user.completeAddress || 'N/A'}</div></div>
                {user.region && <div className="detail-field"><div className="detail-label">Region</div><div className="detail-value">{user.region}</div></div>}
                {user.province && <div className="detail-field"><div className="detail-label">Province</div><div className="detail-value">{user.province}</div></div>}
                {user.municipality && <div className="detail-field"><div className="detail-label">Municipality</div><div className="detail-value">{user.municipality}</div></div>}
                {user.barangay && <div className="detail-field"><div className="detail-label">Barangay</div><div className="detail-value">{user.barangay}</div></div>}
                {isSuspended && user.suspendedUntil && (
                  <div className="detail-field">
                    <div className="detail-label">Suspended Until</div>
                    <div className="detail-value" style={{ color: isExpiredSuspension ? 'var(--color-warning)' : 'var(--color-error)' }}>
                      {formatDateTime(user.suspendedUntil)}
                      {isExpiredSuspension && <span className="text-xs text-muted ml-2">(Expired)</span>}
                    </div>
                  </div>
                )}
                {isSuspended && user.suspensionReason && (
                  <div className="detail-field">
                    <div className="detail-label">Suspension Reason</div>
                    <div className="detail-value">{user.suspensionReason}</div>
                  </div>
                )}
                <div className="detail-field"><div className="detail-label">Joined</div><div className="detail-value">{formatDate(user.joinedAt)}</div></div>
                <div className="detail-field"><div className="detail-label">Flags</div><div className="detail-value">{user.flags}</div></div>
              </div>
              {user.skills?.length > 0 && (
                <div className="mt-4">
                  <div className="detail-label mb-2">Skills</div>
                  <div className="flex gap-1 flex-wrap">
                    {user.skills.map((s, idx) => <span key={idx} className="status-badge" style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}>{s}</span>)}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'jobs' && (
          <div className="card">
            <div className="card-body p-0">
              {user?.role === 'client' ? (
                <DataTable columns={clientJobColumns} data={userJobs} loading={jobsLoading} emptyMessage="No jobs posted." pageSize={5} />
              ) : (
                <DataTable columns={matchColumns} data={userJobs} loading={jobsLoading} emptyMessage="No matches found." pageSize={5} />
              )}
            </div>
          </div>
        )}

        {activeTab === 'listings' && (
          <div className="card">
            <div className="card-body p-0">
              <DataTable
                columns={[
                  { key: 'equipmentName', label: 'Listing', render: (row) => <span className="cell-link" onClick={() => { if (row.listingId) navigate(`/listings/${row.listingId}`); }}>{row.equipmentName}</span> },
                  { key: 'id', label: 'ID', render: (row) => <span className="text-xs text-muted font-mono">{row.listingId?.slice(0, 8)}</span> },
                  { key: 'dayPricing', label: 'Daily Rate', render: (row) => formatCurrency(row.dayPricing) },
                  { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
                ]}
                data={userListings}
                loading={listingsLoading}
                emptyMessage="No listings found for this user."
                pageSize={5}
              />
            </div>
          </div>
        )}

        {activeTab === 'transactions' && (
          <div className="card">
            <div className="card-body p-0">
              <DataTable
                columns={[
                  { key: 'type', label: 'Type', render: (row) => <StatusBadge status={row.type} /> },
                  { key: 'amount', label: 'Amount', render: (row) => formatCurrency(row.amount) },
                  { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
                  { key: 'description', label: 'Description' },
                  { key: 'createdAt', label: 'Date', render: (row) => formatDate(row.createdAt) },
                ]}
                data={userTransactions}
                loading={transactionsLoading}
                emptyMessage="No transactions found."
                pageSize={5}
              />
            </div>
          </div>
        )}

        {activeTab === 'disputes' && (
          <div className="card">
            <div className="card-body p-0">
              <DataTable
                columns={[
                  { key: 'id', label: 'ID', render: (row) => <span className="text-xs font-mono">{row.id?.slice(0, 8)}</span> },
                  { key: 'type', label: 'Type', render: (row) => <StatusBadge status={row.type} /> },
                  { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
                  { key: 'severity', label: 'Severity', render: (row) => <StatusBadge status={row.severity} /> },
                  { key: 'reporterName', label: 'Reporter' },
                  { key: 'respondentName', label: 'Respondent' },
                  { key: 'createdAt', label: 'Date', render: (row) => formatDate(row.createdAt) },
                ]}
                data={userDisputes}
                loading={disputesLoading}
                emptyMessage="No disputes found for this user."
                pageSize={5}
              />
            </div>
          </div>
        )}

        {activeTab === 'assessments' && (
          <div className="card">
            <div className="card-header">
              <h3>Assessment Attempt History</h3>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {can('grantRetakeException') && (
                  <button className="btn btn-outline btn-sm" onClick={() => setShowOverrideModal({ open: true, assessmentId: '' })}>
                    <RefreshCw size={14} /> Grant Retake Exception
                  </button>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => refetchAttempts()}>
                  <RefreshCw size={13} />
                </button>
              </div>
            </div>
            <div className="card-body">
              {/* Summary Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: 'var(--space-4)' }}>
                <div style={{ padding: '0.75rem', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{attemptHistory?.stats?.totalAttempts || 0}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Total Attempts</div>
                </div>
                <div style={{ padding: '0.75rem', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-success)' }}>{attemptHistory?.stats?.passRate || 0}%</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Pass Rate</div>
                </div>
                <div style={{ padding: '0.75rem', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-success)' }}>{attemptHistory?.stats?.passedAttempts || 0}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Passed</div>
                </div>
                <div style={{ padding: '0.75rem', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-error)' }}>{attemptHistory?.stats?.failedAttempts || 0}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Failed</div>
                </div>
                <div style={{ padding: '0.75rem', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{attemptHistory?.stats?.lastAttemptDate ? timeAgo(attemptHistory.stats.lastAttemptDate) : 'N/A'}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Last Attempt</div>
                </div>
                <div style={{ padding: '0.75rem', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {attemptHistory?.stats?.lastResult ? (
                      <StatusBadge status={attemptHistory.stats.lastResult === 'passed' ? 'approved' : 'rejected'} label={attemptHistory.stats.lastResult === 'passed' ? 'Passed' : 'Failed'} />
                    ) : 'N/A'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Last Result</div>
                </div>
              </div>

              {/* Active Overrides */}
              {activeOverrides?.length > 0 && (
                <div style={{ marginBottom: 'var(--space-3)', padding: '0.75rem', background: 'var(--color-warning-subtle, #fef3c7)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-warning)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-warning)', marginBottom: 4 }}>
                    <Award size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                    Active Retake Exceptions
                  </div>
                  {activeOverrides.map((ov) => (
                    <div key={ov.id} style={{ fontSize: 12, color: 'var(--color-text)', marginTop: 4 }}>
                      <span>Granted by {ov.grantedByName}: "{ov.reason}"</span>
                      <span style={{ color: 'var(--color-text-muted)', marginLeft: 8 }}>
                        Expires {timeAgo(ov.expiresAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Attempt History Table */}
              <div className="p-0">
                {attemptsLoading ? (
                  <div className="empty-state" style={{ padding: '2rem' }}>
                    <div className="empty-state-text">Loading attempt history...</div>
                  </div>
                ) : attemptHistory?.data?.length > 0 ? (
                  <DataTable
                    columns={[
                      {
                        key: 'attemptedAt',
                        label: 'Date/Time (PHT)',
                        render: (row) => {
                          const d = new Date(row.attemptedAt);
                          const pht = d.toLocaleString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                          return <span title={pht}>{pht}</span>;
                        },
                      },
                      {
                        key: 'assessmentInfo',
                        label: 'Category',
                        render: (row) => row.assessmentInfo?.categoryName || row.assessmentId?.slice(0, 8) || 'N/A',
                      },
                      {
                        key: 'score',
                        label: 'Score',
                        render: (row) => `${row.score}/${row.totalPoints}`,
                      },
                      {
                        key: 'result',
                        label: 'Result',
                        render: (row) => (
                          <StatusBadge
                            status={row.result === 'passed' ? 'approved' : 'rejected'}
                            label={row.result === 'passed' ? 'Passed' : 'Failed'}
                          />
                        ),
                      },
                      {
                        key: 'isRetake',
                        label: 'Type',
                        render: (row) => (
                          <StatusBadge
                            status={row.isRetake ? 'pending' : 'active'}
                            label={row.isRetake ? 'Retake' : 'First attempt'}
                          />
                        ),
                      },
                    ]}
                    data={attemptHistory.data}
                    pageSize={5}
                    sortable={false}
                    emptyMessage="No assessment attempts yet."
                  />
                ) : (
                  <div className="empty-state" style={{ padding: '2rem' }}>
                    <ClipboardCheck size={36} />
                    <div className="empty-state-text">No assessment attempts yet</div>
                    <div className="empty-state-sub" style={{ fontSize: 12, marginTop: 4 }}>
                      The talent has not taken any assessments.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="card">
            <div className="card-header"><h3>Internal Notes</h3></div>
            <div className="card-body">
              <NotesPanel
                notes={user.notes || []}
                onAddNote={async (note) => {
                  try {
                    await doAddNote(user.id, note.text);
                    addNotification('moderation_decision', 'Note Added', `Note added to ${user.name}`, `/users/${user.id}`);
                    refetch();
                  } catch (err) { console.error('Add note failed:', err); }
                }}
              />
            </div>
          </div>
        )}
      </div>

      {showConfirm === 'suspend' ? (
        <div className="modal-overlay" onClick={() => { setShowConfirm(null); setSuspensionDays(7); setSuspensionReason(''); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Suspend Account</h3>
              <button className="modal-close" onClick={() => { setShowConfirm(null); setSuspensionDays(7); setSuspensionReason(''); }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--color-text-muted)', lineHeight: 1.6, marginBottom: '1rem' }}>
                Suspend <strong>{user.name}</strong> for the following period and reason:
              </p>
              <div style={{ marginBottom: '1rem' }}>
                <label className="detail-label" style={{ marginBottom: '0.375rem', display: 'block' }}>Suspension Duration</label>
                <select
                  value={suspensionDays}
                  onChange={(e) => setSuspensionDays(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-bg)',
                    color: 'var(--color-text)',
                    fontSize: '0.875rem',
                  }}
                >
                  <option value={7}>7 days (1 week)</option>
                  <option value={14}>14 days (2 weeks)</option>
                  <option value={21}>21 days (3 weeks)</option>
                  <option value={30}>30 days (1 month)</option>
                  <option value={60}>60 days (2 months)</option>
                  <option value={90}>90 days (3 months)</option>
                </select>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label className="detail-label" style={{ marginBottom: '0.375rem', display: 'block' }}>Reason for Suspension</label>
                <textarea
                  value={suspensionReason}
                  onChange={(e) => setSuspensionReason(e.target.value)}
                  placeholder="Enter the reason for suspension..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-bg)',
                    color: 'var(--color-text)',
                    fontSize: '0.875rem',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                  }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => { setShowConfirm(null); setSuspensionDays(7); setSuspensionReason(''); }}>Cancel</button>
              <button className="btn btn-danger" onClick={() => handleAction('suspend')}>
                Suspend {suspensionDays} Days
              </button>
            </div>
          </div>
        </div>
      ) : (
        <ConfirmModal
          open={!!showConfirm}
          title={`${capitalizeWords(showConfirm?.replace(/_/g, ' ') || '')}`}
          message={`Are you sure you want to ${showConfirm?.replace(/_/g, ' ') || ''} for ${user.name}?`}
          confirmLabel="Confirm"
          variant={showConfirm?.includes('reinstate') ? 'success' : 'primary'}
          onConfirm={() => handleAction(showConfirm)}
          onCancel={() => setShowConfirm(null)}
        />
      )}

      {showPwReset && (
        <div className="modal-overlay" onClick={() => { setShowPwReset(false); resetPwForm(); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h3>Reset Password</h3>
              <button className="modal-close" onClick={() => { setShowPwReset(false); resetPwForm(); }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--color-text-muted)', lineHeight: 1.6, marginBottom: '1rem' }}>
                Set a new password for <strong>{user.name}</strong>
              </p>
              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                <label className="form-label">New Password</label>
                <input
                  className="form-input"
                  type="password"
                  placeholder="Enter new password"
                  value={pwNew}
                  onChange={(e) => setPwNew(e.target.value)}
                  disabled={pwProcessing}
                  autoFocus
                />
              </div>
              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                <label className="form-label">Confirm Password</label>
                <input
                  className="form-input"
                  type="password"
                  placeholder="Confirm new password"
                  value={pwConfirm}
                  onChange={(e) => setPwConfirm(e.target.value)}
                  disabled={pwProcessing}
                />
              </div>
              {pwError && (
                <div style={{ fontSize: 13, color: 'var(--color-error)', marginBottom: '0.75rem' }}>
                  {pwError}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => { setShowPwReset(false); resetPwForm(); }} disabled={pwProcessing}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handlePasswordReset} disabled={!pwNew || !pwConfirm || pwProcessing}>
                {pwProcessing ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grant Retake Exception Modal */}
      {showOverrideModal.open && (
        <div className="modal-overlay" onClick={() => { setShowOverrideModal({ open: false, assessmentId: '' }); setOverrideReason(''); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3>Grant Retake Exception</h3>
              <button className="modal-close" onClick={() => { setShowOverrideModal({ open: false, assessmentId: '' }); setOverrideReason(''); }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="modal-body">
              <div style={{ padding: '0.75rem', background: 'var(--color-warning-subtle, #fef3c7)', borderRadius: 'var(--radius-md)', marginBottom: '1rem', border: '1px solid var(--color-warning)', color: 'var(--color-warning)', fontSize: 13, lineHeight: 1.5 }}>
                <RefreshCw size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                <strong>Override daily retake limit?</strong>
                <br />
                This will allow <strong>{user.name}</strong> to retake the selected assessment immediately, bypassing the once-per-day restriction. The exception expires at the end of today (Philippine Time).
              </div>

              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                <label className="form-label">Assessment</label>
                {attemptHistory?.data?.length > 0 ? (
                  <select
                    className="form-select"
                    value={showOverrideModal.assessmentId}
                    onChange={(e) => setShowOverrideModal((prev) => ({ ...prev, assessmentId: e.target.value }))}
                    style={{ width: '100%' }}
                  >
                    <option value="">Select an assessment category...</option>
                    {[...new Set(attemptHistory.data.map(a => a.assessmentId))].map((aid) => {
                      const info = attemptHistory.data.find(a => a.assessmentId === aid)?.assessmentInfo;
                      return (
                        <option key={aid} value={aid}>
                          {info?.categoryName || aid?.slice(0, 8)}
                        </option>
                      );
                    })}
                  </select>
                ) : (
                  <input
                    className="form-input"
                    placeholder="Assessment ID or Category name..."
                    value={showOverrideModal.assessmentId}
                    onChange={(e) => setShowOverrideModal((prev) => ({ ...prev, assessmentId: e.target.value }))}
                    style={{ width: '100%' }}
                  />
                )}
              </div>

              <div className="form-group">
                <label className="form-label">
                  Reason <span style={{ color: 'var(--color-error)' }}>*</span>
                </label>
                <textarea
                  className="form-textarea"
                  rows={3}
                  placeholder="Explain why this retake exception is needed..."
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  style={{ width: '100%' }}
                  disabled={processingOverride}
                  autoFocus
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => { setShowOverrideModal({ open: false, assessmentId: '' }); setOverrideReason(''); }} disabled={processingOverride}>
                Cancel
              </button>
              <button
                className="btn btn-accent"
                disabled={!showOverrideModal.assessmentId || !overrideReason.trim() || processingOverride}
                onClick={async () => {
                  setProcessingOverride(true);
                  try {
                    await assessmentAttemptsApi.grantOverride(id, {
                      assessmentId: showOverrideModal.assessmentId,
                      reason: overrideReason.trim(),
                    });
                    addNotification('moderation_decision', 'Retake Exception Granted', `Retake exception granted for ${user.name}`);
                    setShowOverrideModal({ open: false, assessmentId: '' });
                    setOverrideReason('');
                    refetchAttempts();
                    refetchOverrides();
                  } catch (err) { console.error('Grant override failed:', err); }
                  setProcessingOverride(false);
                }}
              >
                {processingOverride ? (
                  <>
                    <div className="page-loading__spinner" style={{ width: 14, height: 14, borderWidth: 2, display: 'inline-block', marginRight: 6, verticalAlign: 'middle' }} />
                    Processing...
                  </>
                ) : (
                  <><Award size={15} /> Grant Exception</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
