import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { usePermissions } from '../utils/permissions';
import { useApiData, useMutation } from '../utils/useApiData';
import { get, post } from '../api/client';
import { list as listDisputes } from '../api/disputes';
import { list as listReports } from '../api/reports';
import { list as listAppeals } from '../api/appeals';
import { list as listReviews } from '../api/reviews';
import { list as listUserIncidents } from '../api/userIncidents';
import { listJobReviewQueue, resolveJobReviewItem } from '../api/jobReviewQueue';
import { formatDate, formatDateTime, formatCurrency, timeAgo, getInitials } from '../utils/helpers';
import Header from '../components/layout/Header';
import Tabs from '../components/common/Tabs';
import FilterBar from '../components/common/FilterBar';
import DataTable from '../components/common/DataTable';
import StatusBadge from '../components/common/StatusBadge';
import SeverityBadge from '../components/common/SeverityBadge';
import DetailPanel from '../components/common/DetailPanel';
import ConfirmModal from '../components/common/ConfirmModal';
import EvidenceGallery from '../components/common/EvidenceGallery';
import CaseTimeline from '../components/common/CaseTimeline';
import { ShieldAlert, CheckCircle, XCircle, User, Briefcase, ExternalLink, FileText, Star, Skull, Clock, AlertTriangle } from 'lucide-react';

const oversightTabs = [
  { key: 'disputes', label: 'Disputes & Reports' },
  { key: 'moderation', label: 'Moderation' },
  { key: 'appeals', label: 'Appeals' },
  { key: 'job-review-queue', label: 'Job Review Queue' },
  { key: 'escalations', label: 'Account Escalations' },
];

const unifiedFilters = [
  { key: 'source', label: 'Source', placeholder: 'All Sources', options: [
    { value: 'dispute', label: 'Dispute' },
    { value: 'report', label: 'Report' },
    { value: 'incident', label: 'Incident' },
  ]},
  { key: 'type', label: 'Type', placeholder: 'All Types', options: [
    { value: 'job_dispute', label: 'Job Dispute' },
    { value: 'damage_report', label: 'Damage Report' },
    { value: 'fraud_report', label: 'Fraud Report' },
    { value: 'abuse_report', label: 'Abuse Report' },
    { value: 'report', label: 'Report' },
    { value: 'violation', label: 'Violation' },
    { value: 'fraud', label: 'Fraud' },
    { value: 'damage', label: 'Damage' },
    { value: 'abuse', label: 'Abuse' },
    { value: 'other', label: 'Other' },
  ]},
  { key: 'severity', label: 'Severity', placeholder: 'All Severities', options: [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'critical', label: 'Critical' },
  ]},
  { key: 'status', label: 'Status', placeholder: 'All Statuses', options: [
    { value: 'pending', label: 'Pending' },
    { value: 'under-review', label: 'Under Review' },
    { value: 'open', label: 'Open' },
    { value: 'investigating', label: 'Investigating' },
    { value: 'resolved', label: 'Resolved' },
    { value: 'dismissed', label: 'Dismissed' },
  ]},
];

const appealFilters = [
  { key: 'status', label: 'Status', placeholder: 'All Statuses', options: [
    { value: 'pending', label: 'Pending' },
    { value: 'forwarded', label: 'Forwarded' },
    { value: 'decided', label: 'Decided' },
  ]},
];

const unifiedColumns = [
  { key: 'title', label: 'Case', render: (row) => <span className="cell-link">{row.jobTitle || row.jobPostId || row.id}</span> },
  {
    key: '_source', label: 'Source', render: (row) => (
      <StatusBadge status={row._source === 'dispute' ? 'dispute' : row._source === 'incident' ? 'incident' : 'report'} />
    ),
  },
  { key: 'type', label: 'Type', render: (row) => <StatusBadge status={row.type} /> },
  { key: 'severity', label: 'Severity', render: (row) => <SeverityBadge severity={row.severity} /> },
  { key: 'reporterName', label: 'Reporter', render: (row) => row.reporterName || row.reporter || '-' },
  { key: 'respondentName', label: 'Respondent', render: (row) => row.respondentName || row.targetType || '-' },
  { key: 'assignedName', label: 'Assigned To', render: (row) => row.assignedName || <span className="text-muted text-xs">Unassigned</span> },
  { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
  { key: 'createdAt', label: 'Filed', render: (row) => timeAgo(row.createdAt) },
];

const reviewColumns = [
  { key: 'id', label: 'ID', render: (row) => <span className="text-xs text-muted font-mono">{row.id}</span> },
  { key: 'reviewerName', label: 'Reviewer' },
  { key: 'targetName', label: 'Target' },
  { key: 'rating', label: 'Rating', render: (row) => (
    <div className="flex items-center gap-0" style={{ whiteSpace: 'nowrap' }}>
      {Array.from({length: row.rating || 0}, (_, i) => <Star key={`f-${i}`} size={13} fill="var(--color-warning)" color="var(--color-warning)" />)}
      {Array.from({length: 5 - (row.rating || 0)}, (_, i) => <Star key={`e-${i}`} size={13} color="var(--color-border)" />)}
    </div>
  )},
  { key: 'text', label: 'Content', render: (row) => <span className="truncate" style={{ maxWidth: 250, display: 'inline-block' }}>{row.text}</span> },
  { key: 'flags', label: 'Flags', render: (row) => row.flags > 0 ? <StatusBadge status="flagged" label={row.flags} /> : '-' },
  { key: 'createdAt', label: 'Date', render: (row) => formatDate(row.createdAt) },
];

const appealColumns = [
  { key: 'userName', label: 'User', render: (row) => <span className="cell-link">{row.userName}</span> },
  { key: 'userRole', label: 'Role', render: (row) => <StatusBadge status={row.userRole} /> },
  { key: 'suspensionReason', label: 'Suspension Reason', render: (row) => <span className="truncate" style={{ maxWidth: 250, display: 'inline-block' }}>{row.suspensionReason}</span> },
  { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
  { key: 'filedAt', label: 'Filed', render: (row) => formatDate(row.filedAt) },
  { key: 'decidedAt', label: 'Decided', render: (row) => row.decidedAt ? formatDate(row.decidedAt) : '-' },
  { key: 'decision', label: 'Decision', render: (row) => row.decision ? <StatusBadge status={row.decision} /> : '-' },
];

function JobReviewQueueTab() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { can } = usePermissions(currentUser?.role);
  const { addNotification } = useNotifications();

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState('details');
  const [action, setAction] = useState(null);
  const [note, setNote] = useState('');
  const [processing, setProcessing] = useState(false);

  const { data: items, loading, refetch } = useApiData(() => listJobReviewQueue({ limit: 100 }), [], {
    defaultValue: [],
    transform: (r) => r?.data ?? r ?? [],
  });

  const [doResolve] = useMutation(resolveJobReviewItem);

  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(
      (j) =>
        j.jobTitle?.toLowerCase().includes(q) ||
        j.clientName?.toLowerCase().includes(q) ||
        j.talentName?.toLowerCase().includes(q)
    );
  }, [search, items]);

  const buildTimeline = (job) => {
    const entries = [];
    if (job.createdAt) {
      entries.push({ date: job.createdAt, title: 'Job Posted', description: `Job "${job.jobTitle}" was created`, completed: true });
    }
    if (job.talent?.submittedAt) {
      entries.push({ date: job.talent.submittedAt, title: 'Proposal Accepted', description: `${job.talentName} was hired`, completed: true });
    }
    if (job.talent?.status === 'completed') {
      entries.push({ date: job.updatedAt, title: 'Proof of Completion Submitted', description: 'Talent marked job as done and submitted proof', completed: true });
    }
    if (job._source === 'escalated') {
      entries.push({ date: job.updatedAt, title: 'Escalated to Admin', description: 'Client did not respond within the review window — awaiting admin review', completed: false, actor: 'System' });
    }
    if (job._source === 'disputed') {
      entries.push({ date: job.updatedAt, title: 'Disputed by Client', description: 'Client disputed the completion — awaiting admin review', completed: false, actor: 'Client' });
    }
    return entries;
  };

  const getProofFiles = () => [];

  const handleResolve = async () => {
    if (!action || !note.trim()) return;
    setProcessing(true);
    try {
      const resolveId = action.job._source === 'disputed'
        ? (action.job.match?.jobMatchId || action.job.talent?.jobMatchId || action.job.id)
        : (action.job.jobPostId || action.job.id);
      const response = await doResolve(resolveId, { action: action.action, adminNote: note.trim() }, action.job._source);
      addNotification('moderation_decision', `Job Review ${action.action === 'approve' ? 'Approved' : 'Rejected'}`, `${action.job.jobTitle} — ${note.trim()}`, `/jobs/${action.job.jobPostId || action.job.id}`);
      setAction(null);
      setSelected(null);
      setNote('');
      refetch();
    } catch (err) { console.error('Resolve job review failed:', err); } finally {
      setProcessing(false);
    }
  };

  const columns = [
    {
      key: 'jobTitle', label: 'Job', render: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldAlert size={15} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
          <span className="cell-link">{row.jobTitle}</span>
        </div>
      ),
    },
    {
      key: '_source', label: 'Reason', render: (row) => (
        <StatusBadge status={row._source === 'disputed' ? 'disputed' : 'no-response'} />
      ),
    },
    { key: 'clientName', label: 'Client', render: (row) => row.clientName || row.clientId?.slice(0, 8) || 'Unknown' },
    { key: 'talentName', label: 'Talent/Contractor', render: (row) => row.talentName || 'N/A' },
    { key: 'agreedPrice', label: 'Agreed Price', render: (row) => formatCurrency(row.talent?.agreedPrice || row.match?.agreedPrice || 0) },
    { key: 'updatedAt', label: 'Age', render: (row) => <span title={formatDateTime(row.updatedAt)}>{timeAgo(row.updatedAt)}</span> },
    {
      key: 'actions', label: '', width: '100px', render: (row) => (
        <button className="btn btn-accent btn-sm" onClick={(e) => { e.stopPropagation(); setSelected(row); setTab('details'); setNote(''); setAction(null); }}>
          Review
        </button>
      ),
    },
  ];

  return (
    <div className="card">
      <div className="card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldAlert size={18} style={{ color: 'var(--color-warning)' }} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>Jobs awaiting review ({items.length})</span>
        </div>
        <input className="form-input" style={{ maxWidth: 240, padding: '0.375rem 0.625rem', fontSize: 13 }} placeholder="Search jobs..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="card-body p-0">
        <DataTable columns={columns} data={filtered} onRowClick={(row) => { setSelected(row); setTab('details'); setNote(''); setAction(null); }} pageSize={10} emptyMessage={loading ? 'Loading...' : 'No jobs pending review.'} sortable={false} />
      </div>

      <DetailPanel
        open={!!selected}
        onClose={() => { setSelected(null); setAction(null); setNote(''); }}
        title={selected ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldAlert size={16} style={{ color: 'var(--color-warning)' }} />
            <span>{selected.jobTitle}</span>
          </div>
        ) : ''}
      >
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {can('resolveEscalatedJob') && (
              <div style={{ display: 'flex', gap: '0.5rem', padding: 'var(--space-3) var(--space-4)', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <button className="btn btn-success btn-sm" style={{ flex: 1 }} onClick={() => { setAction({ action: 'approve', job: selected }); setNote(''); }}>
                  <CheckCircle size={15} /> Approve & Release Payment
                </button>
                <button className="btn btn-danger btn-sm" style={{ flex: 1 }} onClick={() => { setAction({ action: 'reject', job: selected }); setNote(''); }}>
                  <XCircle size={15} /> Reject & Investigate
                </button>
              </div>
            )}
            <Tabs
              tabs={[
                { key: 'details', label: 'Details' },
                { key: 'proof', label: 'Proof of Completion' },
                { key: 'timeline', label: 'Timeline' },
                { key: 'parties', label: 'Parties' },
              ]}
              activeTab={tab}
              onChange={setTab}
            />
            {tab === 'details' && (
              <div className="card"><div className="card-body">
                <div className="detail-grid" style={{ gap: 'var(--space-3)' }}>
                  <div className="detail-field"><div className="detail-label">Status</div><div className="detail-value"><StatusBadge status={selected.jobStatus} /></div></div>
                  <div className="detail-field"><div className="detail-label">Type</div><div className="detail-value" style={{ textTransform: 'capitalize' }}>{selected.hiringOption?.replace('_', ' ')}</div></div>
                  <div className="detail-field"><div className="detail-label">Agreed Price</div><div className="detail-value">{formatCurrency(selected.talent?.agreedPrice || selected.match?.agreedPrice || 0)}</div></div>
                  <div className="detail-field"><div className="detail-label">Client</div><div className="detail-value">{selected.clientName || 'Unknown'}</div></div>
                  <div className="detail-field"><div className="detail-label">Talent</div><div className="detail-value">{selected.talentName || 'N/A'}</div></div>
                  <div className="detail-field"><div className="detail-label">Created</div><div className="detail-value">{formatDateTime(selected.createdAt)}</div></div>
                  <div className="detail-field"><div className="detail-label">Updated</div><div className="detail-value">{formatDateTime(selected.updatedAt)}</div></div>
                </div>
                {selected.description && <div style={{ marginTop: 'var(--space-3)' }}><div className="detail-label">Description</div><p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-muted)', whiteSpace: 'pre-wrap' }}>{selected.description}</p></div>}
              </div></div>
            )}
            {tab === 'proof' && (
              <div className="card">
                <div className="card-header">
                  <h3>Proof of Completion</h3>
                  {selected.talentName && <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Submitted by {selected.talentName}</span>}
                </div>
                <div className="card-body">
                  {getProofFiles(selected).length > 0 ? (
                    <EvidenceGallery items={getProofFiles(selected)} />
                  ) : (
                    <div className="empty-state" style={{ padding: '2rem' }}><FileText size={36} /><div className="empty-state-text">No proof of completion submitted</div></div>
                  )}
                </div>
              </div>
            )}
            {tab === 'timeline' && (
              <div className="card">
                <div className="card-header"><h3>Job Timeline</h3></div>
                <div className="card-body">
                  <CaseTimeline entries={buildTimeline(selected)} />
                </div>
              </div>
            )}
            {tab === 'parties' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <div className="card">
                  <div className="card-header">
                    <h3><User size={14} /> Client</h3>
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/users/${selected.clientId}`)}><ExternalLink size={13} /> Profile</button>
                  </div>
                  <div className="card-body">
                    <div className="detail-grid" style={{ gap: 'var(--space-2)' }}>
                      <div className="detail-field"><div className="detail-label">Name</div><div className="detail-value">{selected.clientName || selected.clientInfo?.name || 'Unknown'}</div></div>
                      <div className="detail-field"><div className="detail-label">Email</div><div className="detail-value">{selected.clientInfo?.email || 'N/A'}</div></div>
                      <div className="detail-field"><div className="detail-label">Phone</div><div className="detail-value">{selected.clientInfo?.phone || 'N/A'}</div></div>
                      <div className="detail-field"><div className="detail-label">Location</div><div className="detail-value">{selected.clientInfo?.location || 'N/A'}</div></div>
                    </div>
                  </div>
                </div>
                <div className="card">
                  <div className="card-header">
                    <h3><Briefcase size={14} /> Talent/Contractor</h3>
                    {selected.talent?.userId && <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/users/${selected.talent.userId}`)}><ExternalLink size={13} /> Profile</button>}
                  </div>
                  <div className="card-body">
                    {selected.talent ? (
                      <div className="detail-grid" style={{ gap: 'var(--space-2)' }}>
                        <div className="detail-field"><div className="detail-label">Name</div><div className="detail-value">{selected.talentName || 'Unknown'}</div></div>
                        <div className="detail-field"><div className="detail-label">Email</div><div className="detail-value">{selected.talent.talentInfo?.email || 'N/A'}</div></div>
                        <div className="detail-field"><div className="detail-label">Agreed Price</div><div className="detail-value">{formatCurrency(selected.talent.agreedPrice)}</div></div>
                      </div>
                    ) : (
                      <div className="empty-state" style={{ padding: '1rem' }}><div className="empty-state-text">No talent assigned</div></div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </DetailPanel>

      {action && (
        <div className="modal-overlay" onClick={() => { if (!processing) { setAction(null); setNote(''); } }}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3>{action.action === 'approve' ? 'Approve & Release Payment' : 'Reject & Flag for Investigation'}</h3>
              <button className="modal-close" onClick={() => { if (!processing) { setAction(null); setNote(''); } }} disabled={processing}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="modal-body">
              {action.action === 'approve' ? (
                <div style={{ padding: '0.75rem', background: 'var(--color-success-subtle, #dcfce7)', borderRadius: 'var(--radius-md)', marginBottom: '1rem', border: '1px solid var(--color-success)', color: 'var(--color-success)', fontSize: 13, lineHeight: 1.5 }}>
                  <CheckCircle size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                  <strong>Approve this job?</strong><br />Payment of {formatCurrency(action.job.budget)} will be released to {action.job.talentName || 'the talent'} and the job will be marked as finished.
                </div>
              ) : (
                <div style={{ padding: '0.75rem', background: 'var(--color-error-subtle, #fee2e2)', borderRadius: 'var(--radius-md)', marginBottom: '1rem', border: '1px solid var(--color-error)', color: 'var(--color-error)', fontSize: 13, lineHeight: 1.5 }}>
                  <XCircle size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                  <strong>Reject this job?</strong><br />The job will be flagged for investigation. Both the client and talent will be notified. No payment will be released.
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Admin Note <span style={{ color: 'var(--color-error)' }}>*</span></label>
                <textarea className="form-textarea" rows={4} placeholder={action.action === 'approve' ? 'Explain why this job is being approved and payment released...' : 'Describe the issue and next steps for investigation...'} value={note} onChange={(e) => setNote(e.target.value)} style={{ width: '100%' }} disabled={processing} autoFocus />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => { setAction(null); setNote(''); }} disabled={processing}>Cancel</button>
              <button className={`btn ${action.action === 'approve' ? 'btn-success' : 'btn-danger'}`} onClick={handleResolve} disabled={!note.trim() || processing}>
                {processing ? 'Processing...' : action.action === 'approve' ? (<><CheckCircle size={15} /> Approve & Release Payment</>) : (<><XCircle size={15} /> Reject & Investigate</>)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Oversight() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { can } = usePermissions(currentUser?.role);
  const { addNotification } = useNotifications();
  const [tab, setTab] = useState('disputes');
  const [uFil, uSetFil] = useState({ source: '', type: '', severity: '', status: '' });
  const [aFil, aSetFil] = useState({ status: '' });
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedReview, setSelectedReview] = useState(null);

  const { data: disputes } = useApiData(() => listDisputes({ limit: 100 }), [], {
    defaultValue: [], transform: (r) => r?.data ?? r ?? [],
  });
  const { data: allReports } = useApiData(() => listReports({ limit: 100 }), [], {
    defaultValue: [], transform: (r) => r?.data ?? r ?? [],
  });
  const { data: reviews, refetch: refetchReviews } = useApiData(() => listReviews({ limit: 100 }), [], {
    defaultValue: [], transform: (r) => r?.data ?? r ?? [],
  });
  const { data: incidents } = useApiData(() => listUserIncidents({ limit: 100 }), [], {
    defaultValue: [], transform: (r) => r?.data ?? r ?? [],
  });
  const { data: appeals } = useApiData(() => listAppeals({ limit: 100 }), [], {
    defaultValue: [], transform: (r) => r?.data ?? r ?? [],
  });

  // Escalation queue state
  const [escTab, setEscTab] = useState('expired');
  const [actionTarget, setActionTarget] = useState(null);
  const [actionType, setActionType] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const { data: queueData, refetch: refetchEsc, loading: escLoading } = useApiData(
    () => get('/users/escalation/list'),
    [],
    {
      defaultValue: { expiredSuspensions: [], escalatedToDeletion: [] },
      transform: (r) => r?.data ?? r ?? { expiredSuspensions: [], escalatedToDeletion: [] },
    }
  );

  const handleEscalate = async (user) => {
    try {
      await post(`/users/${user.id}/escalate`);
      addNotification('moderation_decision', 'User Escalated',
        `${user.name} has been escalated to deletion queue`, `/users/${user.id}`);
      refetchEsc();
    } catch (err) { console.error('Escalate user failed:', err); }
    setActionTarget(null);
  };

  const handleEscalationAction = async (user, action) => {
    try {
      await post(`/users/${user.id}/remove-from-escalation`, { action });
      const label = action === 'reinstate' ? 'Reinstated' : action === 'delete_permanently' ? 'Deleted' : 'Removed from queue';
      addNotification('moderation_decision', 'Escalation Resolved',
        `${user.name}: ${label}`, `/users/${user.id}`);
      refetchEsc();
    } catch (err) { console.error('Escalation action failed:', err); }
    setActionTarget(null);
    setActionType(null);
  };

  const expiredList = queueData.expiredSuspensions || [];
  const escalatedList = queueData.escalatedToDeletion || [];

  const flaggedReviews = useMemo(() => (reviews || []).filter((r) => r.status === 'flagged' || r.status === 'hidden' || r.flags > 0), [reviews]);

  const unifiedData = useMemo(() => {
    const d = (disputes || []).map(r => ({ ...r, _source: 'dispute' }));
    const r = (allReports || [])
      .filter(r => r.status === 'pending' || r.status === 'under-review')
      .map(r => ({ ...r, _source: 'report' }));
    const i = (incidents || []).map(r => ({ ...r, _source: 'incident' }));
    return [...d, ...r, ...i];
  }, [disputes, allReports, incidents]);

  const filteredUnified = useMemo(() => {
    let data = [...unifiedData];
    if (uFil.source) data = data.filter((d) => d._source === uFil.source);
    if (uFil.type) data = data.filter((d) => d.type === uFil.type);
    if (uFil.severity) data = data.filter((d) => d.severity === uFil.severity);
    if (uFil.status) data = data.filter((d) => d.status === uFil.status);
    return data;
  }, [uFil, unifiedData]);

  const filteredAppeals = useMemo(() => {
    let data = [...appeals];
    if (aFil.status) data = data.filter((a) => a.status === aFil.status);
    return data;
  }, [aFil, appeals]);

  const [actionPrompt, setActionPrompt] = useState(null);
  const [actionReason, setActionReason] = useState('');

  const handleModDecision = async (decision) => {
    const item = selectedReview;
    if (!item) return;
    setActionPrompt({
      title: `Enter notes for "${decision}" decision`,
      onConfirm: async (reason) => {
        try {
          await post(`/reviews/${item.id}/moderate`, { action: decision });
          refetchReviews();
          addNotification('moderation_decision', 'Moderation Decision', `Decision: ${decision} on ${item.id} - ${reason}`, '/oversight');
          setSelectedReview(null);
        } catch (err) { console.error('Moderation decision failed:', err); }
      },
    });
  };

  const renderModeration = () => (
    <div className="card">
      <div className="card-body p-0">
        <DataTable
          columns={reviewColumns}
          data={flaggedReviews}
          onRowClick={(row) => setSelectedReview(row)}
          pageSize={10}
          emptyMessage="No flagged reviews."
        />
      </div>
      <DetailPanel open={!!selectedReview} onClose={() => setSelectedReview(null)} title="Moderation Decision">
        {selectedReview && (
          <div>
            <div className="detail-panel-section">
              <h4>Details</h4>
              <div className="detail-field"><div className="detail-label">ID</div><div className="detail-value">{selectedReview.id}</div></div>
              {selectedReview.reviewerName && <div className="detail-field"><div className="detail-label">Reviewer</div><div className="detail-value">{selectedReview.reviewerName}</div></div>}
              {selectedReview.targetName && <div className="detail-field"><div className="detail-label">Target</div><div className="detail-value">{selectedReview.targetName}</div></div>}
              {selectedReview.title && <div className="detail-field"><div className="detail-label">Title</div><div className="detail-value">{selectedReview.title}</div></div>}
              {selectedReview.text && <div className="detail-field"><div className="detail-label">Content</div><div className="detail-value">{selectedReview.text}</div></div>}
              {selectedReview.description && <div className="detail-field"><div className="detail-label">Description</div><div className="detail-value">{selectedReview.description}</div></div>}
              {selectedReview.rating && (
                <div className="detail-field">
                  <div className="detail-label">Rating</div>
                  <div className="detail-value flex items-center gap-0" style={{ whiteSpace: 'nowrap' }}>
                    {Array.from({length: selectedReview.rating}, (_, i) => <Star key={`f-${i}`} size={13} fill="var(--color-warning)" color="var(--color-warning)" />)}
                    {Array.from({length: 5 - selectedReview.rating}, (_, i) => <Star key={`e-${i}`} size={13} color="var(--color-border)" />)}
                  </div>
                </div>
              )}
              <div className="detail-field"><div className="detail-label">Status</div><div className="detail-value"><StatusBadge status={selectedReview.status} /></div></div>
            </div>
            <div className="detail-panel-section">
              <h4>Actions</h4>
              <div className="flex flex-col gap-2">
                <button className="btn btn-success" onClick={() => handleModDecision('keep')}>Keep (No Action)</button>
                <button className="btn btn-warning" onClick={() => handleModDecision('warn')}>Warn User</button>
                <button className="btn btn-outline" onClick={() => handleModDecision('hide')}>Hide Content</button>
                {can('moderateReview') && <button className="btn btn-danger" onClick={() => handleModDecision('remove')}>Remove Content</button>}
              </div>
            </div>
            {selectedReview.decision && (
              <div className="detail-panel-section">
                <h4>Previous Decision</h4>
                <div className="detail-field"><div className="detail-label">Decision</div><div className="detail-value">{selectedReview.decision}</div></div>
                {selectedReview.decisionNotes && <div className="detail-field"><div className="detail-label">Notes</div><div className="detail-value">{selectedReview.decisionNotes}</div></div>}
              </div>
            )}
          </div>
        )}
      </DetailPanel>
    </div>
  );

  return (
    <div>
      <Header title="Oversight" />
      <Tabs tabs={oversightTabs} activeTab={tab} onChange={setTab} />
      <div className="tab-content">
        {tab === 'disputes' && (
          <div>
            <div className="card">
              <div className="card-header">
                <FilterBar filters={unifiedFilters} values={uFil} onChange={(key, value) => uSetFil((p) => ({ ...p, [key]: value }))} />
              </div>
              <div className="card-body p-0">
                <DataTable columns={unifiedColumns} data={filteredUnified} onRowClick={(row) => setSelectedItem(row)} pageSize={10} emptyMessage="No disputes, reports, or incidents found." />
              </div>
            </div>
            <DetailPanel open={!!selectedItem} onClose={() => setSelectedItem(null)} title={selectedItem?.title || 'Details'}>
              {selectedItem && (
                <div>
                  <div className="detail-panel-section">
                    <h4>Overview</h4>
                    <div className="detail-field"><div className="detail-label">ID</div><div className="detail-value">{selectedItem.id}</div></div>
                    <div className="detail-field"><div className="detail-label">Title</div><div className="detail-value">{selectedItem.title || '-'}</div></div>
                    <div className="detail-field"><div className="detail-label">Source</div><div className="detail-value"><StatusBadge status={selectedItem._source} /></div></div>
                    <div className="detail-field"><div className="detail-label">Type</div><div className="detail-value"><StatusBadge status={selectedItem.type} /></div></div>
                    <div className="detail-field"><div className="detail-label">Severity</div><div className="detail-value"><SeverityBadge severity={selectedItem.severity} /></div></div>
                    <div className="detail-field"><div className="detail-label">Status</div><div className="detail-value"><StatusBadge status={selectedItem.status} /></div></div>
                    {selectedItem.description && <div className="detail-field"><div className="detail-label">Description</div><div className="detail-value">{selectedItem.description}</div></div>}
                    {selectedItem.reporterName && <div className="detail-field"><div className="detail-label">Reporter</div><div className="detail-value">{selectedItem.reporterName}</div></div>}
                    {selectedItem.reporter && <div className="detail-field"><div className="detail-label">Reporter</div><div className="detail-value">{selectedItem.reporter}</div></div>}
                    {selectedItem.respondentName && <div className="detail-field"><div className="detail-label">Respondent</div><div className="detail-value">{selectedItem.respondentName}</div></div>}
                    {selectedItem.targetType && <div className="detail-field"><div className="detail-label">Target Type</div><div className="detail-value">{selectedItem.targetType}</div></div>}
                    {selectedItem.assignedName && <div className="detail-field"><div className="detail-label">Assigned To</div><div className="detail-value">{selectedItem.assignedName}</div></div>}
                    {selectedItem.module && <div className="detail-field"><div className="detail-label">Module</div><div className="detail-value"><StatusBadge status={selectedItem.module} /></div></div>}
                    {selectedItem.createdAt && <div className="detail-field"><div className="detail-label">Filed</div><div className="detail-value">{formatDateTime(selectedItem.createdAt)}</div></div>}
                    {selectedItem.resolvedAt && <div className="detail-field"><div className="detail-label">Resolved At</div><div className="detail-value">{formatDateTime(selectedItem.resolvedAt)}</div></div>}
                  </div>
                  <div className="detail-panel-section">
                    <h4>Actions</h4>
                    <div className="flex flex-col gap-2">
                      {selectedItem._source === 'dispute' && (
                        <button className="btn btn-accent" onClick={() => { navigate(`/disputes/${selectedItem.id}`); setSelectedItem(null); }}>
                          View Full Dispute
                        </button>
                      )}
                      {selectedItem._source === 'incident' && selectedItem.status !== 'resolved' && (
                        <>
                          <button className="btn btn-success" onClick={async () => {
                            try {
                              const body = { status: 'resolved', resolution: 'Resolved by admin' };
                              await (await import('../api/userIncidents')).updateStatus(selectedItem.id, body);
                              addNotification('moderation_decision', 'Incident Resolved', `Incident ${selectedItem.id} resolved`, '/oversight');
                              setSelectedItem(null);
                            } catch (err) { console.error('Resolve incident failed:', err); }
                          }}>Resolve Incident</button>
                          <button className="btn btn-outline" onClick={async () => {
                            try {
                              const body = { assignedTo: currentUser?.id };
                              await (await import('../api/userIncidents')).updateStatus(selectedItem.id, body);
                              addNotification('moderation_decision', 'Incident Assigned', `Incident assigned to ${currentUser?.name}`, '/oversight');
                              setSelectedItem(null);
                            } catch (err) { console.error('Assign incident failed:', err); }
                          }}>Assign to Me</button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </DetailPanel>
          </div>
        )}
        {tab === 'moderation' && renderModeration()}
        {tab === 'appeals' && (
          <div className="card">
            <div className="card-header">
              <FilterBar filters={appealFilters} values={aFil} onChange={(key, value) => aSetFil((p) => ({ ...p, [key]: value }))} />
            </div>
            <div className="card-body p-0">
              <DataTable columns={appealColumns} data={filteredAppeals} onRowClick={(row) => navigate(`/appeals/${row.id}`)} pageSize={10} emptyMessage="No appeals found." />
            </div>
          </div>
        )}
        {tab === 'job-review-queue' && <JobReviewQueueTab />}
        {tab === 'escalations' && (
          <>
            <div className="card mb-4">
              <div className="card-body" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <div className="stat-card-sm">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-warning)' }}>
                    <Clock size={16} />
                    <span className="text-sm">Expired Suspensions</span>
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{expiredList.length}</div>
                </div>
                <div className="stat-card-sm">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-error)' }}>
                    <Skull size={16} />
                    <span className="text-sm">Escalated to Deletion</span>
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{escalatedList.length}</div>
                </div>
              </div>
            </div>

            <Tabs
              tabs={[
                { key: 'expired', label: 'Expired Suspensions' },
                { key: 'escalated', label: 'Escalated to Deletion' },
              ]}
              activeTab={escTab}
              onChange={setEscTab}
            />

            {escTab === 'expired' && (
              <div className="card">
                {escLoading ? (
                  <div className="card-body"><div className="empty-state"><div className="empty-state-text">Loading...</div></div></div>
                ) : expiredList.length === 0 ? (
                  <div className="card-body">
                    <div className="empty-state">
                      <AlertTriangle size={32} style={{ color: 'var(--color-text-muted)', marginBottom: '0.5rem' }} />
                      <div className="empty-state-text">No expired suspensions</div>
                      <div className="text-xs text-muted mt-2">All suspended users are within their suspension period.</div>
                    </div>
                  </div>
                ) : (
                  <div className="card-body p-0">
                    <DataTable
                      columns={[
                        {
                          key: 'name', label: 'User', render: (row) => (
                            <div className="flex items-center gap-2">
                              <div className="user-avatar-sm">{getInitials(row.name)}</div>
                              <span className="cell-link" onClick={() => navigate(`/users/${row.id}`)}>{row.name}</span>
                            </div>
                          ),
                        },
                        { key: 'role', label: 'Role', render: (row) => <StatusBadge status={row.role} /> },
                        { key: 'email', label: 'Email' },
                        {
                          key: 'suspendedUntil', label: 'Suspended Until', render: (row) => (
                            <span style={{ color: 'var(--color-warning)' }}>
                              {formatDateTime(row.suspendedUntil)} <span className="text-xs text-muted">(Expired)</span>
                            </span>
                          ),
                        },
                        {
                          key: 'suspensionReason', label: 'Reason', render: (row) => (
                            <span className="truncate" style={{ maxWidth: 200, display: 'inline-block' }}>
                              {row.suspensionReason || 'No reason provided'}
                            </span>
                          ),
                        },
                        {
                          key: 'actions', label: 'Actions', render: (row) => (
                            <div className="flex gap-1">
                              <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); setActionTarget(row); setActionType('escalate'); }}>
                                Escalate to Deletion
                              </button>
                              <button className="btn btn-sm btn-success" onClick={(e) => { e.stopPropagation(); handleEscalationAction(row, 'reinstate'); }}>
                                Reinstate
                              </button>
                            </div>
                          ),
                        },
                      ]}
                      data={expiredList}
                      onRowClick={(row) => navigate(`/users/${row.id}`)}
                      pageSize={10}
                      emptyMessage="No expired suspensions."
                    />
                  </div>
                )}
              </div>
            )}
            {escTab === 'escalated' && (
              <div className="card">
                {escLoading ? (
                  <div className="card-body"><div className="empty-state"><div className="empty-state-text">Loading...</div></div></div>
                ) : escalatedList.length === 0 ? (
                  <div className="card-body">
                    <div className="empty-state">
                      <Skull size={32} style={{ color: 'var(--color-text-muted)', marginBottom: '0.5rem' }} />
                      <div className="empty-state-text">No escalated accounts</div>
                      <div className="text-xs text-muted mt-2">No users have been escalated to the deletion queue.</div>
                    </div>
                  </div>
                ) : (
                  <div className="card-body p-0">
                    <DataTable
                      columns={[
                        {
                          key: 'name', label: 'User', render: (row) => (
                            <div className="flex items-center gap-2">
                              <div className="user-avatar-sm">{getInitials(row.name)}</div>
                              <span className="cell-link" onClick={() => navigate(`/users/${row.id}`)}>{row.name}</span>
                            </div>
                          ),
                        },
                        { key: 'role', label: 'Role', render: (row) => <StatusBadge status={row.role} /> },
                        { key: 'email', label: 'Email' },
                        {
                          key: 'suspensionReason', label: 'Suspension Reason', render: (row) => (
                            <span className="truncate" style={{ maxWidth: 200, display: 'inline-block' }}>{row.suspensionReason || 'No reason provided'}</span>
                          ),
                        },
                        {
                          key: 'actions', label: 'Actions', render: (row) => (
                            <div className="flex gap-1">
                              <button className="btn btn-sm btn-success" onClick={(e) => { e.stopPropagation(); handleEscalationAction(row, 'reinstate'); }}>Reinstate</button>
                              <button className="btn btn-sm btn-outline" onClick={(e) => { e.stopPropagation(); handleEscalationAction(row, 'keep_suspended'); }}>Keep Suspended</button>
                              <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); setActionTarget(row); setActionType('delete'); }}>Delete Permanently</button>
                            </div>
                          ),
                        },
                      ]}
                      data={escalatedList}
                      onRowClick={(row) => navigate(`/users/${row.id}`)}
                      pageSize={10}
                      emptyMessage="No escalated accounts."
                    />
                  </div>
                )}
              </div>
            )}

            {actionTarget && actionType === 'delete' ? (
              <div className="modal-overlay" onClick={() => { setActionTarget(null); setActionType(null); setDeleteConfirmText(''); }}>
                <div className="modal" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-header">
                    <h3>Delete Account Permanently</h3>
                    <button className="modal-close" onClick={() => { setActionTarget(null); setActionType(null); setDeleteConfirmText(''); }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                  <div className="modal-body">
                    <div style={{ padding: '0.75rem', background: 'var(--color-error-subtle, #fee2e2)', borderRadius: 'var(--radius-md)', marginBottom: '1rem', border: '1px solid var(--color-error)', color: 'var(--color-error)' }}>
                      <strong>This action CANNOT be undone.</strong> All personal data will be removed or anonymized.
                    </div>
                    <p style={{ color: 'var(--color-text-muted)', lineHeight: 1.6, marginBottom: '0.75rem' }}>
                      To confirm, type <strong>{actionTarget.name}</strong> below:
                    </p>
                    <input
                      type="text"
                      className="form-input"
                      placeholder={`Type "${actionTarget.name}" to confirm`}
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '0.5rem',
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-bg)',
                        color: 'var(--color-text)',
                        fontSize: '0.875rem',
                      }}
                      autoFocus
                    />
                  </div>
                  <div className="modal-footer">
                    <button className="btn btn-outline" onClick={() => { setActionTarget(null); setActionType(null); setDeleteConfirmText(''); }}>
                      Cancel
                    </button>
                    <button
                      className="btn btn-danger"
                      disabled={deleteConfirmText !== actionTarget?.name}
                      onClick={() => {
                        if (deleteConfirmText === actionTarget?.name) {
                          handleEscalationAction(actionTarget, 'delete_permanently');
                          setDeleteConfirmText('');
                        }
                      }}
                    >
                      Delete Permanently
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <ConfirmModal
                open={!!actionTarget}
                title={actionType === 'escalate' ? 'Escalate to Deletion' : ''}
                message={
                  actionType === 'escalate'
                    ? `Are you sure you want to escalate ${actionTarget?.name} to the deletion queue? This will archive their account and flag it for permanent deletion. The user will be notified.`
                    : ''
                }
                confirmLabel="Escalate"
                variant="danger"
                onConfirm={() => { if (actionType === 'escalate') handleEscalate(actionTarget); }}
                onCancel={() => { setActionTarget(null); setActionType(null); setDeleteConfirmText(''); }}
              />
            )}
            {actionPrompt && (
              <div className="modal-overlay" onClick={() => { setActionPrompt(null); setActionReason(''); }}>
                <div className="modal" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-header">
                    <h3>{actionPrompt.title}</h3>
                    <button className="modal-close" onClick={() => { setActionPrompt(null); setActionReason(''); }}><span style={{ fontSize: 18 }}>×</span></button>
                  </div>
                  <div className="modal-body">
                    <textarea
                      className="input"
                      style={{ width: '100%', minHeight: 80, resize: 'vertical' }}
                      value={actionReason}
                      onChange={(e) => setActionReason(e.target.value)}
                      placeholder="Enter notes (optional)..."
                      autoFocus
                    />
                  </div>
                  <div className="modal-footer">
                    <button className="btn btn-outline" onClick={() => { setActionPrompt(null); setActionReason(''); }}>Cancel</button>
                    <button className="btn btn-accent" onClick={() => { actionPrompt.onConfirm(actionReason); setActionPrompt(null); setActionReason(''); }}>Confirm</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
