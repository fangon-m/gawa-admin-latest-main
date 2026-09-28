import { get, post, put, del } from './client';

export const list = () => get('/fee-config');
export const getActive = () => get('/fee-config/active');
export const create = (body) => post('/fee-config', body);
export const update = (id, body) => put(`/fee-config/${id}`, body);
export const remove = (id) => del(`/fee-config/${id}`);
export const setActive = (id) => post(`/fee-config/${id}/set-active`);
