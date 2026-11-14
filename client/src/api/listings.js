import { get, post } from './client';
import { toQueryString } from '../utils/helpers';

export const list = (params) => get(`/listings${toQueryString(params)}`);
export const getById = (id) => get(`/listings/${id}`);
export const flag = (id, data) => post(`/listings/${id}/flag`, data);
export const remove = (id) => post(`/listings/${id}/remove`);
