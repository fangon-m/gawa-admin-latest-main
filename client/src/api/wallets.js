import { get, post } from './client';

export const list = (params) => get(`/wallets${params ? `?${new URLSearchParams(params).toString()}` : ''}`);
export const getByUserId = (userId) => get(`/wallets/user/${userId}`);
export const getById = (id) => get(`/wallets/${id}`);
export const adjustBalance = (id, body) => post(`/wallets/${id}/adjust`, body);
