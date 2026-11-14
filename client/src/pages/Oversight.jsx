import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { usePermissions } from '../utils/permissions';
import { useApiData } from '../utils/useApiData';
import { listAll as listAllReports, getActions as getReportActions, executeAction as executeReportAction } from '../api/reports';
import { formatDateTime, formatEntityIdNumeric, timeAgo } from '../utils/helpers';
import { createIncidentReportCsv, filterIncidentReports } from '../utils/incidentReportExport';
import Header from '../components/layout/Header';
import Tabs from '../components/common/Tabs';
import DataTable from '../components/common/DataTable';
import StatusBadge from '../components/common/StatusBadge';
import DetailPanel from '../components/common/DetailPanel';
import { X } from 'lucide-react';

const oversightTabs = [
  { key: 'all', label: 'All statuses' },
  { key: 'open', label: 'Open' },
  { key: 'resolved', label: 'Resolved' },
];

// Reports that are still being worked stay under "Open"; everything closed
// (resolved or dismissed) moves to "Resolved". Grouping them this way keeps
// under_review and warned reports reachable.
const OPEN_REPORT_STATUSES = ['open', 'under_review', 'warned'];
const RESOLVED_REPORT_STATUSES = ['resolved', 'dismissed'];

function formatRemaining(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  if (seconds <= 0) return 'Due now';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.max(1, Math.floor((seconds % 3600) / 60));
  return `${hours}h ${minutes}m`;
}

const issueReportColumns = [
  { key: 'reporterName', label: 'Reporter' },
  { key: 'reportedName', label: 'Reported User', render: (row) => row.reportedName || '—' },
  { key: 'targetType', label: 'Target Type', render: (row) => <StatusBadge status={row.targetType} /> },
  { key: 'targetId', label: 'Target ID', render: (row) => (
    <span className="text-xs text-muted font-mono" title={row.targetId}>
      {row.targetType === 'profile' ? formatEntityIdNumeric(row.targetId, 'USR-') : row.targetId}
    </span>
  ) },
  { key: 'issueType', label: 'Incident Type' },
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
  mark_compliant: 'Mark compliant',
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
  REPORT_WARNING_UNAVAILABLE: 'The warning state could not be loaded. Refresh the report and try again.',
  AUTO_SUSPENDED: 'This warning already resulted in an automatic suspension.',
  WARNING_NOT_ACTIVE: 'This warning is no longer active. Refresh the report to see its current state.',
  MODERATION_SCHEMA_NOT_READY: 'The moderation schema is not deployed on this database. Apply migrations 008 and 009, then retry.',
};

const issueReportActionUnavailableReasons = {
  SUSPENSION_STORAGE_UNAVAILABLE: 'Suspension is disabled because the user_suspensions table is not installed.',
};

export default function Oversight() {
  const { user: currentUser } = useAuth();
  usePermissions(currentUser?.role);
  const { addNotification } = useNotifications();
  const [tab, setTab] = useState('all');
  const [selectedReport, setSelectedReport] = useState(null);
  const [reportActions, setReportActions] = useState([]);
  const [reportActionTarget, setReportActionTarget] = useState(null);
  const [reportWarning, setReportWarning] = useState(null);
  const [moderationSettings, setModerationSettings] = useState({
    warningDays: 7,
    reminderDay: 3,
    autoSuspendDays: 3,
  });
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
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');
  const [exportReportType, setExportReportType] = useState('all');
  const [exportError, setExportError] = useState('');
  const reportActionButtonRef = useRef(null);

  const { data: allReports, loading: reportsLoading, error: reportsError, refetch: refetchReports } = useApiData(() => listAllReports(), [], {
    defaultValue: [], transform: (r) => r?.data ?? r ?? [],
  });

  useEffect(() => {
    if (!selectedReport) {
      setReportActions([]);
      setReportActionTarget(null);
      setReportWarning(null);
      setReportActionsError('');
      return undefined;
    }

    let current = true;
    setReportActionsLoading(true);
    setReportActions([]);
    setReportActionTarget(null);
    setReportWarning(null);
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
        setReportWarning(result.warning || null);
        if (result.moderation) {
          setModerationSettings(previous => ({ ...previous, ...result.moderation }));
        }
      })
      .catch((error) => {
        if (!current) return;
        setReportActions([]);
        setReportWarning(null);
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
          setReportWarning(latestActions.warning || null);
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
      'Incident Report Action Recorded',
      `${issueReportActionLabels[actionPrompt.id]} — ${selectedReport.issueType}`,
      '/oversight'
    );
    refetchReports();
    getReportActions(selectedReport.id)
      .then((latestActions) => {
        setReportActions(latestActions.actions || []);
        setReportActionTarget(latestActions.target || null);
        setReportWarning(latestActions.warning || null);
        if (latestActions.moderation) {
          setModerationSettings(previous => ({ ...previous, ...latestActions.moderation }));
        }
        setReportActionsError('');
      })
      .catch(() => {
        setReportActionsError('Action completed, but the available actions could not be refreshed.');
      });
  };

  const visibleReports = useMemo(() => {
    const allowed = tab === 'resolved'
      ? RESOLVED_REPORT_STATUSES
      : tab === 'open' ? OPEN_REPORT_STATUSES : null;
    const reportsByType = exportReportType === 'all'
      ? allReports
      : allReports.filter(report => report.issueType === exportReportType);
    const reportsInDateRange = exportStartDate && exportEndDate && exportStartDate <= exportEndDate
      ? filterIncidentReports(reportsByType, {
        startDate: exportStartDate,
        endDate: exportEndDate,
        reportType: 'all',
      })
      : reportsByType;
    return allowed
      ? reportsInDateRange.filter(report => allowed.includes(report.status))
      : reportsInDateRange;
  }, [allReports, tab, exportStartDate, exportEndDate, exportReportType]);

  const reportTypes = useMemo(
    () => [...new Set(allReports.map((report) => report.issueType).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [allReports]
  );

  const handleExport = () => {
    setExportError('');
    if (!exportStartDate || !exportEndDate || exportEndDate < exportStartDate) {
      setExportError('Select a valid start and end date before exporting.');
      return;
    }

    const reports = filterIncidentReports(allReports, {
      startDate: exportStartDate,
      endDate: exportEndDate,
      reportType: exportReportType,
    });
    if (reports.length === 0) {
      setExportError('No incident reports match the selected date range and report type.');
      return;
    }

    const csv = createIncidentReportCsv(reports);
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    const typeLabel = exportReportType === 'all'
      ? 'all-types'
      : exportReportType.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    link.href = url;
    link.download = `incident-reports_${exportStartDate}_to_${exportEndDate}_${typeLabel || 'type'}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
  };

  const warningView = useMemo(() => {
    if (!selectedReport) return null;
    if (reportWarning?.warnedAt) return reportWarning;
    if (!selectedReport.warnedAt) return null;
    const due = selectedReport.warningDueAt ? Date.parse(selectedReport.warningDueAt) : null;
    return {
      warnedAt: selectedReport.warnedAt,
      dueAt: selectedReport.warningDueAt,
      windowDays: selectedReport.warningWindowDays,
      complianceFlag: selectedReport.warningComplianceFlag === true,
      compliedAt: selectedReport.warningCompliedAt,
      autoSuspendedAt: selectedReport.autoSuspendedAt,
      autoSuspensionUntil: selectedReport.autoSuspensionUntil,
      autoSuspensionSkippedReason: selectedReport.autoSuspensionSkippedReason,
      remainingSeconds: due && Number.isFinite(due)
        ? Math.max(0, Math.ceil((due - Date.now()) / 1000))
        : null,
    };
  }, [selectedReport, reportWarning]);

  return (
    <div>
      <Header title="Incident Reports" />
      <Tabs tabs={oversightTabs} activeTab={tab} onChange={setTab} />
      <div className="tab-content">
        <div>
          <div className="card">
            <div className="card-header"><h3>Incident Reports</h3></div>
            {reportsError && <div className="alert alert-error" role="alert">Unable to load incident reports: {reportsError}</div>}
            <div className="card-body">
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                <label className="form-label" style={{ minWidth: 180 }}>
                  From
                  <input
                    className="form-input"
                    type="date"
                    max={exportEndDate || undefined}
                    value={exportStartDate}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (!exportEndDate || value <= exportEndDate) setExportStartDate(value);
                    }}
                  />
                </label>
                <label className="form-label" style={{ minWidth: 180 }}>
                  To
                  <input
                    className="form-input"
                    type="date"
                    min={exportStartDate || undefined}
                    value={exportEndDate}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (!exportStartDate || value >= exportStartDate) setExportEndDate(value);
                    }}
                  />
                </label>
                <label className="form-label" style={{ minWidth: 180 }}>
                  Report Type
                  <select
                    className="form-input"
                    value={exportReportType}
                    onChange={(event) => {
                      const value = event.target.value;
                      setExportReportType(value);
                      if (value === 'all') setTab('all');
                    }}
                  >
                    <option value="all">All types</option>
                    {reportTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={handleExport}
                  disabled={reportsLoading || !exportStartDate || !exportEndDate || exportEndDate < exportStartDate}
                >
                  Export CSV
                </button>
              </div>
              {exportError && <div className="alert alert-error mt-3" role="alert">{exportError}</div>}
            </div>
            <div className="card-body p-0">
              <div className="card-body text-muted text-sm">
                {exportStartDate && exportEndDate && exportStartDate <= exportEndDate
                  ? `Showing ${tab === 'all' ? 'all statuses' : `${tab} reports`} for ${exportReportType === 'all' ? 'all types' : exportReportType}, filed from ${exportStartDate} through ${exportEndDate} (inclusive).`
                  : exportStartDate || exportEndDate
                    ? 'Choose both dates to filter the table.'
                    : `Showing ${tab === 'all' ? 'all statuses' : `${tab} reports`} for ${exportReportType === 'all' ? 'all types' : exportReportType}, from all dates.`}
              </div>
              <DataTable
                columns={issueReportColumns}
                data={visibleReports}
                onRowClick={setSelectedReport}
                pageSize={10}
                loading={reportsLoading}
                emptyMessage={
                  tab === 'all'
                    ? 'No incident reports found matching the selected filters.'
                    : exportStartDate && exportEndDate && exportStartDate <= exportEndDate
                      ? `No ${tab} incident reports found in the selected date range.`
                      : `No ${tab} incident reports found.`
                }
              />
            </div>
          </div>
          <DetailPanel
            open={!!selectedReport}
            onClose={() => setSelectedReport(null)}
            title={selectedReport?.issueType || 'Incident Report'}
          >
            {selectedReport && (
              <div className="detail-panel-section">
                <h4>Incident Report</h4>
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
                <div className="detail-field"><div className="detail-label">Incident Type</div><div className="detail-value">{selectedReport.issueType}</div></div>
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
            {warningView && (
              <div className="detail-panel-section">
                <h4>Warning</h4>
                <div className="detail-field">
                  <div className="detail-label">State</div>
                  <div className="detail-value">
                    {warningView.complianceFlag
                      ? 'Complied'
                      : warningView.autoSuspendedAt
                        ? 'Auto-suspended'
                        : warningView.autoSuspensionSkippedReason
                          ? `Closed — ${warningView.autoSuspensionSkippedReason.replaceAll('_', ' ')}`
                          : 'Pending compliance'}
                  </div>
                </div>
                <div className="detail-field">
                  <div className="detail-label">Warned</div>
                  <div className="detail-value">{formatDateTime(warningView.warnedAt)}</div>
                </div>
                <div className="detail-field">
                  <div className="detail-label">Compliance due</div>
                  <div className="detail-value">
                    {formatDateTime(warningView.dueAt)}
                    {warningView.windowDays ? ` (${warningView.windowDays}-day window)` : ''}
                  </div>
                </div>
                {!warningView.complianceFlag && !warningView.autoSuspendedAt && !warningView.autoSuspensionSkippedReason && (
                  <div className="detail-field">
                    <div className="detail-label">Time remaining</div>
                    <div className="detail-value">{formatRemaining(warningView.remainingSeconds)}</div>
                  </div>
                )}
                {warningView.compliedAt && (
                  <div className="detail-field">
                    <div className="detail-label">Complied</div>
                    <div className="detail-value">{formatDateTime(warningView.compliedAt)}</div>
                  </div>
                )}
                {warningView.autoSuspendedAt && (
                  <div className="detail-field">
                    <div className="detail-label">Auto-suspended</div>
                    <div className="detail-value">
                      {formatDateTime(warningView.autoSuspendedAt)}
                      {warningView.autoSuspensionUntil ? ` until ${formatDateTime(warningView.autoSuspensionUntil)}` : ''}
                    </div>
                  </div>
                )}
                <p className="text-muted text-xs">
                  An unresolved warning is suspended automatically for {moderationSettings.autoSuspendDays} days.
                  The day-{moderationSettings.reminderDay} reminder and suspension are sent as in-app notifications.
                </p>
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
                              ? `Automated moderation warning for report #${selectedReport.id}. Reason: ${selectedReport.issueType}. `
                                + `If you believe this warning is mistaken, reply here to appeal within ${moderationSettings.warningDays} days. `
                                + `If the warning is not resolved, your account will be automatically suspended for ${moderationSettings.autoSuspendDays} days.`
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
                        : reportActionPrompt.id === 'mark_compliant'
                          ? ' This closes the warning and cancels the automatic suspension. The action is recorded in the immutable moderation audit log.'
                          : ' This action will be recorded in the immutable moderation audit log.'}
                    </p>
                    {['warn', 'mark_compliant', 'suspend'].includes(reportActionPrompt.id) && (
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
      </div>
    </div>
  );
}
