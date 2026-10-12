import { get, post } from './client';
import { toQueryString } from '../utils/helpers';

export const list = (params) => get(`/reports${toQueryString(params)}`);
export const getActions = (reportId) => get(`/reports/${reportId}/actions`);
export const executeAction = (reportId, actionId, payload, idempotencyKey, targetVersion) => post(
  `/reports/${reportId}/actions/${actionId}`,
  payload,
  {
    'Idempotency-Key': idempotencyKey,
    ...(targetVersion ? { 'If-Match': targetVersion } : {}),
  }
);
