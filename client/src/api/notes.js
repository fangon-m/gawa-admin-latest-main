import { get, post, del } from './client';

export const listByUser = (userId) => get(`/notes/users/${userId}`);
export const add = (userId, content) => post('/notes', { userId, content });
export const remove = (id) => del(`/notes/${id}`);
