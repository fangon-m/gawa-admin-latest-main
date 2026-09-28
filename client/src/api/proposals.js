import { get } from './client';

export const listByUser = (userId) => get(`/users/${userId}/proposals`);
