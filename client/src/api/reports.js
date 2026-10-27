import { get, post } from './client';
import { toQueryString } from '../utils/helpers';

export const list = (params) => get(`/reports${toQueryString(params)}`);
export const getActions = (reportId) => get(`/reports/${reportId}/actions`);
export const getWarning = (reportId) => get(`/reports/${reportId}/warning`);
export const getModerationMetrics = (days = 30) => get(`/reports/moderation/metrics?days=${days}`);
export const getModerationHealth = () => get('/reports/moderation/health');
export const executeAction = (reportId, actionId, payload, idempotencyKey, targetVersion) => post(
  `/reports/${reportId}/actions/${actionId}`,
  payload,
  {
    'Idempotency-Key': idempotencyKey,
    ...(targetVersion ? { 'If-Match': targetVersion } : {}),
  }
);
export const markCompliant = (reportId, reason, idempotencyKey, targetVersion) => executeAction(
  reportId,
  'mark_compliant',
  { reason },
  idempotencyKey,
  targetVersion
);
