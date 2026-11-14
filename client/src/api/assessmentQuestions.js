import { get, post, postFile, put, del } from './client';
import { toQueryString } from '../utils/helpers';

export const listAssessmentQuestions = (params) => get(`/assessment-questions${toQueryString(params)}`);
export const getAssessmentQuestion = (id) => get(`/assessment-questions/${id}`);
export const createAssessmentQuestion = (body) => post('/assessment-questions', body);
export const importAssessmentQuestions = ({ assessmentId, skillId, skillName }, file, onProgress) => {
  const form = new FormData();
  if (assessmentId) form.append('assessmentId', assessmentId);
  if (skillId) form.append('skillId', skillId);
  if (skillName) form.append('skillName', skillName);
  form.append('file', file);
  return postFile('/assessment-questions/import', form, onProgress);
};
export const updateAssessmentQuestion = (id, body) => put(`/assessment-questions/${id}`, body);
export const deleteAssessmentQuestion = (id) => del(`/assessment-questions/${id}`);
export const deleteAssessmentQuestions = (skillId, ids) => del('/assessment-questions/bulk', { skillId, ids });