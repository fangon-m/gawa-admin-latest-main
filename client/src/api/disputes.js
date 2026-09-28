import { get, post } from './client';
import { toQueryString } from '../utils/helpers';

export const list = (params) => get(`/disputes${toQueryString(params)}`);
export const getById = (id) => get(`/disputes/${id}`);
export const updateStatus = (id, body) => post(`/disputes/${id}/status`, body);
