import { get, post, put, del } from './client';
import { toQueryString } from '../utils/helpers';

export const listPacks = (params) => get(`/gawa-points/packs${toQueryString(params)}`);
export const createPack = (body) => post('/gawa-points/packs', body);
export const updatePack = (id, body) => put(`/gawa-points/packs/${id}`, body);
export const deletePack = (id) => del(`/gawa-points/packs/${id}`);
export const issuePoints = (body) => post('/gawa-points/issue', body);
export const deductPoints = (body) => post('/gawa-points/deduct', body);
export const listTransactions = (params) => get(`/gawa-points/transactions${toQueryString(params)}`);
