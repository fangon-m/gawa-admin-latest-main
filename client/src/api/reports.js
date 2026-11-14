import { get, post } from './client';
import { toQueryString } from '../utils/helpers';

export const list = (params) => get(`/reports${toQueryString(params)}`);

export async function listAll(params = {}) {
  const firstPage = await list({ ...params, page: 1, limit: 100 });
  if (!Array.isArray(firstPage?.data)) throw new Error('Invalid incident reports response');

  const totalPages = Math.max(1, Number(firstPage.pagination?.totalPages) || 1);
  const reports = [...firstPage.data];
  for (let page = 2; page <= totalPages; page += 1) {
    const result = await list({ ...params, page, limit: 100 });
    if (!Array.isArray(result?.data)) throw new Error('Invalid incident reports response');
    reports.push(...result.data);
  }

  return { ...firstPage, data: reports };
}

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
