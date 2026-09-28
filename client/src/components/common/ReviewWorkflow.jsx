import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, CheckCircle, XCircle, User, Briefcase, FileText, ExternalLink } from 'lucide-react';
import { formatDateTime, formatCurrency, timeAgo } from '../../utils/helpers';
import DataTable from './DataTable';
import DetailPanel from './DetailPanel';
import Tabs from './Tabs';
import EvidenceGallery from './EvidenceGallery';
import CaseTimeline from './CaseTimeline';
import StatusBadge from './StatusBadge';

function getField(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

export default function ReviewWorkflow({
  title,
  items = [],
  loading = false,
  icon: Icon = ShieldAlert,
  iconColor = 'var(--color-warning)',
  dateLabel = 'Date',
  searchPlaceholder = 'Search...',
  enableSearch = false,
  searchFields = ['title'],
  emptyMessage = 'No items.',
  loadingMessage = 'Loading...',
  onResolve,
  canResolve = true,
  buildTimeline,
  getProofFiles,
  pageSize = 10,
  sortable = false,
}) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState('details');
  const [action, setAction] = useState(null);
  const [note, setNote] = useState('');
  const [processing, setProcessing] = useState(false);

  const filtered = enableSearch && search.trim()
    ? items.filter((item) =>
        searchFields.some((field) => {
          const val = getField(item, field);
          return val?.toLowerCase().includes(search.toLowerCase());
        })
      )
    : items;

  const handleResolve = async () => {
    if (!action || !note.trim()) return;
    setProcessing(true);
    try {
      await onResolve(action, note.trim());
      setAction(null);
      setSelected(null);
      setNote('');
    } catch {} finally {
      setProcessing(false);
    }
  };

  const columns = [
    {
      key: 'title', label: 'Job', render: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon size={15} style={{ color: iconColor, flexShrink: 0 }} />
          <span className="cell-link">{row.title}</span>
        </div>
      ),
    },
    { key: 'clientName', label: 'Client', render: (row) => row.clientInfo?.name || row.clientId?.slice(0, 8) || 'Unknown' },
    { key: 'talentName', label: 'Talent', render: (row) => row.talent?.talentInfo?.name || 'N/A' },
    { key: 'budget', label: 'Budget', render: (row) => formatCurrency(row.budget) },
    { key: 'updatedAt', label: dateLabel, render: (row) => <span title={formatDateTime(row.updatedAt)}>{timeAgo(row.updatedAt)}</span> },
    {
      key: 'actions', label: '', width: '100px', render: (row) => (
        <button className="btn btn-accent btn-sm" onClick={(e) => { e.stopPropagation(); setSelected(row); setTab('details'); setNote(''); setAction(null); }}>
          Review
        </button>
      ),
    },
  ];

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon size={18} style={{ color: iconColor }} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>{title} ({items.length})</span>
          </div>
          {enableSearch && (
            <input
              className="form-input"
              style={{ maxWidth: 240, padding: '0.375rem 0.625rem', fontSize: 13 }}
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}
        </div>
        <div className="card-body p-0">
          <DataTable
            columns={columns}
            data={filtered}
            onRowClick={(row) => { setSelected(row); setTab('details'); setNote(''); setAction(null); }}
            pageSize={pageSize}
            emptyMessage={loading ? loadingMessage : emptyMessage}
            sortable={sortable}
          />
        </div>
      </div>

      <DetailPanel
        open={!!selected}
        onClose={() => { setSelected(null); setAction(null); setNote(''); }}
        title={selected ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon size={16} style={{ color: iconColor }} />
            <span>{selected.title}</span>
          </div>
        ) : ''}
      >
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {canResolve && (
              <div style={{ display: 'flex', gap: '0.5rem', padding: 'var(--space-3) var(--space-4)', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <button className="btn btn-success btn-sm" style={{ flex: 1 }} onClick={() => { setAction({ action: 'approve', job: selected }); setNote(''); }}>
                  <CheckCircle size={15} /> Approve & Release
                </button>
                <button className="btn btn-danger btn-sm" style={{ flex: 1 }} onClick={() => { setAction({ action: 'reject', job: selected }); setNote(''); }}>
                  <XCircle size={15} /> Reject & Investigate
                </button>
              </div>
            )}
            <Tabs
              tabs={[
                { key: 'details', label: 'Details' },
                { key: 'proof', label: 'Proof' },
                { key: 'timeline', label: 'Timeline' },
                { key: 'parties', label: 'Parties' },
              ]}
              activeTab={tab}
              onChange={setTab}
            />
            {tab === 'details' && (
              <div className="card"><div className="card-body">
                <div className="detail-grid" style={{ gap: 'var(--space-3)' }}>
                  <div className="detail-field"><div className="detail-label">Status</div><div className="detail-value"><StatusBadge status={selected.status} /></div></div>
                  <div className="detail-field"><div className="detail-label">Type</div><div className="detail-value" style={{ textTransform: 'capitalize' }}>{selected.type?.replace('-', ' ')}</div></div>
                  <div className="detail-field"><div className="detail-label">Budget</div><div className="detail-value">{formatCurrency(selected.budget)}</div></div>
                  <div className="detail-field"><div className="detail-label">Client</div><div className="detail-value">{selected.clientInfo?.name || 'Unknown'}</div></div>
                  <div className="detail-field"><div className="detail-label">Talent</div><div className="detail-value">{selected.talent?.talentInfo?.name || 'N/A'}</div></div>
                  <div className="detail-field"><div className="detail-label">Location</div><div className="detail-value">{selected.location || 'N/A'}</div></div>
                  <div className="detail-field"><div className="detail-label">Category</div><div className="detail-value">{selected.category || 'N/A'}</div></div>
                  <div className="detail-field"><div className="detail-label">Created</div><div className="detail-value">{formatDateTime(selected.createdAt)}</div></div>
                  <div className="detail-field"><div className="detail-label">Date</div><div className="detail-value">{formatDateTime(selected.updatedAt)}</div></div>
                </div>
                {selected.description && <div style={{ marginTop: 'var(--space-3)' }}><div className="detail-label">Description</div><p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-muted)', whiteSpace: 'pre-wrap' }}>{selected.description}</p></div>}
              </div></div>
            )}
            {tab === 'proof' && (
              <div className="card">
                <div className="card-header">
                  <h3>Proof of Completion</h3>
                  {selected.talent?.talentInfo?.name && <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Submitted by {selected.talent.talentInfo.name}</span>}
                </div>
                <div className="card-body">
                  {(getProofFiles ? getProofFiles(selected) : selected.talent?.proofFiles || []).length > 0 ? (
                    <EvidenceGallery items={getProofFiles ? getProofFiles(selected) : selected.talent?.proofFiles || []} />
                  ) : (
                    <div className="empty-state" style={{ padding: '2rem' }}><FileText size={36} /><div className="empty-state-text">No proof submitted</div></div>
                  )}
                </div>
              </div>
            )}
            {tab === 'timeline' && (
              <div className="card">
                <div className="card-header"><h3>Job Timeline</h3></div>
                <div className="card-body">
                  <CaseTimeline entries={buildTimeline ? buildTimeline(selected) : []} />
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
                      <div className="detail-field"><div className="detail-label">Name</div><div className="detail-value">{selected.clientInfo?.name || 'Unknown'}</div></div>
                      <div className="detail-field"><div className="detail-label">Email</div><div className="detail-value">{selected.clientInfo?.email || 'N/A'}</div></div>
                      <div className="detail-field"><div className="detail-label">Phone</div><div className="detail-value">{selected.clientInfo?.phone || 'N/A'}</div></div>
                      <div className="detail-field"><div className="detail-label">Location</div><div className="detail-value">{selected.clientInfo?.location || 'N/A'}</div></div>
                    </div>
                  </div>
                </div>
                <div className="card">
                  <div className="card-header">
                    <h3><Briefcase size={14} /> Talent</h3>
                    {selected.talent?.talentId && <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/users/${selected.talent.talentId}`)}><ExternalLink size={13} /> Profile</button>}
                  </div>
                  <div className="card-body">
                    {selected.talent ? (
                      <div className="detail-grid" style={{ gap: 'var(--space-2)' }}>
                        <div className="detail-field"><div className="detail-label">Name</div><div className="detail-value">{selected.talent.talentInfo?.name || 'Unknown'}</div></div>
                        <div className="detail-field"><div className="detail-label">Email</div><div className="detail-value">{selected.talent.talentInfo?.email || 'N/A'}</div></div>
                        <div className="detail-field"><div className="detail-label">Bid</div><div className="detail-value">{formatCurrency(selected.talent.amount)}</div></div>
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
                  <strong>Approve this job?</strong><br />Payment of {formatCurrency(action.job.budget)} will be released to {action.job.talent?.talentInfo?.name || 'the talent'} and the job will be marked as finished.
                </div>
              ) : (
                <div style={{ padding: '0.75rem', background: 'var(--color-error-subtle, #fee2e2)', borderRadius: 'var(--radius-md)', marginBottom: '1rem', border: '1px solid var(--color-error)', color: 'var(--color-error)', fontSize: 13, lineHeight: 1.5 }}>
                  <XCircle size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                  <strong>Reject this job?</strong><br />The job will be flagged for investigation. No payment released.
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Admin Note <span style={{ color: 'var(--color-error)' }}>*</span></label>
                <textarea className="form-textarea" rows={4} placeholder={action.action === 'approve' ? 'Explain why...' : 'Describe the issue...'} value={note} onChange={(e) => setNote(e.target.value)} style={{ width: '100%' }} disabled={processing} autoFocus />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => { setAction(null); setNote(''); }} disabled={processing}>Cancel</button>
              <button className={`btn ${action.action === 'approve' ? 'btn-success' : 'btn-danger'}`} onClick={handleResolve} disabled={!note.trim() || processing}>
                {processing ? 'Processing...' : action.action === 'approve' ? (<><CheckCircle size={15} /> Approve & Release</>) : (<><XCircle size={15} /> Reject & Investigate</>)}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
