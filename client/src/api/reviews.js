import { get, post } from './client';
import { toQueryString } from '../utils/helpers';

export const list = (params) => get(`/reviews${toQueryString(params)}`);
export const getById = (id) => get(`/reviews/${id}`);
export const moderate = (id, body) => post(`/reviews/${id}/moderate`, body);
