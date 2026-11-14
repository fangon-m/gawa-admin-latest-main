import { get, post } from './client';
import { toQueryString } from '../utils/helpers';

export const list = (params) => get(`/activity-log${toQueryString(params)}`);
export const create = (body) => post('/activity-log', body);
