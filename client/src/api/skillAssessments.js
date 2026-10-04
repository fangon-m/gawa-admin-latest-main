import { get, post, put, del } from './client';
import { toQueryString } from '../utils/helpers';

export const listSkillAssessments = (params) => get(`/skill-assessments${toQueryString(params)}`);
export const getSkillAssessment = (id) => get(`/skill-assessments/${id}`);
export const createSkillAssessment = (body) => post('/skill-assessments', body);
export const updateSkillAssessment = (id, body) => put(`/skill-assessments/${id}`, body);
export const deleteSkillAssessment = (id) => del(`/skill-assessments/${id}`);