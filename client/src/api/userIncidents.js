import { get, post } from './client';
import { toQueryString } from '../utils/helpers';

export const list = (params) => get(`/user-incidents${toQueryString(params)}`);
export const updateStatus = (id, body) => post(`/user-incidents/${id}/status`, body);
