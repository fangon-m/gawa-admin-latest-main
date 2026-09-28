import { get, post } from './client';
import { toQueryString } from '../utils/helpers';

export const list = (params = {}) => get(`/verifications${toQueryString(params)}`);
export const getById = (id) => get(`/verifications/${id}`);
export const approve = (id) => post(`/verifications/${id}/approve`);
export const reject = (id, body = {}) => post(`/verifications/${id}/reject`, body);