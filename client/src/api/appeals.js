import { get, post } from './client';
import { toQueryString } from '../utils/helpers';

export const list = (params) => get(`/appeals${toQueryString(params)}`);
export const getById = (id) => get(`/appeals/${id}`);
export const forward = (id, body) => post(`/appeals/${id}/forward`, body);
export const decide = (id, body) => post(`/appeals/${id}/decide`, body);
