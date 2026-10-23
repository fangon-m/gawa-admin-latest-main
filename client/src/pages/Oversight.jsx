import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { usePermissions } from '../utils/permissions';
import { useApiData } from '../utils/useApiData';
import { list as listReports, getActions as getReportActions, executeAction as executeReportAction } from '../api/reports';
import { list as listReviews } from '../api/reviews';
import { formatDate, formatDateTime, formatEntityIdNumeric, timeAgo } from '../utils/helpers';
import Header from '../components/layout/Header';
import Tabs from '../components/common/Tabs';
import FilterBar from '../components/common/FilterBar';
import DataTable from '../components/common/DataTable';
import StatusBadge from '../components/common/StatusBadge';
import DetailPanel from '../components/common/DetailPanel';
import { Star, X } from 'lucide-react';

const oversightTabs = [
  { key: 'issue-reports', label: 'Issue Reports' },
  { key: 'reviews', label: 'Reviews' },
];

const issueReportFilters = [
  { key: 'status', label: 'Status', placeholder: 'All Statuses', options: [
    { value: 'open', label: 'Open' },
    { value: 'under_review', label: 'Under Review' },
    { value: 'resolved', label: 'Resolved' },
    { value: 'dismissed', label: 'Dismissed' },
  ]},
];

const issueReportColumns = [
  { key: 'reporterName', label: 'Reporter' },
  { key: 'reportedName', label: 'Reported User', render: (row) => row.reportedName || '—' },
  { key: 'targetType', label: 'Target Type', render: (row) => <StatusBadge status={row.targetType} /> },
  { key: 'targetId', label: 'Target ID', render: (row) => (
    <span className="text-xs text-muted font-mono" title={row.targetId}>
      {row.targetType === 'profile' ? formatEntityIdNumeric(row.targetId, 'USR-') : row.targetId}
    </span>
  ) },
  { key: 'issueType', label: 'Issue Type' },
  { key: 'comment', label: 'Comment', render: (row) => <span className="truncate" style={{ maxWidth: 260, display: 'inline-block' }}>{row.comment}</span> },
  { key: 'attachmentPaths', label: 'Attachments', render: (row) => row.attachmentPaths?.length || 0 },
  { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
  { key: 'createdAt', label: 'Filed', render: (row) => timeAgo(row.createdAt) },
];

const issueReportActionLabels = {
  mark_irrelevant: 'Mark as irrelevant',
  resolve_target_unavailable: 'Resolve — target unavailable',
  relist: 'Relist job',
  flag_job_match: 'Flag job match',
  warn: 'Warn user',
  suspend: 'Suspend profile',
};

const issueReportActionErrors = {
  TARGET_DELETED: 'The target no longer exists. Refresh the report before trying again.',
  TARGET_STILL_EXISTS: 'The target is available again. Refresh the report to load its actions.',
  TARGET_CHANGED: 'The target changed while this report was open. Review the latest state and try again.',
  REPORT_ALREADY_HANDLED: 'This report has already been handled.',
  IDEMPOTENCY_CONFLICT: 'This action key was already used for a different request. Start a new action.',
  ACTION_NOT_ALLOWED_FOR_TARGET: "This action is not available for the target's current type or state.",
  ALREADY_FLAGGED: 'This job match has already been flagged.',
  ACTION_FORBIDDEN: 'Your role is not allowed to perform this action.',
  INVALID_TARGET_VERSION: 'The target version is invalid. Refresh the report before trying again.',
  INVALID_ACTION_INPUT: 'Review the action details and try again.',
  RATE_LIMITED: 'Too many moderation actions were attempted. Wait before trying again.',
  ACTION_FAILED: 'The action could not be completed. No success was recorded.',
  WARNING_MESSAGE_FAILED: 'The warning was recorded, but the chat message could not be sent. Retry with the same message, or send it manually from Messages.',
  INVALID_MESSAGE_RECIPIENT: 'The reported account could not be opened as a chat recipient. Verify the account ID and try again.',
  WARNING_RECIPIENT_UNAVAILABLE: 'The reported user could not be verified. No warning was sent; refresh the report and try again.',
  REPORT_ACTIONS_UNAVAILABLE: 'Permitted actions could not be loaded. Refresh the report or contact an administrator.',
};

const issueReportActionUnavailableReasons = {
  SUSPENSION_STORAGE_UNAVAILABLE: 'Suspension is disabled because the user_suspensions table is not installed.',
};

const reviewColumns = [
  { key: 'id', label: 'ID', render: (row) => <span className="text-xs text-muted font-mono">{row.id}</span> },
  { key: 'reviewerName', label: 'Reviewer' },
  { key: 'revieweeName', label: 'Reviewee' },
  { key: 'rating', label: 'Rating', render: (row) => (
    <div className="flex items-center gap-0" style={{ whiteSpace: 'nowrap' }}>
      {Array.from({length: row.rating || 0}, (_, i) => <Star key={`f-${i}`} size={13} fill="var(--color-warning)" color="var(--color-warning)" />)}
      {Array.from({length: 5 - (row.rating || 0)}, (_, i) => <Star key={`e-${i}`} size={13} color="var(--color-border)" />)}
    </div>
  )},
  { key: 'comment', label: 'Content', render: (row) => <span className="truncate" style={{ maxWidth: 250, display: 'inline-block' }}>{row.comment}</span> },
  { key: 'createdAt', label: 'Date', render: (row) => formatDate(row.createdAt) },
];

export default function Oversight() {
  const { user: currentUser } = useAuth();
  usePermissions(currentUser?.role);
  const { addNotification } = useNotifications();
  const [tab, setTab] = useState('issue-reports');
  const [reportFilter, setReportFilter] = useState({ status: '' });
  const [selectedReport, setSelectedReport] = useState(null);
  const [selectedReview, setSelectedReview] = useState(null);
  const [reportActions, setReportActions] = useState([]);
  const [reportActionTarget, setReportActionTarget] = useState(null);
  const [reportActionsLoading, setReportActionsLoading] = useState(false);
  const [reportActionsError, setReportActionsError] = useState('');
  const [reportActionPrompt, setReportActionPrompt] = useState(null);
  const [reportActionReason, setReportActionReason] = useState('');
  const [reportActionMessage, setReportActionMessage] = useState('');
  const [reportActionDuration, setReportActionDuration] = useState(7);
  const [reportActionCustom, setReportActionCustom] = useState('');
  const [reportActionSubmitting, setReportActionSubmitting] = useState(false);
  const [reportActionDeliveryPending, setReportActionDeliveryPending] = useState(false);
  const [reportActionError, setReportActionError] = useState('');
  const [reportActionIdempotencyKey, setReportActionIdempotencyKey] = useState('');
  const reportActionButtonRef = useRef(null);

  const { data: allReports, loading: reportsLoading, error: reportsError, refetch: refetchReports } = useApiData(() => listReports({ limit: 100 }), [], {
    defaultValue: [], transform: (r) => r?.data ?? r ?? [],
  });
  const { data: reviews } = useApiData(() => listReviews({ limit: 100 }), [], {
    defaultValue: [], transform: (r) => r?.data ?? r ?? [],
  });

  useEffect(() => {
    if (!selectedReport) {
      setReportActions([]);
      setReportActionTarget(null);
      setReportActionsError('');
      return undefined;
    }

    let current = true;
    setReportActionsLoading(true);
    setReportActions([]);
    setReportActionTarget(null);
    setReportActionsError('');
    setReportActionPrompt(null);
    setReportActionReason('');
    setReportActionMessage('');
    setReportActionDeliveryPending(false);
    setReportActionIdempotencyKey('');
    getReportActions(selectedReport.id)
      .then((result) => {
        if (!current) return;
        setReportActions(result.actions || []);
        setReportActionTarget(result.target || null);
      })
      .catch((error) => {
        if (!current) return;
        setReportActions([]);
        setReportActionsError(issueReportActionErrors[error?.error] || 'Unable to load permitted actions.');
      })
      .finally(() => {
        if (current) setReportActionsLoading(false);
      });

    return () => { current = false; };
  }, [selectedReport?.id]);

  useEffect(() => {
    if (reportActionPrompt) return undefined;
    reportActionButtonRef.current?.focus();
    return undefined;
  }, [reportActionPrompt]);

  useEffect(() => {
    if (!reportActionPrompt) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !reportActionSubmitting) {
        setReportActionPrompt(null);
        setReportActionReason('');
        setReportActionMessage('');
        setReportActionError('');
        setReportActionIdempotencyKey('');
        setReportActionDeliveryPending(false);
        setReportActionDuration(7);
        setReportActionCustom('');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [reportActionPrompt, reportActionSubmitting]);

  const closeReportActionPrompt = () => {
    if (reportActionSubmitting) return;
    setReportActionPrompt(null);
    setReportActionReason('');
    setReportActionMessage('');
    setReportActionError('');
    setReportActionIdempotencyKey('');
    setReportActionDeliveryPending(false);
    setReportActionDuration(7);
    setReportActionCustom('');
  };

  const submitReportAction = async (event) => {
    event.preventDefault();
    if (
      !reportActionPrompt
      || reportActionSubmitting
      || (reportActionPrompt.id !== 'warn' && !reportActionReason.trim())
      || (reportActionPrompt.id === 'warn' && !reportActionMessage.trim())
    ) return;

    const idempotencyKey = reportActionIdempotencyKey || crypto.randomUUID();
    setReportActionIdempotencyKey(idempotencyKey);
    setReportActionSubmitting(true);
    setReportActionError('');
    const actionPrompt = reportActionPrompt;
    let result;
    try {
      const payload = {};
      if (actionPrompt.id === 'warn') {
        payload.messageText = reportActionMessage.trim();
      } else {
        payload.reason = reportActionReason.trim();
      }
      if (actionPrompt.id === 'suspend') {
        payload.durationDays =
          reportActionDuration === 'custom'
            ? Math.max(1, Math.min(90, Number(reportActionCustom) || 7))
            : reportActionDuration;
      }

      result = await executeReportAction(
        selectedReport.id,
        actionPrompt.id,
        payload,
        idempotencyKey,
        reportActionTarget?.version || null
      );
    } catch (error) {
      const errorCode = error?.error;
      setReportActionError(issueReportActionErrors[errorCode] || 'The action failed. Please try again.');
      setReportActionDeliveryPending(error?.warningRecorded === true);
      setReportActionSubmitting(false);
      if (error?.status === 409) {
        getReportActions(selectedReport.id).then((latestActions) => {
          setReportActions(latestActions.actions || []);
          setReportActionTarget(latestActions.target || null);
          setReportActionsError('');
        }).catch(() => {
          setReportActionsError('The report changed and available actions could not be refreshed.');
        });
      }
      return;
    }

    setReportActionSubmitting(false);
    setSelectedReport(report => ({ ...report, status: result.reportStatus || report.status }));
    setReportActionPrompt(null);
    setReportActionReason('');
    setReportActionMessage('');
    setReportActionDeliveryPending(false);
    setReportActionIdempotencyKey('');
    addNotification(
      'moderation_decision',
      'Issue Report Action Recorded',
      `${issueReportActionLabels[actionPrompt.id]} — ${selectedReport.issueType}`,
      '/oversight'
    );
    refetchReports();
    getReportActions(selectedReport.id)
      .then((latestActions) => {
        setReportActions(latestActions.actions || []);
        setReportActionTarget(latestActions.target || null);
        setReportActionsError('');
      })
      .catch(() => {
        setReportActionsError('Action completed, but the available actions could not be refreshed.');
      });
  };

  const filteredReports = useMemo(() => {
    if (!reportFilter.status) return allReports;
    return allReports.filter(report => report.status === reportFilter.status);
  }, [allReports, reportFilter.status]);

  const renderReviews = () => (
    <div className="card">
      <div className="card-body p-0">
        <DataTable
          columns={reviewColumns}
          data={reviews || []}
          onRowClick={(row) => setSelectedReview(row)}
          pageSize={10}
          emptyMessage="No reviews found."
        />
      </div>
      <DetailPanel open={!!selectedReview} onClose={() => setSelectedReview(null)} title="Review Details">
        {selectedReview && (
          <div>
            <div className="detail-panel-section">
              <h4>Details</h4>
              <div className="detail-field"><div className="detail-label">ID</div><div className="detail-value">{selectedReview.id}</div></div>
              {selectedReview.reviewerName && <div className="detail-field"><div className="detail-label">Reviewer</div><div className="detail-value">{selectedReview.reviewerName}</div></div>}
              {selectedReview.revieweeName && <div className="detail-field"><div className="detail-label">Reviewee</div><div className="detail-value">{selectedReview.revieweeName}</div></div>}
              {selectedReview.jobCompletionId && <div className="detail-field"><div className="detail-label">Job Completion</div><div className="detail-value">{selectedReview.jobCompletionId}</div></div>}
              {selectedReview.comment && <div className="detail-field"><div className="detail-label">Comment</div><div className="detail-value">{selectedReview.comment}</div></div>}
              {selectedReview.rating && (
                <div className="detail-field">
                  <div className="detail-label">Rating</div>
                  <div className="detail-value flex items-center gap-0" style={{ whiteSpace: 'nowrap' }}>
                    {Array.from({length: selectedReview.rating}, (_, i) => <Star key={`f-${i}`} size={13} fill="var(--color-warning)" color="var(--color-warning)" />)}
                    {Array.from({length: 5 - selectedReview.rating}, (_, i) => <Star key={`e-${i}`} size={13} color="var(--color-border)" />)}
                  </div>
                </div>
              )}
              {selectedReview.createdAt && <div className="detail-field"><div className="detail-label">Created</div><div className="detail-value">{formatDateTime(selectedReview.createdAt)}</div></div>}
            </div>
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
        {tab === 'issue-reports' && (
          <div>
            <div className="card">
              <div className="card-header">
                <FilterBar
                  filters={issueReportFilters}
                  values={reportFilter}
                  onChange={(key, value) => setReportFilter(previous => ({ ...previous, [key]: value }))}
                />
              </div>
              {reportsError && <div className="alert alert-error" role="alert">Unable to load issue reports: {reportsError}</div>}
              <div className="card-body p-0">
                <DataTable
                  columns={issueReportColumns}
                  data={filteredReports}
                  onRowClick={setSelectedReport}
                  pageSize={10}
                  loading={reportsLoading}
                  emptyMessage="No issue reports found."
                />
              </div>
            </div>
            <DetailPanel
              open={!!selectedReport}
              onClose={() => setSelectedReport(null)}
              title={selectedReport?.issueType || 'Issue Report'}
            >
              {selectedReport && (
                <div className="detail-panel-section">
                  <h4>Issue Report</h4>
                  <div className="detail-field"><div className="detail-label">Report ID</div><div className="detail-value text-xs text-muted font-mono">{selectedReport.id}</div></div>
                  <div className="detail-field"><div className="detail-label">Reporter</div><div className="detail-value">{selectedReport.reporterName}</div></div>
                  {selectedReport.targetType === 'profile' && (
                    <div className="detail-field"><div className="detail-label">Reported User</div><div className="detail-value">{selectedReport.reportedName || selectedReport.targetId}</div></div>
                  )}
                  <div className="detail-field"><div className="detail-label">Target Type</div><div className="detail-value">{selectedReport.targetType}</div></div>
                  <div className="detail-field">
                    <div className="detail-label">Target ID</div>
                    <div className="detail-value text-xs text-muted font-mono" title={selectedReport.targetId}>
                      {selectedReport.targetType === 'profile'
                        ? formatEntityIdNumeric(selectedReport.targetId, 'USR-')
                        : selectedReport.targetId}
                    </div>
                  </div>
                  <div className="detail-field"><div className="detail-label">Issue Type</div><div className="detail-value">{selectedReport.issueType}</div></div>
                  <div className="detail-field"><div className="detail-label">Comment</div><div className="detail-value">{selectedReport.comment}</div></div>
                  <div className="detail-field"><div className="detail-label">Status</div><div className="detail-value"><StatusBadge status={selectedReport.status} /></div></div>
                  <div className="detail-field"><div className="detail-label">Created</div><div className="detail-value">{formatDateTime(selectedReport.createdAt)}</div></div>
                  <div className="detail-field">
                    <div className="detail-label">Attachments</div>
                    <div className="detail-value">
                      {selectedReport.attachmentPaths?.length
                        ? selectedReport.attachmentPaths.map((path, index) => <div key={`${path}-${index}`}>{path}</div>)
                        : 'None'}
                    </div>
                  </div>
                </div>
              )}
              {selectedReport && (
                <div className="detail-panel-section">
                  <h4>Available Actions</h4>
                  {!reportActionsLoading && reportActionTarget && !reportActionTarget.exists && (
                    <p className="text-muted text-sm" role="status">The reported target no longer exists. Resolve the report with a reason; actions on the missing target are disabled.</p>
                  )}
                  {reportActionsError && <div className="alert alert-error" role="alert">{reportActionsError}</div>}
                  {reportActionsLoading ? (
                    <p className="text-muted text-sm" role="status">Loading permitted actions...</p>
                  ) : reportActions.length ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                      {reportActions.map((availableAction) => (
                        <button
                          key={availableAction.id}
                          type="button"
                          className={`btn btn-sm ${availableAction.id === 'suspend' ? 'btn-danger' : 'btn-outline'}`}
                          disabled={!availableAction.allowed}
                          title={
                            issueReportActionUnavailableReasons[availableAction.unavailableReason]
                            || (!availableAction.allowed ? 'Administrator role required' : availableAction.description)
                          }
                          aria-describedby={`issue-action-description-${availableAction.id}`}
                          onClick={(event) => {
                            reportActionButtonRef.current = event.currentTarget;
                            setReportActionPrompt(availableAction);
                            setReportActionReason('');
                            setReportActionDeliveryPending(false);
                            setReportActionMessage(
                              availableAction.id === 'warn'
                                ? `Automated moderation warning for report #${selectedReport.id}. Reason: ${selectedReport.issueType}. If you believe this warning is mistaken, reply here to appeal within 7 days.`
                                : ''
                            );
                            setReportActionDuration(7);
                            setReportActionError('');
                            setReportActionIdempotencyKey('');
                          }}
                        >
                          {issueReportActionLabels[availableAction.id] || availableAction.id}
                        </button>
                      ))}
                    </div>
                  ) : (
                    !reportActionsError && <p className="text-muted text-sm">No actions are currently available for this report.</p>
                  )}
                  {reportActions.map(availableAction => (
                    <p
                      key={`${availableAction.id}-description`}
                      id={`issue-action-description-${availableAction.id}`}
                      className="text-muted text-xs"
                    >
                      {availableAction.description}
                      {!availableAction.allowed && availableAction.adminOnly && !availableAction.unavailableReason && ' Administrator role required.'}
                    </p>
                  ))}
                </div>
              )}
            </DetailPanel>
            {reportActionPrompt && (
              <div className="modal-overlay" onClick={closeReportActionPrompt}>
                <section
                  className="modal"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="issue-report-action-title"
                  aria-describedby="issue-report-action-description"
                  onClick={event => event.stopPropagation()}
                  onKeyDown={event => {
                    if (event.key !== 'Tab') return;
                    const focusable = event.currentTarget.querySelectorAll('button:not(:disabled), textarea:not(:disabled), input:not(:disabled)');
                    if (!focusable.length) return;
                    const first = focusable[0];
                    const last = focusable[focusable.length - 1];
                    if (event.shiftKey && document.activeElement === first) {
                      event.preventDefault();
                      last.focus();
                    } else if (!event.shiftKey && document.activeElement === last) {
                      event.preventDefault();
                      first.focus();
                    }
                  }}
                >
                  <div className="modal-header">
                    <h3 id="issue-report-action-title">{issueReportActionLabels[reportActionPrompt.id] || 'Confirm action'}</h3>
                    <button type="button" className="modal-close" aria-label="Close confirmation" onClick={closeReportActionPrompt} disabled={reportActionSubmitting}><X size={18} /></button>
                  </div>
                  <form onSubmit={submitReportAction}>
                    <div className="modal-body">
                      <p id="issue-report-action-description" style={{ color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
                        {reportActionPrompt.id === 'warn'
                          ? reportActionDeliveryPending
                            ? 'The warning is recorded. Retry delivery with the same message.'
                            : reportActionPrompt.description
                          : reportActionPrompt.description}
                        {reportActionPrompt.id === 'warn'
                          ? ' The message will be sent in the existing chat and the moderation action recorded in the audit log.'
                          : ' This action will be recorded in the immutable moderation audit log.'}
                      </p>
                      {['warn', 'suspend'].includes(reportActionPrompt.id) && (
                        <div
                          role="status"
                          style={{
                            padding: 'var(--space-3)',
                            marginBottom: 'var(--space-3)',
                            borderLeft: '3px solid var(--color-warning)',
                            borderRadius: 'var(--radius-md)',
                            background: 'var(--color-warning-subtle)',
                          }}
                        >
                          Confirming action for <strong>{selectedReport?.reportedName || 'Unknown reported user'}</strong>
                          <span className="text-xs text-muted" title={selectedReport?.targetId}>
                            {' '}({formatEntityIdNumeric(selectedReport?.targetId, 'USR-')})
                          </span>
                        </div>
                      )}
                      {reportActionPrompt.id !== 'warn' && <div className="form-group">
                        <label className="form-label" htmlFor="issue-report-action-reason">Reason (required)</label>
                        <textarea
                          id="issue-report-action-reason"
                          className="form-textarea"
                          rows={4}
                          maxLength={1000}
                          required
                          autoFocus
                          value={reportActionReason}
                          onChange={event => setReportActionReason(event.target.value)}
                          disabled={reportActionSubmitting || reportActionDeliveryPending}
                        />
                      </div>}
                      {reportActionPrompt.id === 'warn' && (
                        <div className="form-group">
                          <label className="form-label" htmlFor="issue-report-warning-message">Chat message (editable)</label>
                          <textarea
                            id="issue-report-warning-message"
                            className="form-textarea"
                            rows={5}
                            maxLength={2000}
                            required
                            value={reportActionMessage}
                            onChange={event => setReportActionMessage(event.target.value)}
                            disabled={reportActionSubmitting || reportActionDeliveryPending}
                          />
                          <p className="text-muted text-xs">This will be sent in the existing chat. Do not include reporter identity or private details.</p>
                        </div>
                      )}
                      {reportActionPrompt.id === 'suspend' && (
                        <div className="form-group">
                          <label className="form-label" htmlFor="issue-report-action-duration">Suspension duration</label>
                          <select
                            id="issue-report-action-duration"
                            className="form-select"
                            value={reportActionDuration === 'custom' ? 'custom' : reportActionDuration}
                            onChange={event => {
                              const val = event.target.value;
                              if (val === 'custom') {
                                setReportActionDuration('custom');
                              } else {
                                setReportActionDuration(Number(val));
                                setReportActionCustom('');
                              }
                            }}
                            disabled={reportActionSubmitting || reportActionDeliveryPending}
                            style={{ width: '100%' }}
                          >
                            <option value={7}>7 days (1 week)</option>
                            <option value={14}>14 days (2 weeks)</option>
                            <option value={21}>21 days (3 weeks)</option>
                            <option value={30}>30 days (1 month)</option>
                            <option value={60}>60 days (2 months)</option>
                            <option value={90}>90 days (3 months)</option>
                            <option value="custom">Custom — enter days</option>
                          </select>
                          {reportActionDuration === 'custom' && (
                            <input
                              id="issue-report-action-custom-days"
                              className="form-input"
                              type="number"
                              min="1"
                              max="90"
                              placeholder="Days"
                              value={reportActionCustom}
                              onChange={event => setReportActionCustom(event.target.value)}
                              disabled={reportActionSubmitting || reportActionDeliveryPending}
                              style={{ width: '100%', marginTop: '0.5rem' }}
                            />
                          )}
                        </div>
                      )}
                      {reportActionError && <div className="alert alert-error" role="alert">{reportActionError}</div>}
                    </div>
                    <div className="modal-footer">
                      <button type="button" className="btn btn-outline" onClick={closeReportActionPrompt} disabled={reportActionSubmitting}>{reportActionDeliveryPending ? 'Close' : 'Cancel'}</button>
                      <button type="submit" className={`btn ${reportActionPrompt.id === 'suspend' ? 'btn-danger' : 'btn-accent'}`} disabled={reportActionSubmitting || (reportActionPrompt.id !== 'warn' && !reportActionReason.trim()) || (reportActionPrompt.id === 'warn' && !reportActionMessage.trim())}>
                        {reportActionSubmitting ? 'Applying...' : reportActionPrompt.id === 'warn' ? reportActionDeliveryPending ? 'Retry delivery' : 'Send warning' : 'Confirm action'}
                      </button>
                    </div>
                  </form>
                </section>
              </div>
            )}
          </div>
        )}
        {tab === 'reviews' && renderReviews()}
      </div>
    </div>
  );
}
