import { get, post, put, del } from './client';
import { toQueryString } from '../utils/helpers';

export const list = (params) => get(`/categories${toQueryString(params)}`);
export const getById = (id) => get(`/categories/${id}`);
export const create = (body) => post('/categories', body);
export const update = (id, body) => put(`/categories/${id}`, body);
export const remove = (id) => del(`/categories/${id}`);
