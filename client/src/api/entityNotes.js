import { get, post, del } from './client';

export const list = (entityType, entityId) => get(`/entity-notes/${entityType}/${entityId}`);
export const add = (entityType, entityId, content) => post(`/entity-notes/${entityType}/${entityId}`, { content });
export const remove = (entityType, entityId, noteId) => del(`/entity-notes/${entityType}/${entityId}/${noteId}`);
