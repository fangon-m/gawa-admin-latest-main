import { get } from './client';
import { toQueryString } from '../utils/helpers';

export const list = (params) => get(`/reviews${toQueryString(params)}`);
export const getById = (id) => get(`/reviews/${id}`);