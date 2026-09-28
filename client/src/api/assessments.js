import { get, post, put } from './client';
import { toQueryString } from '../utils/helpers';

export const list = (params) => get(`/assessments${toQueryString(params)}`);
export const getById = (id) => get(`/assessments/${id}`);
export const create = (body) => post('/assessments', body);
export const update = (id, body) => put(`/assessments/${id}`, body);
export const listQuestions = (params) => get(`/questions${toQueryString(params)}`);
export const getQuestionById = (id) => get(`/questions/${id}`);
export const createQuestion = (body) => post('/questions', body);
export const updateQuestion = (id, body) => put(`/questions/${id}`, body);
export const deleteQuestion = (id) => post(`/questions/${id}/delete`);
export const getResponses = (assessmentId) => get(`/assessments/${assessmentId}/responses`);
export const addResponse = (assessmentId, body) => post(`/assessments/${assessmentId}/responses`, body);
