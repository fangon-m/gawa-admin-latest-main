import { get, post, patch } from './client';
import { toQueryString } from '../utils/helpers';

export const list = (params = {}) => get(`/notifications${toQueryString(params)}`);
export const create = (body) => post('/notifications', body);
export const markAsRead = (id) => patch(`/notifications/${id}/read`);
export const markAllRead = () => post('/notifications/read-all');
