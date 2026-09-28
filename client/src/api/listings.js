import { get, post } from './client';
import { toQueryString } from '../utils/helpers';

export const list = (params) => get(`/listings${toQueryString(params)}`);
export const getById = (id) => get(`/listings/${id}`);
export const flag = (id) => post(`/listings/${id}/flag`);
export const remove = (id) => post(`/listings/${id}/remove`);
