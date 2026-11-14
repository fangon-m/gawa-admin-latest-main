import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../utils/permissions';
import { useApiData } from '../utils/useApiData';
import * as usersApi from '../api/users';
import * as activityLogApi from '../api/activityLog';
import * as authApi from '../api/auth';
import { formatDate, formatDateTime, formatLabel } from '../utils/helpers';
import Header from '../components/layout/Header';
import Tabs from '../components/common/Tabs';
import DataTable from '../components/common/DataTable';
import StatusBadge from '../components/common/StatusBadge';
import ConfirmModal from '../components/common/ConfirmModal';

export default function Settings() {
  const { user, refetchUser } = useAuth();
  const { can } = usePermissions(user?.role);
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') || 'profile');

  useEffect(() => {
    if (searchParams.get('tab')) {
      setTab(searchParams.get('tab') || 'profile');
    }
  }, [searchParams]);

  const handleTabChange = (nextTab) => {
    setTab(nextTab);
    setSearchParams({ tab: nextTab });
  };

  // Profile form state
  const [profileForm, setProfileForm] = useState({ name: '', phone: '', location: '' });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');

  // Initialize profile form when user loads
  useEffect(() => {
    if (user) {
      setProfileForm({ name: user.name || '', phone: user.phone || '', location: user.location || '' });
    }
  }, [user]);

  // Password reset state
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState('');

  // Invitation state
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', role: 'admin' });
  const [inviteMsg, setInviteMsg] = useState('');

  // Admin activity (Settings → Admin Activity): filterable, chronological, paginated.
  const canViewAdminActivity = can('manageSettings');
  const [activityLogs, setActivityLogs] = useState([]);
  const [activityPagination, setActivityPagination] = useState({ total: 0, page: 1, limit: 25, totalPages: 0 });
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState('');
  const [activityFilters, setActivityFilters] = useState({ agentId: '', startDate: '', endDate: '' });
  const [appliedActivityFilters, setAppliedActivityFilters] = useState({ agentId: '', startDate: '', endDate: '' });
  const [activityPage, setActivityPage] = useState(1);

  const fetchActivityLogs = React.useCallback(async (filters, page) => {
    if (!canViewAdminActivity) return;
    setActivityLoading(true);
    setActivityError('');
    try {
      const params = {
        scope: 'admin',
        order: 'asc',
        page,
        limit: 25,
      };
      if (filters.agentId) params.userId = filters.agentId;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      const res = await activityLogApi.list(params);
      setActivityLogs(res?.data ?? []);
      setActivityPagination(res?.pagination ?? { total: 0, page, limit: 25, totalPages: 0 });
    } catch (err) {
      setActivityError(err?.error || err?.message || 'Failed to load admin activity');
      setActivityLogs([]);
      setActivityPagination({ total: 0, page, limit: 25, totalPages: 0 });
    } finally {
      setActivityLoading(false);
    }
  }, [canViewAdminActivity]);

  useEffect(() => {
    if (tab === 'activity' && canViewAdminActivity) {
      fetchActivityLogs(appliedActivityFilters, activityPage);
    }
  }, [tab, canViewAdminActivity, appliedActivityFilters, activityPage, fetchActivityLogs]);

  // Team members (admin-managed staff accounts) and pending invitations
  const [inviteResult, setInviteResult] = useState(null);
  const [busyInviteId, setBusyInviteId] = useState(null);
  const [resettingMemberId, setResettingMemberId] = useState(null);
  const [removingMember, setRemovingMember] = useState(null);

  const { data: teamMembers, refetch: refetchTeam } = useApiData(() => usersApi.listTeam(), [], {
    defaultValue: [],
    transform: (r) => r?.data ?? r ?? [],
    immediate: can('manageSettings'),
  });

  const tabs = [
    { key: 'profile', label: 'Profile' },
    { key: 'security', label: 'Password & Security' },
    { key: 'sessions', label: 'Active Sessions' },
    { key: 'activity', label: 'Admin Activity' },
    ...(can('manageSettings') ? [{ key: 'team', label: 'Team Members' }] : []),
  ];

  const [activeSessions, setActiveSessions] = useState([
    { id: 's1', device: 'Chrome on Windows', ip: '192.168.1.100', lastActive: '2025-05-20T14:30:00Z', current: true },
    { id: 's2', device: 'Safari on macOS', ip: '192.168.1.101', lastActive: '2025-05-19T09:00:00Z', current: false },
    { id: 's3', device: 'Firefox on Linux', ip: '203.0.113.45', lastActive: '2025-05-18T16:00:00Z', current: false },
  ]);
  const [sessionMsg, setSessionMsg] = useState('');

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    setPwMsg('');
    if (pwForm.newPw !== pwForm.confirm) {
      setPwMsg('Passwords do not match');
      return;
    }
    if (pwForm.newPw.length < 6) {
      setPwMsg('Password must be at least 6 characters');
      return;
    }
    try {
      await authApi.changePassword(pwForm.current, pwForm.newPw);
      setPwMsg('Password updated successfully');
      setPwForm({ current: '', newPw: '', confirm: '' });
    } catch (err) {
      setPwMsg(err?.error || 'Failed to update password');
    }
    setTimeout(() => setPwMsg(''), 4000);
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteForm.name || !inviteForm.email) {
      setInviteMsg('Please fill in all fields');
      return;
    }
    try {
      const res = await usersApi.invite({
        name: inviteForm.name,
        email: inviteForm.email,
        role: inviteForm.role,
      });
      const created = res?.data ?? res ?? {};
      setInviteResult({
        email: created.email || inviteForm.email,
        delivery: created.delivery || 'sent',
        expiresAt: created.expiresAt || null,
      });
      setInviteMsg(
        created.delivery === 'failed'
          ? `Invitation saved for ${created.email || inviteForm.email}, but the email could not be sent. Use Resend.`
          : `Invitation emailed to ${created.email || inviteForm.email}`
      );
      setInviteForm({ name: '', email: '', role: 'admin' });
      refetchTeam();
    } catch (err) {
      setInviteMsg(err?.error || 'Failed to send invitation');
    }
    setTimeout(() => setInviteMsg(''), 6000);
  };

  const handleResendInvite = async (row) => {
    setBusyInviteId(row.inviteId);
    try {
      const res = await usersApi.resendInvite(row.inviteId);
      const result = res?.data ?? res ?? {};
      setInviteMsg(
        result.delivery === 'failed'
          ? `Could not resend the invitation to ${row.email}. Check the mail provider.`
          : `Invitation resent to ${row.email}`
      );
      refetchTeam();
    } catch (err) {
      setInviteMsg(err?.error || 'Failed to resend invitation');
    } finally {
      setBusyInviteId(null);
      setTimeout(() => setInviteMsg(''), 6000);
    }
  };

  const handleRevokeInvite = async (row) => {
    setBusyInviteId(row.inviteId);
    try {
      await usersApi.revokeInvite(row.inviteId);
      setInviteMsg(`Invitation for ${row.email} revoked`);
      setInviteResult(null);
      refetchTeam();
    } catch (err) {
      setInviteMsg(err?.error || 'Failed to revoke invitation');
    } finally {
      setBusyInviteId(null);
      setTimeout(() => setInviteMsg(''), 6000);
    }
  };

  const handleSendReset = async (row) => {
    setResettingMemberId(row.id);
    try {
      const res = await usersApi.sendPasswordReset(row.id);
      const result = res?.data ?? res ?? {};
      setInviteMsg(
        result.delivery === 'failed'
          ? `Reset link created for ${row.email}, but the email could not be delivered.`
          : `Password reset link emailed to ${row.email}`
      );
    } catch (err) {
      setInviteMsg(err?.error || 'Failed to send the reset link');
    } finally {
      setResettingMemberId(null);
      setTimeout(() => setInviteMsg(''), 6000);
    }
  };

  const handleRemoveMember = async () => {
    if (!removingMember) return;
    try {
      await usersApi.remove(removingMember.id);
      setRemovingMember(null);
      refetchTeam();
    } catch (err) {
      setRemovingMember(null);
      setInviteMsg(err?.error || 'Failed to remove team member');
      setTimeout(() => setInviteMsg(''), 6000);
    }
  };

  return (
    <div>
      <Header title="Settings" />
      <Tabs tabs={tabs} activeTab={tab} onChange={handleTabChange} />
      <div className="tab-content">
        {tab === 'profile' && (
          <div className="settings-card">
            <div className="settings-card-title">Profile Settings</div>
            {profileMsg && (
              <div style={{ fontSize: 13, color: profileMsg.includes('success') ? 'var(--color-success)' : 'var(--color-error)', marginBottom: 12 }}>
                {profileMsg}
              </div>
            )}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  className="form-input"
                  value={profileForm.name}
                  onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  className="form-input"
                  value={user?.email || ''}
                  disabled
                  style={{ opacity: 0.6 }}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input
                  className="form-input"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="+63 XX XXX XXXX"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Location</label>
                <input
                  className="form-input"
                  value={profileForm.location}
                  onChange={(e) => setProfileForm((p) => ({ ...p, location: e.target.value }))}
                  placeholder="e.g. Manila, Philippines"
                />
              </div>
            </div>
            <button
              className="btn btn-primary mt-4"
              onClick={async () => {
                if (!user?.id) return;
                setProfileSaving(true);
                setProfileMsg('');
                try {
                  await usersApi.update(user.id, {
                    name: profileForm.name,
                    phone: profileForm.phone,
                    location: profileForm.location,
                  });
                  setProfileMsg('Profile saved successfully');
                  if (refetchUser) refetchUser();
                } catch {
                  setProfileMsg('Failed to save profile');
                } finally {
                  setProfileSaving(false);
                  setTimeout(() => setProfileMsg(''), 4000);
                }
              }}
              disabled={profileSaving}
            >
              {profileSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}

        {tab === 'security' && (
          <div className="settings-card">
            <div className="settings-card-title">Password & Security</div>
            <form onSubmit={handlePasswordReset}>
              <div className="form-group">
                <label className="form-label">Current Password</label>
                <input
                  className="form-input"
                  type="password"
                  placeholder="Enter current password"
                  value={pwForm.current}
                  onChange={(e) => setPwForm((p) => ({ ...p, current: e.target.value }))}
                  required
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">New Password</label>
                  <input
                    className="form-input"
                    type="password"
                    placeholder="Enter new password"
                    value={pwForm.newPw}
                    onChange={(e) => setPwForm((p) => ({ ...p, newPw: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Confirm New Password</label>
                  <input
                    className="form-input"
                    type="password"
                    placeholder="Confirm new password"
                    value={pwForm.confirm}
                    onChange={(e) => setPwForm((p) => ({ ...p, confirm: e.target.value }))}
                    required
                  />
                </div>
              </div>
              {pwMsg && (
                <div style={{ fontSize: 13, color: pwMsg.includes('success') ? 'var(--color-success)' : 'var(--color-error)', marginBottom: 12 }}>
                  {pwMsg}
                </div>
              )}
              <button type="submit" className="btn btn-primary">Update Password</button>
            </form>
          </div>
        )}

        {tab === 'sessions' && (
          <div className="settings-card">
            <div className="settings-card-title">Active Sessions</div>
            {sessionMsg && (
              <div style={{ fontSize: 13, color: 'var(--color-success)', marginBottom: 12 }}>
                {sessionMsg}
              </div>
            )}
            {activeSessions.length === 0 ? (
              <div className="empty-state" style={{ padding: '1.5rem' }}>
                <div className="empty-state-text">No other active sessions</div>
              </div>
            ) : (
              activeSessions.map((s) => (
                <div key={s.id} className="settings-row">
                  <div>
                    <div style={{ fontWeight: 500 }}>{s.device} {s.current && <span style={{ fontSize: 12, color: 'var(--color-success)' }}>(Current)</span>}</div>
                    <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>IP: {s.ip} · Last active: {formatDateTime(s.lastActive)}</div>
                  </div>
                  {!s.current && (
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => {
                        setActiveSessions((prev) => prev.filter((x) => x.id !== s.id));
                        setSessionMsg(`Session "${s.device}" revoked`);
                        setTimeout(() => setSessionMsg(''), 3000);
                      }}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'activity' && (
          <div className="settings-card">
            <div className="settings-card-title">Admin Activity Log</div>
            <div className="card-body" style={{ padding: 0 }}>
              {canViewAdminActivity ? (
                <>
                  <div style={{ padding: '1rem', borderBottom: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                      View a chronological history of actions performed by a staff agent. Filter by agent account and date range to review incident and moderation activity.
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div className="form-group" style={{ minWidth: 240, flex: '1 1 240px', margin: 0 }}>
                        <label className="form-label" htmlFor="activity-agent">Agent account</label>
                        <select
                          id="activity-agent"
                          className="form-select"
                          value={activityFilters.agentId}
                          onChange={(e) => setActivityFilters((p) => ({ ...p, agentId: e.target.value }))}
                        >
                          <option value="">All agents</option>
                          {(teamMembers || [])
                            .filter((m) => m && m.kind !== 'invite' && m.id)
                            .sort((a, b) => {
                              const ra = a.role === 'customer_support' ? 0 : 1;
                              const rb = b.role === 'customer_support' ? 0 : 1;
                              if (ra !== rb) return ra - rb;
                              return String(a.name || a.email || '').localeCompare(String(b.name || b.email || ''));
                            })
                            .map((m) => (
                              <option key={m.id} value={m.id}>
                                {(m.name || m.email || 'Unknown')} — {formatLabel(m.role)}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" htmlFor="activity-start">From</label>
                        <input
                          id="activity-start"
                          className="form-input"
                          type="date"
                          value={activityFilters.startDate}
                          onChange={(e) => setActivityFilters((p) => ({ ...p, startDate: e.target.value }))}
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" htmlFor="activity-end">To</label>
                        <input
                          id="activity-end"
                          className="form-input"
                          type="date"
                          value={activityFilters.endDate}
                          onChange={(e) => setActivityFilters((p) => ({ ...p, endDate: e.target.value }))}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => { setAppliedActivityFilters({ ...activityFilters }); setActivityPage(1); }}
                        >
                          Apply
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => {
                            const cleared = { agentId: '', startDate: '', endDate: '' };
                            setActivityFilters(cleared);
                            setAppliedActivityFilters(cleared);
                            setActivityPage(1);
                          }}
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    {(appliedActivityFilters.agentId || appliedActivityFilters.startDate || appliedActivityFilters.endDate) && (
                      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                        Showing {activityPagination.total || 0} action{(activityPagination.total || 0) === 1 ? '' : 's'}
                        {appliedActivityFilters.agentId ? (() => {
                          const agent = (teamMembers || []).find((m) => m.id === appliedActivityFilters.agentId);
                          return agent ? ` for ${agent.name || agent.email}` : '';
                        })() : ''}
                        {appliedActivityFilters.startDate ? ` from ${appliedActivityFilters.startDate}` : ''}
                        {appliedActivityFilters.endDate ? ` to ${appliedActivityFilters.endDate}` : ''}
                        {' '}in chronological order.
                      </div>
                    )}
                  </div>

                  {activityError && <div className="alert alert-error" role="alert" style={{ margin: '0.75rem 1rem 0' }}>{activityError}</div>}

                  <DataTable
                    columns={[
                      { key: 'agentName', label: 'Agent' },
                      { key: 'activityTypeLabel', label: 'Activity Type' },
                      { key: 'category', label: 'Category' },
                      {
                        key: 'description',
                        label: 'Description',
                        render: (row) => {
                          const name = row.relatedUserName;
                          const id = row.relatedUserId;
                          if (!name || !id || typeof row.description !== 'string') return row.description;
                          return row.description.split(id).join(name);
                        },
                      },
                      { key: 'createdAt', label: 'Timestamp', render: (row) => formatDateTime(row.createdAt) },
                    ]}
                    data={activityLogs}
                    loading={activityLoading}
                    pageSize={Math.max(activityLogs.length, 1)}
                    emptyMessage="No activity logs found for the selected filters."
                    sortable={false}
                  />

                  {activityPagination.totalPages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderTop: '1px solid var(--color-border)', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                        Page {activityPagination.page} of {activityPagination.totalPages} · {activityPagination.total} total action{activityPagination.total === 1 ? '' : 's'}
                      </span>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          disabled={activityLoading || activityPage <= 1}
                          onClick={() => setActivityPage((p) => Math.max(1, p - 1))}
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          disabled={activityLoading || activityPage >= activityPagination.totalPages}
                          onClick={() => setActivityPage((p) => Math.min(activityPagination.totalPages, p + 1))}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="empty-state" style={{ padding: '1.5rem' }}>
                  <div className="empty-state-text">Admin activity history is available to administrators.</div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'team' && can('manageSettings') && (
          <div className="settings-card">
            <div className="settings-card-title">Team Members</div>
            <DataTable
              columns={[
                { key: 'name', label: 'Name', render: (row) => row.name || '—' },
                { key: 'email', label: 'Email' },
                { key: 'role', label: 'Role', render: (row) => formatLabel(row.role) },
                { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
                { key: 'createdAt', label: 'Added', render: (row) => formatDate(row.createdAt) },
                {
                  key: 'actions',
                  label: '',
                  render: (row) => {
                    if (row.isSelf) {
                      return <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>You</span>;
                    }
                    if (row.kind === 'invite') {
                      return (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            disabled={busyInviteId === row.inviteId}
                            onClick={() => handleResendInvite(row)}
                          >
                            {busyInviteId === row.inviteId ? 'Sending…' : 'Resend'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            disabled={busyInviteId === row.inviteId}
                            onClick={() => handleRevokeInvite(row)}
                          >
                            Revoke
                          </button>
                        </div>
                      );
                    }
                    return (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          disabled={resettingMemberId === row.id}
                          onClick={() => handleSendReset(row)}
                          title="Email a one-time password reset link"
                        >
                          {resettingMemberId === row.id ? 'Sending…' : 'Reset password'}
                        </button>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => setRemovingMember(row)}>Remove</button>
                      </div>
                    );
                  },
                },
              ]}
              data={teamMembers}
              pageSize={10}
              emptyMessage="No team members."
              sortable={false}
            />

            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 20, marginTop: 20 }}>
              <div style={{ fontWeight: 600, marginBottom: 16, color: 'var(--color-text)' }}>Invite New Team Member</div>

              {inviteResult && (
                <div style={{ background: 'var(--color-bg-subtle, #f8f9fa)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md, 8px)', padding: 16, marginBottom: 16 }}>
                  <div style={{ fontSize: 13, marginBottom: 6 }}>
                    {inviteResult.delivery === 'failed'
                      ? <>Invitation saved for <strong>{inviteResult.email}</strong>, but the email could not be delivered.</>
                      : <>Invitation emailed to <strong>{inviteResult.email}</strong>. No password is sent — they choose one from the link.</>}
                  </div>
                  {inviteResult.expiresAt && (
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 10 }}>
                      Link expires {formatDateTime(inviteResult.expiresAt)}.
                    </div>
                  )}
                  <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 6 }} onClick={() => setInviteResult(null)}>Dismiss</button>
                </div>
              )}

              <form onSubmit={handleInvite}>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Full Name</label>
                    <input
                      className="form-input"
                      placeholder="e.g. Juan Cruz"
                      value={inviteForm.name}
                      onChange={(e) => setInviteForm((p) => ({ ...p, name: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input
                      className="form-input"
                      type="email"
                      placeholder="e.g. juan.cruz@gawa.ph"
                      value={inviteForm.email}
                      onChange={(e) => setInviteForm((p) => ({ ...p, email: e.target.value }))}
                      required
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select
                    className="form-select"
                    value={inviteForm.role}
                    onChange={(e) => setInviteForm((p) => ({ ...p, role: e.target.value }))}
                  >
                    <option value="admin">Admin</option>
                    <option value="customer_support">Customer Support</option>
                  </select>
                </div>
                {inviteMsg && (
                  <div style={{ fontSize: 13, color: /fail|could not|error/i.test(inviteMsg) ? 'var(--color-error)' : 'var(--color-success)', marginBottom: 12 }}>
                    {inviteMsg}
                  </div>
                )}
                <button type="submit" className="btn btn-primary">Create Account</button>
              </form>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!removingMember}
        title="Remove Team Member"
        message={removingMember ? `Permanently delete ${removingMember.name || removingMember.email}? They will lose access immediately and this cannot be undone.` : ''}
        confirmLabel="Remove"
        variant="danger"
        onConfirm={handleRemoveMember}
        onCancel={() => setRemovingMember(null)}
      />
    </div>
  );
}
