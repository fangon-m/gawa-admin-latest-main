import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { usePermissions } from '../utils/permissions';
import { useApiData, useMutation } from '../utils/useApiData';
import { list as listEscalated, resolve as resolveEscalated } from '../api/escalatedJobs';
import { formatDate, formatDateTime, formatCurrency, timeAgo } from '../utils/helpers';
import Header from '../components/layout/Header';
import DataTable from '../components/common/DataTable';
import StatusBadge from '../components/common/StatusBadge';
import DetailPanel from '../components/common/DetailPanel';
import EvidenceGallery from '../components/common/EvidenceGallery';
import CaseTimeline from '../components/common/CaseTimeline';
import Tabs from '../components/common/Tabs';
import {
  ShieldAlert, CheckCircle, XCircle,
  User, Briefcase,
  ExternalLink, FileText,
} from 'lucide-react';

export default function EscalatedJobs() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { can } = usePermissions(currentUser?.role);
  const { addNotification } = useNotifications();

  const [search, setSearch] = useState('');
  const [selectedJob, setSelectedJob] = useState(null);
  const [reviewTab, setReviewTab] = useState('details');
  const [actionModal, setActionModal] = useState(null); // { action: 'approve' | 'reject', job }
  const [adminNote, setAdminNote] = useState('');
  const [processing, setProcessing] = useState(false);

  const { data: jobs, loading, refetch } = useApiData(() => listEscalated({ limit: 100 }), [], {
    defaultValue: [],
    transform: (r) => r?.data ?? r ?? [],
  });

  const [doResolve] = useMutation(resolveEscalated);

  const filtered = useMemo(() => {
    if (!search) return jobs;
    const q = search.toLowerCase();
    return jobs.filter(
      (j) =>
        j.jobTitle?.toLowerCase().includes(q) ||
        j.clientInfo?.name?.toLowerCase().includes(q) ||
        j.talentName?.toLowerCase().includes(q)
    );
  }, [search, jobs]);

  const columns = [
    {
      key: 'jobTitle',
      label: 'Job',
      render: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldAlert size={15} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
          <span className="cell-link">{row.jobTitle}</span>
        </div>
      ),
    },
    {
      key: 'clientName',
      label: 'Client',
      render: (row) => row.clientInfo?.name || row.clientId?.slice(0, 8) || 'Unknown',
    },
    {
      key: 'talentName',
      label: 'Talent/Contractor',
      render: (row) => row.talentName || 'N/A',
    },
    {
      key: 'agreedPrice',
      label: 'Agreed Price',
      render: (row) => formatCurrency(row.talent?.agreedPrice || 0),
    },
    {
      key: 'updatedAt',
      label: 'Escalated',
      render: (row) => (
        <span title={formatDateTime(row.updatedAt)}>
          {timeAgo(row.updatedAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '',
      width: '100px',
      render: (row) => (
        <button
          className="btn btn-accent btn-sm"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedJob(row);
            setReviewTab('details');
            setAdminNote('');
            setActionModal(null);
          }}
        >
          Review
        </button>
      ),
    },
  ];

  const handleResolve = async () => {
    if (!actionModal || !adminNote.trim()) return;
    setProcessing(true);
    try {
      const response = await doResolve(actionModal.job.id, {
        action: actionModal.action,
        adminNote: adminNote.trim(),
      });

      const message = response?.message || `Job ${actionModal.action === 'approve' ? 'approved' : 'rejected'} successfully.`;

      addNotification(
        'moderation_decision',
        `Escalated Job ${actionModal.action === 'approve' ? 'Approved' : 'Rejected'}`,
        `${actionModal.job.jobTitle} — ${adminNote.trim()}`,
        `/jobs/${actionModal.job.id}`
      );

      // Close everything and refresh
      setActionModal(null);
      setSelectedJob(null);
      setAdminNote('');
      refetch();
    } catch (err) {
      // Error is handled by useMutation
    } finally {
      setProcessing(false);
    }
  };

  // Build timeline from job data
  const buildTimeline = (job) => {
    const entries = [];
    if (job.createdAt) {
      entries.push({
        date: job.createdAt,
        title: 'Job Posted',
        description: `Job "${job.jobTitle}" was created`,
        completed: true,
      });
    }
    if (job.talent?.submittedAt) {
      entries.push({
        date: job.talent.submittedAt,
        title: 'Proposal Accepted',
        description: `${job.talentName} was hired for the job`,
        completed: true,
      });
    }
    if (job.talent?.completionStatus === 'completed') {
      entries.push({
        date: job.updatedAt,
        title: 'Proof of Completion Submitted',
        description: 'Talent marked job as done and submitted proof',
        completed: true,
      });
    }
    if (job.updatedAt && job.status === 'escalated') {
      entries.push({
        date: job.updatedAt,
        title: 'Escalated to Admin',
        description: 'Client did not respond within the review window — awaiting admin review',
        completed: false,
        actor: 'System',
      });
    }
    return entries;
  };

  // Build proof files from the talent's submission
  const getProofFiles = () => {
    return [];
  };

  return (
    <div>
      <Header title="Escalated Jobs" onSearch={setSearch} />

      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldAlert size={18} style={{ color: 'var(--color-warning)' }} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>
              Jobs awaiting review ({jobs.length})
            </span>
          </div>
        </div>
        <div className="card-body p-0">
          <DataTable
            columns={columns}
            data={filtered}
            onRowClick={(row) => {
              setSelectedJob(row);
              setReviewTab('details');
              setAdminNote('');
              setActionModal(null);
            }}
            pageSize={10}
            emptyMessage={
              loading
                ? 'Loading escalated jobs...'
                : 'No escalated jobs. All proof-of-completion reviews are up to date.'
            }
            sortable={false}
          />
        </div>
      </div>

      {/* Review Detail Panel */}
      <DetailPanel
        open={!!selectedJob}
        onClose={() => {
          setSelectedJob(null);
          setActionModal(null);
          setAdminNote('');
        }}
        title={
          selectedJob ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldAlert size={16} style={{ color: 'var(--color-warning)' }} />
              <span>{selectedJob.jobTitle}</span>
            </div>
          ) : ''
        }
      >
        {selectedJob && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {/* Quick actions bar */}
            {can('resolveEscalatedJob') && (
              <div
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  padding: 'var(--space-3) var(--space-4)',
                  background: 'var(--color-surface)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <button
                  className="btn btn-success btn-sm"
                  style={{ flex: 1 }}
                  onClick={() => {
                    setActionModal({ action: 'approve', job: selectedJob });
                    setAdminNote('');
                  }}
                >
                  <CheckCircle size={15} /> Approve & Release Payment
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  style={{ flex: 1 }}
                  onClick={() => {
                    setActionModal({ action: 'reject', job: selectedJob });
                    setAdminNote('');
                  }}
                >
                  <XCircle size={15} /> Reject & Investigate
                </button>
              </div>
            )}

            {/* Tabs: Details, Proof, Timeline, Parties */}
            <Tabs
              tabs={[
                { key: 'details', label: 'Details' },
                { key: 'proof', label: 'Proof of Completion' },
                { key: 'timeline', label: 'Timeline' },
                { key: 'parties', label: 'Parties' },
              ]}
              activeTab={reviewTab}
              onChange={setReviewTab}
            />

            {/* Tab: Details */}
            {reviewTab === 'details' && (
              <div className="card">
                <div className="card-body">
                  <div className="detail-grid" style={{ gap: 'var(--space-3)' }}>
                    <div className="detail-field">
                      <div className="detail-label">Status</div>
                      <div className="detail-value">
                        <StatusBadge status={selectedJob.status} />
                      </div>
                    </div>
                    <div className="detail-field">
                      <div className="detail-label">Type</div>
                      <div className="detail-value" style={{ textTransform: 'capitalize' }}>
                        {selectedJob.hiringOption?.replace('-', ' ')}
                      </div>
                    </div>
                    <div className="detail-field">
                      <div className="detail-label">Budget</div>
                      <div className="detail-value">
                        {formatCurrency(selectedJob.talent?.agreedPrice || 0)}
                      </div>
                    </div>
                    <div className="detail-field">
                      <div className="detail-label">Client</div>
                      <div className="detail-value">{selectedJob.clientInfo?.name || 'Unknown'}</div>
                    </div>
                    <div className="detail-field">
                      <div className="detail-label">Talent</div>
                      <div className="detail-value">
                        {selectedJob.talentName || 'N/A'}
                      </div>
                    </div>
                    <div className="detail-field">
                      <div className="detail-label">Location</div>
                      <div className="detail-value">{selectedJob.location || 'N/A'}</div>
                    </div>
                    <div className="detail-field">
                      <div className="detail-label">Category</div>
                      <div className="detail-value">{selectedJob.category || 'N/A'}</div>
                    </div>
                    <div className="detail-field">
                      <div className="detail-label">Created</div>
                      <div className="detail-value">{formatDateTime(selectedJob.createdAt)}</div>
                    </div>
                    <div className="detail-field">
                      <div className="detail-label">Escalated</div>
                      <div className="detail-value">{formatDateTime(selectedJob.updatedAt)}</div>
                    </div>
                  </div>

                  {selectedJob.skills?.length > 0 && (
                    <div style={{ marginTop: 'var(--space-3)' }}>
                      <div className="detail-label" style={{ marginBottom: '0.25rem' }}>
                        Skills Required
                      </div>
                      <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                        {selectedJob.skills.map((s, idx) => (
                          <span
                            key={idx}
                            className="status-badge"
                            style={{
                              background: 'var(--color-surface)',
                              color: 'var(--color-text)',
                            }}
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab: Proof of Completion */}
            {reviewTab === 'proof' && (
              <div className="card">
                <div className="card-header">
                  <h3>Proof of Completion</h3>
                  {selectedJob.talentName && (
                    <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                      Submitted by {selectedJob.talentName}
                    </span>
                  )}
                </div>
                <div className="card-body">
                  {getProofFiles().length > 0 ? (
                    <div>
                      <EvidenceGallery items={getProofFiles()} />
                      {selectedJob.talent?.proofOfCompletion && (
                        <div
                          style={{
                            marginTop: '0.75rem',
                            padding: '0.75rem',
                            background: 'var(--color-surface)',
                            borderRadius: 'var(--radius-md)',
                            fontSize: 13,
                            lineHeight: 1.6,
                            wordBreak: 'break-all',
                          }}
                        >
                          <div className="detail-label" style={{ marginBottom: 4 }}>
                            Raw submission data
                          </div>
                          {selectedJob.talent.proofOfCompletion}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="empty-state" style={{ padding: '2rem' }}>
                      <FileText size={36} />
                      <div className="empty-state-text">No proof of completion submitted</div>
                      <div className="empty-state-sub" style={{ fontSize: 12, marginTop: 4 }}>
                        The talent may not have uploaded files yet.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab: Timeline */}
            {reviewTab === 'timeline' && (
              <div className="card">
                <div className="card-header">
                  <h3>Job Timeline</h3>
                </div>
                <div className="card-body">
                  <CaseTimeline entries={buildTimeline(selectedJob)} />
                </div>
              </div>
            )}

            {/* Tab: Parties */}
            {reviewTab === 'parties' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {/* Client card */}
                <div className="card">
                  <div className="card-header">
                    <h3>
                      <User size={14} /> Client
                    </h3>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => navigate(`/users/${selectedJob.clientId}`)}
                    >
                      <ExternalLink size={13} /> Profile
                    </button>
                  </div>
                  <div className="card-body">
                    <div className="detail-grid" style={{ gap: 'var(--space-2)' }}>
                      <div className="detail-field">
                        <div className="detail-label">Name</div>
                        <div className="detail-value">
                          {selectedJob.clientInfo?.name || 'Unknown'}
                        </div>
                      </div>
                      <div className="detail-field">
                        <div className="detail-label">Email</div>
                        <div className="detail-value">
                          {selectedJob.clientInfo?.email || 'N/A'}
                        </div>
                      </div>
                      <div className="detail-field">
                        <div className="detail-label">Phone</div>
                        <div className="detail-value">
                          {selectedJob.clientInfo?.phone || 'N/A'}
                        </div>
                      </div>
                      <div className="detail-field">
                        <div className="detail-label">Location</div>
                        <div className="detail-value">
                          {selectedJob.clientInfo?.location || 'N/A'}
                        </div>
                      </div>
                      {selectedJob.clientInfo?.rating > 0 && (
                        <div className="detail-field">
                          <div className="detail-label">Rating</div>
                          <div className="detail-value">
                            {selectedJob.clientInfo.rating}/5
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Talent card */}
                <div className="card">
                  <div className="card-header">
                    <h3>
                      <Briefcase size={14} /> Talent/Contractor
                    </h3>
                    {selectedJob.talent?.talentId && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() =>
                          navigate(`/users/${selectedJob.talent.talentId}`)
                        }
                      >
                        <ExternalLink size={13} /> Profile
                      </button>
                    )}
                  </div>
                  <div className="card-body">
                    {selectedJob.talent ? (
                      <div className="detail-grid" style={{ gap: 'var(--space-2)' }}>
                        <div className="detail-field">
                          <div className="detail-label">Name</div>
                          <div className="detail-value">
                            {selectedJob.talentName || 'Unknown'}
                          </div>
                        </div>
                        <div className="detail-field">
                          <div className="detail-label">Email</div>
                          <div className="detail-value">
                            {selectedJob.talent?.email || 'N/A'}
                          </div>
                        </div>
                        <div className="detail-field">
                          <div className="detail-label">Phone</div>
                          <div className="detail-value">
                            {selectedJob.talent?.phone || 'N/A'}
                          </div>
                        </div>
                        <div className="detail-field">
                          <div className="detail-label">Location</div>
                          <div className="detail-value">
                            {selectedJob.talent?.location || 'N/A'}
                          </div>
                        </div>
                        <div className="detail-field">
                          <div className="detail-label">Agreed Price</div>
                          <div className="detail-value">
                            {formatCurrency(selectedJob.talent?.agreedPrice || 0)}
                          </div>
                        </div>
                        {selectedJob.talent?.rating > 0 && (
                          <div className="detail-field">
                            <div className="detail-label">Rating</div>
                            <div className="detail-value">
                              {selectedJob.talent.rating}/5
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="empty-state" style={{ padding: '1rem' }}>
                        <div className="empty-state-text">No talent assigned</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </DetailPanel>

      {/* Action Confirmation Modal */}
      {actionModal && (
        <div
          className="modal-overlay"
          onClick={() => {
            if (!processing) {
              setActionModal(null);
              setAdminNote('');
            }
          }}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3>
                {actionModal.action === 'approve'
                  ? 'Approve & Release Payment'
                  : 'Reject & Flag for Investigation'}
              </h3>
              <button
                className="modal-close"
                onClick={() => {
                  if (!processing) {
                    setActionModal(null);
                    setAdminNote('');
                  }
                }}
                disabled={processing}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              {actionModal.action === 'approve' ? (
                <div
                  style={{
                    padding: '0.75rem',
                    background: 'var(--color-success-subtle, #dcfce7)',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: '1rem',
                    border: '1px solid var(--color-success)',
                    color: 'var(--color-success)',
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  <CheckCircle size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                  <strong>Approve this job?</strong>
                  <br />
                  Payment of {formatCurrency(actionModal.job.talent?.agreedPrice || 0)} will be released to{' '}
                  {actionModal.job.talentName || 'the talent'} and the job will be
                  marked as finished.
                </div>
              ) : (
                <div
                  style={{
                    padding: '0.75rem',
                    background: 'var(--color-error-subtle, #fee2e2)',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: '1rem',
                    border: '1px solid var(--color-error)',
                    color: 'var(--color-error)',
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  <XCircle size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                  <strong>Reject this job?</strong>
                  <br />
                  The job will be flagged for investigation. Both the client and talent will be
                  notified. No payment will be released.
                </div>
              )}

              <div className="form-group">
                <label className="form-label">
                  Admin Note <span style={{ color: 'var(--color-error)' }}>*</span>
                </label>
                <textarea
                  className="form-textarea"
                  rows={4}
                  placeholder={
                    actionModal.action === 'approve'
                      ? 'Explain why this job is being approved and payment released...'
                      : 'Describe the issue and next steps for investigation...'
                  }
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  style={{ width: '100%' }}
                  disabled={processing}
                  autoFocus
                />
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--color-text-muted)',
                    marginTop: 4,
                    textAlign: 'right',
                  }}
                >
                  {adminNote.length} characters
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-outline"
                onClick={() => {
                  setActionModal(null);
                  setAdminNote('');
                }}
                disabled={processing}
              >
                Cancel
              </button>
              <button
                className={`btn ${actionModal.action === 'approve' ? 'btn-success' : 'btn-danger'}`}
                onClick={handleResolve}
                disabled={!adminNote.trim() || processing}
              >
                {processing ? (
                  <>
                    <div
                      className="page-loading__spinner"
                      style={{
                        width: 14,
                        height: 14,
                        borderWidth: 2,
                        display: 'inline-block',
                        marginRight: 6,
                        verticalAlign: 'middle',
                      }}
                    />
                    Processing...
                  </>
                ) : actionModal.action === 'approve' ? (
                  <>
                    <CheckCircle size={15} /> Approve & Release Payment
                  </>
                ) : (
                  <>
                    <XCircle size={15} /> Reject & Investigate
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
