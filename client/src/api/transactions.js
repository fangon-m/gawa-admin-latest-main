import { get, post } from './client';
import { toQueryString } from '../utils/helpers';

export const list = (params) => get(`/transactions${toQueryString(params)}`);
export const getById = (id) => get(`/transactions/${id}`);
export const releaseEscrow = (id) => post(`/transactions/${id}/release-escrow`);
export const processRefund = (id, body) => post(`/transactions/${id}/refund`, body);
export const approvePayout = (id) => post(`/transactions/${id}/approve-payout`);
