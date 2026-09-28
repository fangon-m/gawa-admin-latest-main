import { get, post, put, patch, del } from './client';
import { toQueryString } from '../utils/helpers';

export const list = (jobId, params) => get(`/jobs/${jobId}/tasks${toQueryString(params)}`);
export const create = (jobId, body) => post(`/jobs/${jobId}/tasks`, body);
export const update = (jobId, taskId, body) => put(`/jobs/${jobId}/tasks/${taskId}`, body);
export const updateStatus = (jobId, taskId, status) => patch(`/jobs/${jobId}/tasks/${taskId}/status`, { status });
export const remove = (jobId, taskId) => del(`/jobs/${jobId}/tasks/${taskId}`);
