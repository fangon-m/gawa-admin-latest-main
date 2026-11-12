import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';

const { mockLogin, mockLogout, mockMe } = vi.hoisted(() => ({
  mockLogin: vi.fn(),
  mockLogout: vi.fn(),
  mockMe: vi.fn(),
}));

vi.mock('../api/auth', () => ({
  login: mockLogin,
  logout: mockLogout,
  me: mockMe,
}));

vi.mock('../api/users', () => ({ getById: vi.fn(() => Promise.resolve({ data: null })) }));

vi.mock('../api/client', () => ({
  setToken: vi.fn(),
  setRefreshToken: vi.fn(),
}));

function Probe() {
  const { user, isAuthenticated, logout } = useAuth();
  return (
    <div>
      <span data-testid="state">{isAuthenticated ? 'in' : 'out'}</span>
      <span data-testid="email">{user?.email || 'none'}</span>
      <button onClick={() => logout()}>sign out</button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  // The context only asks the server who we are when a token is stored.
  localStorage.setItem('gawa_admin_token', 'stored-token');
  mockLogin.mockReset();
  mockLogout.mockReset();
  mockMe.mockReset();
  mockLogout.mockResolvedValue({});
  mockMe.mockResolvedValue({ data: { id: 'admin-1', email: 'admin@example.com', role: 'admin' } });
});

describe('signing out', () => {
  it('revokes the session on the server', async () => {
    const user = userEvent.setup();
    render(<AuthProvider><Probe /></AuthProvider>);

    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('in'));
    await user.click(screen.getByRole('button', { name: /sign out/i }));

    await waitFor(() => expect(mockLogout).toHaveBeenCalled());
  });

  it('leaves the interface immediately, even if the server call fails', async () => {
    mockLogout.mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();
    render(<AuthProvider><Probe /></AuthProvider>);

    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('in'));
    await user.click(screen.getByRole('button', { name: /sign out/i }));

    // The user is signed out of the interface straight away.
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('out'));
    expect(screen.getByTestId('email')).toHaveTextContent('none');
    // And the failed revocation did not throw out of the handler.
    await waitFor(() => expect(mockLogout).toHaveBeenCalled());
  });
});
