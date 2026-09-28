import { get, post } from './client';
import { toQueryString } from '../utils/helpers';

export const listDisputed = (params = {}) => get(`/completions/disputed${toQueryString(params)}`);
export const resolveDispute = (matchId, body) => post(`/completions/matches/${matchId}/resolve`, body);
