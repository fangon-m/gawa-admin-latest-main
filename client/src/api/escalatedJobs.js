import { get, post } from './client';
import { toQueryString } from '../utils/helpers';

export const list = (params = {}) => get(`/jobs/escalated${toQueryString(params)}`);
export const resolve = (id, payload) => post(`/jobs/${id}/resolve`, payload);
