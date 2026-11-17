import { get, post } from './client';
import { toQueryString } from '../utils/helpers';

export const listConversations = (params) => get(`/messages${toQueryString(params)}`);
export const getConversation = (id) => get(`/messages/${id}`);
export const sendMessage = (body) => post('/messages/send', body);

// scope: 'customers' (verified consumers) | 'team' (staff accounts)
export const listRecipients = (params) => get(`/messages/recipients${toQueryString(params)}`);
