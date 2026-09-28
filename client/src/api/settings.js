import { get, put } from './client';

export const list = () => get('/settings');
export const getByKey = (key) => get(`/settings/${key}`);
export const upsert = (key, value) => put(`/settings/${key}`, { value });
