import { get, post, put, del } from './client';
import { toQueryString } from '../utils/helpers';

export const listAssessmentQuestions = (params) => get(`/assessment-questions${toQueryString(params)}`);
export const getAssessmentQuestion = (id) => get(`/assessment-questions/${id}`);
export const createAssessmentQuestion = (body) => post('/assessment-questions', body);
export const updateAssessmentQuestion = (id, body) => put(`/assessment-questions/${id}`, body);
export const deleteAssessmentQuestion = (id) => del(`/assessment-questions/${id}`);