import { get, post } from './client';
import { toQueryString } from '../utils/helpers';

export const list = (params) => get(`/jobs${toQueryString(params)}`);
export const getById = (id) => get(`/jobs/${id}`);
export const flag = (id) => post(`/jobs/${id}/flag`);
export const remove = (id) => post(`/jobs/${id}/remove`);
export const checkIn = (matchId, body) => post(`/jobs/check-in/${matchId}`, body);
export const getCheckInStatus = (id, params) => get(`/jobs/check-in-status/${id}${toQueryString(params)}`);
