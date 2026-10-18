import { get } from './client';

export const getHistory = (userId, assessmentId) => get(`/assessment-attempts/${userId}/${assessmentId || 'all'}`);
export const getUserAttempts = (userId) => get(`/assessment-attempts/${userId}`);
export const getSkillAttemptStats = () => get('/assessment-attempts/stats/skills');
export const getSkillAttempts = (skillId) => get(`/assessment-attempts/skills/${skillId}`);
