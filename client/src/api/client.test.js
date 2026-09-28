import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getToken, post, setToken } from './client';

describe('api client auth expiry handling', () => {
  beforeEach(() => {
    localStorage.clear();
    setToken(null);
    vi.restoreAllMocks();
  });

  it('clears the stored token and emits an auth-expired event on 401', async () => {
    setToken('stale-token');
    localStorage.setItem('gawa_admin_token', 'stale-token');

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid or expired token' }),
    });

    const handler = vi.fn();
    window.addEventListener('auth:expired', handler);

    await expect(post('/auth/me')).rejects.toMatchObject({ status: 401 });

    expect(getToken()).toBeNull();
    expect(localStorage.getItem('gawa_admin_token')).toBeNull();
    expect(handler).toHaveBeenCalledTimes(1);

    window.removeEventListener('auth:expired', handler);
  });
});
