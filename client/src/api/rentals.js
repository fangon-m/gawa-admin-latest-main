import { get, post } from './client';
import { toQueryString } from '../utils/helpers';

export const list = (params) => get(`/rentals${toQueryString(params)}`);
export const getById = (id) => get(`/rentals/${id}`);
export const releaseDeposit = (id) => post(`/rentals/${id}/release-deposit`);
export const deductDeposit = (id, body) => post(`/rentals/${id}/deduct-deposit`, body);
export const receiveEquipment = (id) => post(`/rentals/${id}/receive`);
export const returnEquipment = (id, body) => post(`/rentals/${id}/return`, body);
