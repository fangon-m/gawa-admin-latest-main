import { get, post, put, del } from './client';
import { toQueryString } from '../utils/helpers';

export const listPacks = (params) => get(`/galaw-points/packs${toQueryString(params)}`);
export const createPack = (body) => post('/galaw-points/packs', body);
export const updatePack = (id, body) => put(`/galaw-points/packs/${id}`, body);
export const deletePack = (id) => del(`/galaw-points/packs/${id}`);
export const issuePoints = (body) => post('/galaw-points/issue', body);
export const deductPoints = (body) => post('/galaw-points/deduct', body);
export const listTransactions = (params) => get(`/galaw-points/transactions${toQueryString(params)}`);
