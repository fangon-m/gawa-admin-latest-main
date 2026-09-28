import { get, post } from './client';
import { toQueryString } from '../utils/helpers';

export const list = (params) => get(`/reports${toQueryString(params)}`);
export const moderate = (id, body) => post(`/reports/${id}/moderate`, body);
