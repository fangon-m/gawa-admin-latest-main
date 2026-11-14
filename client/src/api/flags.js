import { get, post, del } from './client';
import { toQueryString } from '../utils/helpers';

export const list = (params) => get(`/flags${toQueryString(params)}`);
export const getCounts = () => get('/flags/counts');
export const create = (data) => post('/flags', data);
export const resolve = (id, body) => post(`/flags/${id}/resolve`, body);
export const dismiss = (id, body) => post(`/flags/${id}/dismiss`, body);
export const remove = (id) => del(`/flags/${id}`);
