import { get, post } from './client';

export const list = (params) => get(`/gawa-points/wallets${params ? `?${new URLSearchParams(params).toString()}` : ''}`);
export const getByUserId = (userId) => get(`/gawa-points/wallets/user/${userId}`);
export const adjustBalance = (userId, body) => post(`/gawa-points/wallets/${userId}/adjust`, body);