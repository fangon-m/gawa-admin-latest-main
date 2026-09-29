import { get, post } from './client';
import { toQueryString } from '../utils/helpers';

export const list = (params) => get(`/rentals${toQueryString(params)}`);
export const getById = (id) => get(`/rentals/${id}`);
export const flag = (id) => post(`/rentals/${id}/flag`);
export const remove = (id) => post(`/rentals/${id}/remove`);