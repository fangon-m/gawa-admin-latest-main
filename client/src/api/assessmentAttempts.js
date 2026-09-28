import { get, post } from './client';

export const submit = (body) => post('/assessment-attempts/submit', body);
export const getHistory = (userId, assessmentId) => get(`/assessment-attempts/${userId}/${assessmentId || 'all'}`);
export const getUserAttempts = (userId) => get(`/assessment-attempts/${userId}`);
export const grantOverride = (userId, body) => post(`/assessment-attempts/${userId}/grant-override`, body);
export const getActiveOverrides = (userId) => get(`/assessment-attempts/${userId}/overrides`);
