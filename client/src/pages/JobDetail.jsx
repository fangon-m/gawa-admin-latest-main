import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { usePermissions } from '../utils/permissions';
import { useApiData, useMutation } from '../utils/useApiData';
import { getById as getJobById, flag as flagJob, remove as removeJob } from '../api/jobs';
import * as entityNotesApi from '../api/entityNotes';
import { formatDate, formatCurrency } from '../utils/helpers';
import Header from '../components/layout/Header';
import Tabs from '../components/common/Tabs';
import StatusBadge from '../components/common/StatusBadge';
import NotesPanel from '../components/common/NotesPanel';
import EvidenceGallery from '../components/common/EvidenceGallery';
import ConfirmModal from '../components/common/ConfirmModal';
import { Check } from 'lucide-react';

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { can } = usePermissions(currentUser?.role);
  const { addNotification } = useNotifications();
  const [activeTab, setActiveTab] = useState('matches');
  const [showConfirm, setShowConfirm] = useState(null);
  const [removeConfirmText, setRemoveConfirmText] = useState('');
  const [doAddNote] = useMutation(entityNotesApi.add);

  // Guard against missing or invalid IDs
  if (!id || id === 'undefined' || id === 'null') {
    return (
      <div>
        <Header title="Job Post Not Found" />
        <div className="empty-state">
          <div className="empty-state-text">Job post not found</div>
          <button className="btn btn-outline mt-4" onClick={() => navigate('/jobs')}>Back to Jobs</button>
        </div>
      </div>
    );
  }

  const { data: jobNotes, refetch: refetchJobNotes } = useApiData(
    () => entityNotesApi.list('job_posts', id).catch(() => []),
    [id],
    { defaultValue: [], transform: (r) => r?.data ?? r ?? [] }
  );

  const { data: job, loading, error, refetch } = useApiData(() => getJobById(id), [id], {
    defaultValue: null,
    transform: (r) => r?.data ?? r,
  });

  if (loading) {
    return (
      <div>
        <Header title="Job Post" />
        <div className="page-loading"><div className="page-loading__spinner" /></div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Header title="Error Loading Job" />
        <div className="empty-state">
          <div className="empty-state-text">Error loading job post: {error}</div>
          <button className="btn btn-outline mt-4" onClick={() => navigate('/jobs')}>Back to Jobs</button>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div>
        <Header title="Job Post Not Found" />
        <div className="empty-state">
          <div className="empty-state-text">Job post not found</div>
          <button className="btn btn-outline mt-4" onClick={() => navigate('/jobs')}>Back to Jobs</button>
        </div>
      </div>
    );
  }

  const matches = job.matches || [];
  const acceptedMatch = matches.find((m) => m.status === 'accepted');
  const completions = job.completions || [];

  const handleAction = async (action) => {
    try {
      if (action === 'flag') await flagJob(id);
      else if (action === 'remove') await removeJob(id);
      setShowConfirm(null);
      refetch();
    } catch (err) { console.error('Job action failed:', err); }
  };

  return (
    <div>
      <Header title={job.jobTitle} />
      <div className="card">
        <div className="card-body" style={{ padding: 'var(--space-3) var(--space-5)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>{job.jobTitle}</h2>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', color: 'var(--color-text-muted)', fontSize: 13, marginTop: 2 }}>
                <span>by {job.clientName}</span>
                <span>{job.hiringOption?.replace(/_/g, ' ')}</span>
                {job.jobAddress && <span>{job.jobAddress}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.375rem' }}>
              {can('flagJob') && <button className="btn btn-outline btn-sm" onClick={() => setShowConfirm('flag')}>Flag</button>}
              {can('removeJob') && <button className="btn btn-danger btn-sm" onClick={() => setShowConfirm('remove')}>Remove</button>}
              <button className="btn btn-accent btn-sm" onClick={() => navigate('/messages')}>Message</button>
            </div>
          </div>

          <div className="detail-grid" style={{ gap: 'var(--space-3)' }}>
            <div className="detail-field"><div className="detail-label">Status</div><div className="detail-value"><StatusBadge status={job.jobStatus} /></div></div>
            <div className="detail-field"><div className="detail-label">Preferred Start</div><div className="detail-value">{job.preferredStartTime ? formatDate(job.preferredStartTime) : 'Not set'}</div></div>
            <div className="detail-field"><div className="detail-label">Matches</div><div className="detail-value">{job.matchCount || 0}</div></div>
            <div className="detail-field"><div className="detail-label">Created</div><div className="detail-value">{formatDate(job.createdAt)}</div></div>
            <div className="detail-field"><div className="detail-label">Flags</div><div className="detail-value">{job.flags?.length > 0 ? <StatusBadge status="flagged" label={job.flags.length} /> : 'None'}</div></div>
            <div className="detail-field"><div className="detail-label">Payment Method</div><div className="detail-value">{job.paymentMethod || 'Not specified'}</div></div>
          </div>
          {job.jobDescription && (
            <div style={{ marginTop: '0.5rem' }}>
              <div className="detail-label" style={{ marginBottom: '0.25rem' }}>Description</div>
              <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-muted)' }}>{job.jobDescription}</p>
            </div>
          )}
          {job.skills?.length > 0 && (
            <div style={{ marginTop: '0.5rem' }}>
              <div className="detail-label" style={{ marginBottom: '0.25rem' }}>Skills Required</div>
              <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                {job.skills.map((s, idx) => <span key={idx} className="status-badge" style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}>{s}</span>)}
              </div>
            </div>
          )}

          {(() => {
            const images = [];
            if (job.supportingImagesUrl?.length) images.push(...job.supportingImagesUrl.map((u) => (typeof u === 'string' ? { url: u, label: 'Job Image' } : u)));
            return images.length > 0 ? (
              <div style={{ marginTop: '0.75rem' }}>
                <div className="detail-label" style={{ marginBottom: '0.375rem' }}>Images</div>
                <EvidenceGallery items={images} />
              </div>
            ) : null;
          })()}
        </div>
      </div>

      <div className="detail-strip" style={{ marginTop: 'var(--space-3)', gap: 'var(--space-3)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Tabs tabs={['matches', 'completions']} activeTab={activeTab} onChange={setActiveTab} />
          <div className="tab-content" style={{ marginTop: 'var(--space-3)' }}>
            {activeTab === 'matches' && (
              <div className="card">
                <div className="card-header">
                  <h3>Matches</h3>
                  {matches.length > 0 && <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{matches.length} total</span>}
                </div>
                <div className="card-body">
                  {acceptedMatch && (
                    <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', outline: '2px solid var(--color-success)', outlineOffset: '-1px' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-success)', marginBottom: 6 }}><Check size={14} /> Accepted Match</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 13 }}>
                          <strong
                            className="cell-link"
                            onClick={(e) => { e.stopPropagation(); navigate(`/users/${acceptedMatch.userId}`); }}
                          >
                            {acceptedMatch.userName}
                          </strong>
                          {' '}- {formatCurrency(acceptedMatch.agreedPrice)}
                        </span>
                        <StatusBadge status={acceptedMatch.status} />
                      </div>
                    </div>
                  )}
                  {matches.length === 0 ? (
                    <div className="empty-state" style={{ padding: 'var(--space-8) var(--space-5)' }}><div className="empty-state-text">No matches yet</div></div>
                  ) : (
                    matches.map((m) => (
                      <div key={m.jobMatchId || m.id} className="proposal-card" style={{ marginBottom: '0.75rem', padding: 'var(--space-4) var(--space-5)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span
                            className="cell-link"
                            style={{ fontWeight: 600, fontSize: 13 }}
                            onClick={(e) => { e.stopPropagation(); navigate(`/users/${m.userId}`); }}
                          >
                            {m.userName}
                          </span>
                          <span style={{ fontSize: 13 }}>{formatCurrency(m.agreedPrice)}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                          <span>Connections: {m.connections || 0}</span>
                          <span><StatusBadge status={m.status} /></span>
                          <span>{formatDate(m.matchedAt)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
            {activeTab === 'completions' && (
              <div className="card">
                <div className="card-header">
                  <h3>Completions</h3>
                  {completions.length > 0 && (
                    <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                      {completions.filter((c) => c.confirmedAt).length}/{completions.length} confirmed
                    </span>
                  )}
                </div>
                <div className="card-body">
                  {completions.length === 0 ? (
                    <div className="empty-state"><div className="empty-state-text">No completions recorded.</div></div>
                  ) : (
                    completions.map((c) => (
                      <div key={c.jobCompletionId || c.id} style={{ padding: '0.75rem', borderBottom: '1px solid var(--color-divider)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{c.message || 'Completion request'}</span>
                          <StatusBadge status={c.confirmedAt ? 'completed' : 'pending'} label={c.confirmedAt ? 'Confirmed' : 'Pending'} />
                        </div>
                        {c.supportingImagesUrl && (
                          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                            <a href={c.supportingImagesUrl} target="_blank" rel="noreferrer">View attachment</a>
                          </div>
                        )}
                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                          Requested: {formatDate(c.requestedAt)}
                          {c.confirmedAt && <> · Confirmed: {formatDate(c.confirmedAt)}</>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card" style={{ width: 280, flexShrink: 0 }}>
          <div className="card-header"><h3>Admin Notes</h3></div>
          <div className="card-body" style={{ padding: 'var(--space-3) var(--space-4)' }}>
            <NotesPanel
              notes={jobNotes}
              onAddNote={async (note) => {
                try {
                  await doAddNote('job_posts', id, note.text);
                  addNotification('moderation_decision', 'Note Added on Job', `Note added to job "${job.jobTitle}"`, `/jobs/${id}`);
                  refetchJobNotes();
                } catch (err) { console.error('Add note failed:', err); }
              }}
            />
          </div>
        </div>
      </div>

      {showConfirm === 'remove' ? (
        <div className="modal-overlay" onClick={() => { setShowConfirm(null); setRemoveConfirmText(''); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Remove Job Post</h3>
              <button className="modal-close" onClick={() => { setShowConfirm(null); setRemoveConfirmText(''); }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="modal-body">
              <div style={{ padding: '0.75rem', background: 'var(--color-error-subtle, #fee2e2)', borderRadius: 'var(--radius-md)', marginBottom: '1rem', border: '1px solid var(--color-error)', color: 'var(--color-error)' }}>
                <strong>This action cannot be undone.</strong> The job post and all its matches will be removed.
              </div>
              <p style={{ color: 'var(--color-text-muted)', lineHeight: 1.6, marginBottom: '0.75rem' }}>
                To confirm, type the job title <strong>"{job.jobTitle}"</strong> below:
              </p>
              <input
                type="text"
                className="form-input"
                placeholder={`Type "${job.jobTitle}" to confirm`}
                value={removeConfirmText}
                onChange={(e) => setRemoveConfirmText(e.target.value)}
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
              <button className="btn btn-outline" onClick={() => { setShowConfirm(null); setRemoveConfirmText(''); }}>Cancel</button>
              <button
                className="btn btn-danger"
                disabled={removeConfirmText !== job?.jobTitle}
                onClick={() => {
                  if (removeConfirmText === job?.jobTitle) {
                    handleAction('remove');
                    setRemoveConfirmText('');
                  }
                }}
              >
                Remove Job Post
              </button>
            </div>
          </div>
        </div>
      ) : (
        <ConfirmModal
          open={!!showConfirm}
          title="Flag Job Post"
          message="Flag this job post for review?"
          confirmLabel="Flag"
          variant="warning"
          onConfirm={() => handleAction('flag')}
          onCancel={() => setShowConfirm(null)}
        />
      )}
    </div>
  );
}
