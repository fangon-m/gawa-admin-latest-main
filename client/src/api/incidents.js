import { get } from './client';
import { toQueryString } from '../utils/helpers';

export const list = (params) => get(`/incidents${toQueryString(params)}`);
export const exportCsv = (params) => {
  const qs = toQueryString(params);
  window.open(`/api/incidents/export${qs}`, '_blank');
};
