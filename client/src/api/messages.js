import { get, post } from './client';
import { toQueryString } from '../utils/helpers';

export const listConversations = (params) => get(`/messages${toQueryString(params)}`);
export const getConversation = (id) => get(`/messages/${id}`);
export const sendMessage = (body) => post('/messages/send', body);
export const createConversation = (body) => post('/messages/create', body);
