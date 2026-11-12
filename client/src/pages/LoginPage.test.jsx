import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LoginPage from './LoginPage';

const { mockLogin, mockNavigate } = vi.hoisted(() => ({
  mockLogin: vi.fn(),
  mockNavigate: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  Link: ({ children }) => <a href="/reset-password">{children}</a>,
  useNavigate: () => mockNavigate,
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ login: mockLogin }),
}));

const EMAIL_KEY = 'gawa_admin_email';

beforeEach(() => {
  localStorage.clear();
  mockLogin.mockReset();
  mockNavigate.mockReset();
  mockLogin.mockResolvedValue(true);
});

describe('login page remembers the email address', () => {
  it('starts empty when nothing is remembered', () => {
    render(<LoginPage />);
    expect(screen.getByLabelText('Email')).toHaveValue('');
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });

  it('pre-fills the remembered email but never the password', () => {
    localStorage.setItem(EMAIL_KEY, 'admin@example.com');
    render(<LoginPage />);

    expect(screen.getByLabelText('Email')).toHaveValue('admin@example.com');
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });

  it('stores the email after a successful sign-in', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText('Email'), 'Admin@Example.com');
    await user.type(screen.getByLabelText('Password'), 'secret-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true }));
    expect(localStorage.getItem(EMAIL_KEY)).toBe('admin@example.com');
  });

  it('never stores the password', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText('Email'), 'admin@example.com');
    await user.type(screen.getByLabelText('Password'), 'super-secret');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    const stored = JSON.stringify(localStorage);
    expect(stored).not.toContain('super-secret');
  });

  it('trims the address before sending it', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText('Email'), '  admin@example.com  ');
    await user.type(screen.getByLabelText('Password'), 'secret-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(mockLogin).toHaveBeenCalled());
    expect(mockLogin).toHaveBeenCalledWith('admin@example.com', 'secret-password');
  });

  it('does not remember the email when sign-in fails', async () => {
    mockLogin.mockRejectedValue({ error: 'Invalid email or password' });
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText('Email'), 'admin@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(screen.getByText('Invalid email or password')).toBeInTheDocument());
    expect(localStorage.getItem(EMAIL_KEY)).toBeNull();
  });

  it('can forget the remembered address', async () => {
    localStorage.setItem(EMAIL_KEY, 'admin@example.com');
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole('button', { name: /not you/i }));

    expect(screen.getByLabelText('Email')).toHaveValue('');
    expect(localStorage.getItem(EMAIL_KEY)).toBeNull();
  });

  it('focuses the password field when the address is remembered', () => {
    localStorage.setItem(EMAIL_KEY, 'admin@example.com');
    render(<LoginPage />);

    // The address is already filled in, so the cursor belongs in the password.
    expect(screen.getByLabelText('Password')).toHaveFocus();
  });

  it('focuses the email field when nothing is remembered', () => {
    render(<LoginPage />);
    expect(screen.getByLabelText('Email')).toHaveFocus();
  });
});
