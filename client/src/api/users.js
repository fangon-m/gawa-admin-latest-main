import { get, post, patch, del } from './client';
import { toQueryString } from '../utils/helpers';

export const list = (params) => get(`/users${toQueryString(params)}`);
export const getById = (id) => get(`/users/${id}`);
export const invite = (body) => post('/users/invite', body);
export const update = (id, body) => patch(`/users/${id}`, body);
export const suspend = (id, options = {}) => post(`/users/${id}/suspend`, options);
export const reinstate = (id) => post(`/users/${id}/reinstate`);
export const archiveUser = (id, reason) => post(`/users/${id}/archive`, { reason });
export const unarchiveUser = (id) => post(`/users/${id}/unarchive`);
export const flagUser = (id) => post(`/users/${id}/flag`);
export const remove = (id) => del(`/users/${id}`);
export const resetPassword = (id, newPassword) => post(`/users/${id}/reset-password`, { newPassword });
