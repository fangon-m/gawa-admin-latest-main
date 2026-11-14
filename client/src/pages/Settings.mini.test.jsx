import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Settings from './Settings';

const { mockUser, mockPreferences, mockSearchParams, mockRefetch } = vi.hoisted(() => ({
  mockUser: { id: 'admin-uuid', name: 'Admin User', email: 'admin@gawa.ph', role: 'admin' },
  mockPreferences: {},
  mockSearchParams: new URLSearchParams(),
  mockRefetch: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [mockSearchParams, vi.fn()],
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, refetchUser: vi.fn() }),
}));

vi.mock('../context/NotificationContext', () => ({
  useNotifications: () => ({ preferences: mockPreferences, togglePreference: vi.fn() }),
}));

vi.mock('../utils/permissions', () => ({
  usePermissions: () => ({ can: () => true }),
}));

vi.mock('../utils/useApiData', () => ({
  useApiData: () => ({ data: [], loading: false, error: null, refetch: mockRefetch }),
  useMutation: () => [vi.fn(), { loading: false, error: null, data: null }],
}));

vi.mock('../api/users', () => ({ listTeam: vi.fn(), update: vi.fn(), invite: vi.fn(), remove: vi.fn() }));
vi.mock('../api/settings', () => ({ getByKey: vi.fn(() => Promise.resolve({ data: {} })), upsert: vi.fn() }));
vi.mock('../api/activityLog', () => ({ list: vi.fn(), create: vi.fn() }));
vi.mock('../api/auth', () => ({ changePassword: vi.fn() }));

describe('settings minimal', () => {
  it('renders without crash', () => {
    render(<Settings />);
    expect(screen.getByText('Save Changes')).toBeInTheDocument();
  });
});
