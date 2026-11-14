import { get, post, put, del } from './client';
import { toQueryString } from '../utils/helpers';

export const listSkills = (params) => get(`/skills${toQueryString(params)}`);
export const getSkill = (id) => get(`/skills/${id}`);
export const createSkill = (body) => post('/skills', body);
export const updateSkill = (id, body) => put(`/skills/${id}`, body);
export const deleteSkill = (id) => del(`/skills/${id}`);
export const listSkillAssessments = (params) => get(`/skills/skill-assessments${toQueryString(params)}`);