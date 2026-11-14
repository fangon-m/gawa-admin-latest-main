import { get, post } from './client';

export const login = (email, password) => post('/auth/login', { email, password });
export const requestReset = (email) => post('/auth/request-reset', { email });
export const resetPassword = (token, newPassword) => post('/auth/reset-password', { token, newPassword });
export const resetPasswordWithAccessToken = (accessToken, newPassword) => post('/auth/reset-password', { accessToken, newPassword });
export const acceptInvite = (token, password) => post('/auth/accept-invite', { token, password });
export const changePassword = (currentPassword, newPassword) => post('/auth/change-password', { currentPassword, newPassword });
export const refresh = (refreshToken) => post('/auth/refresh', { refreshToken });
export const me = () => get('/auth/me');

/**
 * Ends the session on the server.
 *
 * Clearing the token in the browser is not enough on its own: the refresh
 * token would still be usable to obtain a new access token. The server
 * revokes it, so the credentials are dead once the user signs out.
 */
export const logout = () => post('/auth/logout');
