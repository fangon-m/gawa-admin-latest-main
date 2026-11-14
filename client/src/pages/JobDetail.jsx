import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { usePermissions } from '../utils/permissions';
import { useApiData, useMutation } from '../utils/useApiData';
import { getById as getJobById, flag as flagJob, remove as removeJob } from '../api/jobs';
import * as entityNotesApi from '../api/entityNotes';
import * as flagsApi from '../api/flags';
import { formatDate, formatCurrency, formatPreferredStart, userEntityPath, jobEntityPath } from '../utils/helpers';
import Header from '../components/layout/Header';
import Tabs from '../components/common/Tabs';
import StatusBadge from '../components/common/StatusBadge';
import NotesPanel from '../components/common/NotesPanel';
import EvidenceGallery from '../components/common/EvidenceGallery';
import CaseTimeline from '../components/common/CaseTimeline';
import { Check, MapPin } from 'lucide-react';

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { can } = usePermissions(currentUser?.role);
  const { addNotification } = useNotifications();
  const [activeTab, setActiveTab] = useState('matches');
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [flagReason, setFlagReason] = useState('');
  const [flagSubmitting, setFlagSubmitting] = useState(false);
  const [flagError, setFlagError] = useState('');
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [removeConfirmText, setRemoveConfirmText] = useState('');
  const [removeSubmitting, setRemoveSubmitting] = useState(false);
  const [flagActionModal, setFlagActionModal] = useState(null); // { flag, action: 'dismiss'|'resolve'|'remove' }
  const [flagActionNote, setFlagActionNote] = useState('');
  const [flagActionSubmitting, setFlagActionSubmitting] = useState(false);
  const [flagActionError, setFlagActionError] = useState('');
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

  const { data: job, loading, error, refetch } = useApiData(() => getJobById(id), [id], {
    defaultValue: null,
    transform: (r) => r?.data ?? r,
  });

  // The route carries the friendly ID (JOB-123456); every data call needs the
  // real job id returned by the API.
  const jobId = job?.jobPostId || id;

  const { data: jobNotes, refetch: refetchJobNotes } = useApiData(
    () => entityNotesApi.list('job_posts', jobId).catch(() => []),
    [jobId],
    { defaultValue: [], transform: (r) => r?.data ?? r ?? [] }
  );

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
  const visibleFlags = (job.flags || []).filter((flag) => flag.status !== 'dismissed');

  const paymentMethods = (() => {
    const raw = job.paymentMethod;
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return list.length
      ? list.map((method) => String(method).replace(/_/g, ' ')).join(', ')
      : 'Not specified';
  })();

  const hasCoordinates = job.jobLatitude != null && job.jobLongitude != null
    && !Number.isNaN(Number(job.jobLatitude)) && !Number.isNaN(Number(job.jobLongitude));
  const mapUrl = hasCoordinates
    ? `https://www.google.com/maps?q=${job.jobLatitude},${job.jobLongitude}`
    : null;

  const proofItems = (completion) => {
    const raw = completion.supportingImagesUrl;
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return list.map((item, idx) => (
      typeof item === 'string' ? { url: item, label: `Completion Image ${idx + 1}` } : item
    ));
  };

  const buildJobTimeline = () => {
    const entries = [];
    if (job.createdAt) {
      entries.push({
        date: job.createdAt,
        title: 'Job Posted',
        description: `Job "${job.jobTitle}" was created`,
        completed: true,
      });
    }
    if (acceptedMatch) {
      const matchedAt = acceptedMatch.matchedAt || acceptedMatch.createdAt;
      if (matchedAt) {
        entries.push({
          date: matchedAt,
          title: 'Match Accepted',
          description: `${acceptedMatch.userName} was hired${acceptedMatch.agreedPrice != null ? ` for ${formatCurrency(acceptedMatch.agreedPrice)}` : ''}`,
          completed: true,
        });
      }
    }
    if (job.checkIn?.checkedInAt) {
      entries.push({
        date: job.checkIn.checkedInAt,
        title: 'Checked In',
        description: 'Talent checked in at the job location',
        completed: true,
      });
    }
    completions.forEach((completion) => {
      const requestedAt = completion.requestedAt || completion.createdAt;
      if (requestedAt) {
        entries.push({
          date: requestedAt,
          title: 'Completion Requested',
          description: completion.talentName
            ? `${completion.talentName} submitted proof of completion`
            : 'Proof of completion submitted',
          completed: true,
        });
      }
      if (completion.confirmedAt) {
        entries.push({
          date: completion.confirmedAt,
          title: 'Completion Confirmed',
          description: 'Client confirmed the work was completed',
          completed: true,
        });
      } else if (requestedAt) {
        entries.push({
          date: requestedAt,
          title: 'Completion Confirmed',
          description: 'Awaiting client confirmation',
          completed: false,
        });
      }
    });
    if (['completed', 'closed'].includes(job.jobStatus) && job.updatedAt) {
      entries.push({
        date: job.updatedAt,
        title: 'Job Completed',
        description: 'Job post was completed and closed',
        completed: true,
      });
    }
    return entries
      .filter((entry) => entry.date)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  };

  const closeFlagAction = () => {
    if (flagActionSubmitting) return;
    setFlagActionModal(null);
    setFlagActionNote('');
    setFlagActionError('');
  };

  const handleFlagSubmit = async (e) => {
    e.preventDefault();
    const reason = flagReason.trim();
    if (!reason || flagSubmitting) return;
    setFlagSubmitting(true);
    setFlagError('');
    try {
      await flagJob(jobId, { reason });
      setShowFlagModal(false);
      setFlagReason('');
      addNotification('moderation_decision', 'Job Flagged', `Job "${job.jobTitle}" was flagged for review`, jobEntityPath(jobId));
      refetch();
    } catch (err) {
      setFlagError(err?.error || err?.message || 'Failed to flag job post');
    } finally {
      setFlagSubmitting(false);
    }
  };

  const handleRemoveJob = async () => {
    if (removeConfirmText !== job?.jobTitle || removeSubmitting) return;
    setRemoveSubmitting(true);
    try {
      await removeJob(jobId);
      setShowRemoveModal(false);
      setRemoveConfirmText('');
      addNotification('moderation_decision', 'Job Removed', `Job "${job.jobTitle}" was removed`, '/jobs');
      navigate('/jobs');
    } catch (err) {
      console.error('Job remove failed:', err);
    } finally {
      setRemoveSubmitting(false);
    }
  };

  const handleFlagAction = async (e) => {
    e.preventDefault();
    if (!flagActionModal || flagActionSubmitting) return;
    const { flag, action } = flagActionModal;
    const note = flagActionNote.trim();
    setFlagActionSubmitting(true);
    setFlagActionError('');
    try {
      if (action === 'remove') {
        if (!can('removeJob')) throw new Error('You do not have permission to remove job posts');
        await removeJob(jobId);
        try {
          await flagsApi.resolve(flag.flagId, { note: note || 'Content removed by admin' });
        } catch {
          // The content is already removed; don't block the outcome on the flag update.
        }
        setFlagActionModal(null);
        setFlagActionNote('');
        addNotification('moderation_decision', 'Job Removed', `Flagged job "${job.jobTitle}" was removed`, '/jobs');
        navigate('/jobs');
        return;
      }

      if (action === 'dismiss') await flagsApi.dismiss(flag.flagId, { note });
      else await flagsApi.resolve(flag.flagId, { note });

      setFlagActionModal(null);
      setFlagActionNote('');
      addNotification('moderation_decision', 'Flag Updated', `A flag on "${job.jobTitle}" was ${action}ed`, jobEntityPath(jobId));
      refetch();
    } catch (err) {
      setFlagActionError(err?.error || err?.message || 'Failed to update flag');
    } finally {
      setFlagActionSubmitting(false);
    }
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
                {job.serviceType && <span>{job.serviceType}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.375rem' }}>
              {can('flagJob') && <button className="btn btn-outline btn-sm" onClick={() => { setFlagReason(''); setFlagError(''); setShowFlagModal(true); }}>Flag</button>}
              {can('removeJob') && <button className="btn btn-danger btn-sm" onClick={() => { setRemoveConfirmText(''); setShowRemoveModal(true); }}>Remove</button>}
              <button className="btn btn-accent btn-sm" onClick={() => navigate('/messages')}>Message</button>
            </div>
          </div>

          <div className="detail-grid" style={{ gap: 'var(--space-3)' }}>
            <div className="detail-field"><div className="detail-label">Status</div><div className="detail-value" style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', flexWrap: 'wrap' }}><StatusBadge status={job.jobStatus} />{(job.openFlagCount || 0) > 0 && <StatusBadge status="flagged" label={`Flagged (${job.openFlagCount} open)`} />}</div></div>
            <div className="detail-field"><div className="detail-label">Hiring Option</div><div className="detail-value" style={{ textTransform: 'capitalize' }}>{job.hiringOption?.replace(/_/g, ' ') || 'Not specified'}</div></div>
            <div className="detail-field"><div className="detail-label">Budget</div><div className="detail-value">{job.budget != null ? formatCurrency(job.budget) : 'Not set'}</div></div>
            <div className="detail-field"><div className="detail-label">Preferred Start</div><div className="detail-value">{formatPreferredStart(job.preferredStartTime)}</div></div>
            <div className="detail-field"><div className="detail-label">Service Type</div><div className="detail-value">{job.serviceType || 'Not specified'}</div></div>
            <div className="detail-field"><div className="detail-label">Client</div><div className="detail-value">
              {job.clientId
                ? <span className="cell-link" onClick={() => navigate(userEntityPath(job.clientId))}>{job.clientName}</span>
                : job.clientName || 'Unknown'}
            </div></div>
            <div className="detail-field"><div className="detail-label">Location</div><div className="detail-value">
              {job.jobAddress ? (
                mapUrl ? (
                  <a href={mapUrl} target="_blank" rel="noreferrer" className="cell-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <MapPin size={14} />{job.jobAddress}
                  </a>
                ) : job.jobAddress
              ) : 'Not specified'}
            </div></div>
            <div className="detail-field"><div className="detail-label">Payment Methods</div><div className="detail-value" style={{ textTransform: 'capitalize' }}>{paymentMethods}</div></div>
            <div className="detail-field"><div className="detail-label">Matches</div><div className="detail-value">{job.matchCount || 0}</div></div>
            <div className="detail-field"><div className="detail-label">Created</div><div className="detail-value">{formatDate(job.createdAt)}</div></div>
            <div className="detail-field"><div className="detail-label">Last Updated</div><div className="detail-value">{job.updatedAt ? formatDate(job.updatedAt) : '—'}</div></div>
            <div className="detail-field"><div className="detail-label">Moderation</div><div className="detail-value">{(job.openFlagCount || 0) > 0 ? <span style={{ color: 'var(--color-error)', fontWeight: 600 }}>{job.openFlagCount} open flag{job.openFlagCount === 1 ? '' : 's'}</span> : 'No open flags'}</div></div>
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
          {job.jobTrades?.length > 0 && (
            <div style={{ marginTop: '0.5rem' }}>
              <div className="detail-label" style={{ marginBottom: '0.25rem' }}>Job Trades</div>
              <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                {job.jobTrades.map((trade, idx) => <span key={idx} className="status-badge" style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}>{trade}</span>)}
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

          {visibleFlags.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <div className="detail-label" style={{ marginBottom: '0.5rem' }}>Flags</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {visibleFlags.map((flag) => {
                  const isOpen = !flag.status || flag.status === 'open';
                  return (
                    <div key={flag.flagId || flag.id} style={{ padding: '0.75rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: isOpen ? 'var(--color-error-subtle, #fef2f2)' : 'var(--color-surface)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: 4 }}>
                        <StatusBadge status={isOpen ? 'flagged' : flag.status} label={isOpen ? 'Open' : flag.status} />
                        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{formatDate(flag.createdAt)}</span>
                      </div>
                      <div style={{ fontSize: 13, marginBottom: 4 }}><strong>Reason:</strong> {flag.reason || 'No reason provided'}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        {flag.flaggedByName && <span>Flagged by {flag.flaggedByName}</span>}
                        {!isOpen && flag.resolvedAt && <span>{flag.status === 'dismissed' ? 'Dismissed' : 'Resolved'} {formatDate(flag.resolvedAt)}{flag.resolvedByName ? ` by ${flag.resolvedByName}` : ''}</span>}
                      </div>
                      {flag.resolutionNote && <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}><strong>Note:</strong> {flag.resolutionNote}</div>}
                      {isOpen && (
                        <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                          <button className="btn btn-outline btn-sm" onClick={() => { setFlagActionError(''); setFlagActionNote(''); setFlagActionModal({ flag, action: 'dismiss' }); }}>Dismiss</button>
                          <button className="btn btn-accent btn-sm" onClick={() => { setFlagActionError(''); setFlagActionNote(''); setFlagActionModal({ flag, action: 'resolve' }); }}>Resolve</button>
                          {can('removeJob') && <button className="btn btn-danger btn-sm" onClick={() => { setFlagActionError(''); setFlagActionNote(''); setFlagActionModal({ flag, action: 'remove' }); }}>Remove content</button>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
                            onClick={(e) => { e.stopPropagation(); navigate(userEntityPath(acceptedMatch.userId)); }}
                          >
                            {acceptedMatch.userName}
                          </strong>
                          {' '}- {formatCurrency(acceptedMatch.agreedPrice)}
                        </span>
                        <StatusBadge status={acceptedMatch.status} />
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                        GP Used: {acceptedMatch.gpUsed ?? '—'}
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
                            onClick={(e) => { e.stopPropagation(); navigate(userEntityPath(m.userId)); }}
                          >
                            {m.userName}
                          </span>
                          <span style={{ fontSize: 13 }}>{formatCurrency(m.agreedPrice)}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                          <span>GP Used: {m.gpUsed ?? '—'}</span>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <div className="card">
                  <div className="card-header"><h3>Job Timeline</h3></div>
                  <div className="card-body">
                    <CaseTimeline entries={buildJobTimeline()} />
                  </div>
                </div>
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
                      completions.map((c) => {
                        const proofs = proofItems(c);
                        return (
                          <div key={c.jobCompletionId || c.id} style={{ padding: '0.75rem', borderBottom: '1px solid var(--color-divider)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ fontSize: 13, fontWeight: 600 }}>{c.message || 'Completion request'}</span>
                              <StatusBadge status={c.confirmedAt ? 'completed' : 'pending'} label={c.confirmedAt ? 'Confirmed' : 'Pending'} />
                            </div>
                            {proofs.length > 0 && (
                              <div style={{ marginTop: '0.5rem' }}>
                                <EvidenceGallery items={proofs} />
                              </div>
                            )}
                            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2, display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                              {c.talentName && <span>Submitted by {c.talentName}</span>}
                              {c.matchStatus && <StatusBadge status={c.matchStatus} />}
                              <span>Requested: {c.requestedAt ? formatDate(c.requestedAt) : '—'}</span>
                              {c.confirmedAt && <span>Confirmed: {formatDate(c.confirmedAt)}</span>}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
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
                  await doAddNote('job_posts', jobId, note.text);
                  addNotification('moderation_decision', 'Note Added on Job', `Note added to job "${job.jobTitle}"`, jobEntityPath(jobId));
                  refetchJobNotes();
                } catch (err) { console.error('Add note failed:', err); }
              }}
            />
          </div>
        </div>
      </div>

      {showFlagModal && (
        <div className="modal-overlay" onClick={() => !flagSubmitting && setShowFlagModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleFlagSubmit}>
              <div className="modal-header">
                <h3>Flag Job Post</h3>
                <button type="button" className="modal-close" onClick={() => !flagSubmitting && setShowFlagModal(false)}>×</button>
              </div>
              <div className="modal-body">
                <p style={{ color: 'var(--color-text-muted)', lineHeight: 1.6, marginBottom: '0.75rem' }}>
                  Flag <strong>{job.jobTitle}</strong> for moderation review. The job’s lifecycle status will not change.
                </p>
                <label className="detail-label" htmlFor="flag-reason" style={{ display: 'block', marginBottom: '0.375rem' }}>Reason</label>
                <textarea
                  id="flag-reason"
                  className="form-input"
                  rows={3}
                  placeholder="Describe why this job post is being flagged"
                  value={flagReason}
                  onChange={(e) => setFlagReason(e.target.value)}
                  disabled={flagSubmitting}
                  autoFocus
                  style={{ width: '100%', resize: 'vertical' }}
                />
                {flagError && <div className="alert alert-error" role="alert" style={{ marginTop: '0.5rem' }}>{flagError}</div>}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowFlagModal(false)} disabled={flagSubmitting}>Cancel</button>
                <button type="submit" className="btn btn-accent" disabled={flagSubmitting || !flagReason.trim()}>
                  {flagSubmitting ? 'Flagging...' : 'Flag for review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showRemoveModal && (
        <div className="modal-overlay" onClick={() => { if (!removeSubmitting) { setShowRemoveModal(false); setRemoveConfirmText(''); } }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Remove Job Post</h3>
              <button type="button" className="modal-close" onClick={() => { if (!removeSubmitting) { setShowRemoveModal(false); setRemoveConfirmText(''); } }}>×</button>
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
                disabled={removeSubmitting}
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
              <button className="btn btn-outline" onClick={() => { setShowRemoveModal(false); setRemoveConfirmText(''); }} disabled={removeSubmitting}>Cancel</button>
              <button
                className="btn btn-danger"
                disabled={removeSubmitting || removeConfirmText !== job?.jobTitle}
                onClick={handleRemoveJob}
              >
                {removeSubmitting ? 'Removing...' : 'Remove Job Post'}
              </button>
            </div>
          </div>
        </div>
      )}

      {flagActionModal && (
        <div className="modal-overlay" onClick={closeFlagAction}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleFlagAction}>
              <div className="modal-header">
                <h3>
                  {flagActionModal.action === 'remove' ? 'Remove Flagged Content'
                    : flagActionModal.action === 'dismiss' ? 'Dismiss Flag' : 'Resolve Flag'}
                </h3>
                <button type="button" className="modal-close" onClick={closeFlagAction}>×</button>
              </div>
              <div className="modal-body">
                {flagActionModal.action === 'remove' ? (
                  <div style={{ padding: '0.75rem', background: 'var(--color-error-subtle, #fee2e2)', borderRadius: 'var(--radius-md)', marginBottom: '1rem', border: '1px solid var(--color-error)', color: 'var(--color-error)' }}>
                    <strong>This will permanently remove the job post.</strong> The flag will be marked resolved as handled.
                  </div>
                ) : (
                  <p style={{ color: 'var(--color-text-muted)', lineHeight: 1.6, marginBottom: '0.75rem' }}>
                    {flagActionModal.action === 'dismiss'
                      ? 'Dismiss this flag as a false positive. The flag record will be kept for audit.'
                      : 'Mark this flag as handled. The flag record will be kept for audit.'}
                  </p>
                )}
                <label className="detail-label" htmlFor="flag-action-note" style={{ display: 'block', marginBottom: '0.375rem' }}>Note (optional)</label>
                <textarea
                  id="flag-action-note"
                  className="form-input"
                  rows={3}
                  placeholder={flagActionModal.action === 'remove' ? 'Optional note (defaults to "Content removed by admin")' : 'Add an optional note'}
                  value={flagActionNote}
                  onChange={(e) => setFlagActionNote(e.target.value)}
                  disabled={flagActionSubmitting}
                  autoFocus
                  style={{ width: '100%', resize: 'vertical' }}
                />
                {flagActionError && <div className="alert alert-error" role="alert" style={{ marginTop: '0.5rem' }}>{flagActionError}</div>}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={closeFlagAction} disabled={flagActionSubmitting}>Cancel</button>
                <button type="submit" className={`btn ${flagActionModal.action === 'remove' ? 'btn-danger' : 'btn-accent'}`} disabled={flagActionSubmitting}>
                  {flagActionSubmitting ? 'Applying...' : flagActionModal.action === 'remove' ? 'Remove job post' : flagActionModal.action === 'dismiss' ? 'Dismiss flag' : 'Resolve flag'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
