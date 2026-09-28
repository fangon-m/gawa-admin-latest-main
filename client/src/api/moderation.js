import { get, post } from './client';
import { toQueryString } from '../utils/helpers';

export const listFlagged = (params) => get(`/moderation${toQueryString(params)}`);
export const moderate = (id, body) => post(`/moderation/${id}/moderate`, body);
