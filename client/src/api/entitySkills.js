import { get, post, del } from './client';

const BASE = '/skills/entity';

export function list(entityType, entityId) {
  return get(`${BASE}/${entityType}/${entityId}`);
}

export function assign(entityType, entityId, skillId) {
  return post(`${BASE}/${entityType}/${entityId}`, { skillId });
}

export function remove(entityType, entityId, skillId) {
  return del(`${BASE}/${entityType}/${entityId}/${skillId}`);
}
