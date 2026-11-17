// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import Settings from './Settings';

// Vitest runs without globals here, so Testing Library cannot auto-unmount the
// previous test's tree. Without this a later render duplicates every node.
afterEach(cleanup);

const { mockUser, mockSearchParams, mockRefetch } = vi.hoisted(() => ({
  mockUser: { id: 'admin-uuid', name: 'Admin User', email: 'admin@gawa.ph', phone: '+63 912 345 6789', location: 'Manila', role: 'admin' },
  mockSearchParams: new URLSearchParams(),
  mockRefetch: vi.fn(),
}));

// Mock all dependencies
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    refetchUser: vi.fn(),
  }),
}));

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [mockSearchParams, vi.fn()],
}));

vi.mock('../context/NotificationContext', () => ({
  useNotifications: () => ({
    preferences: {
      user_registrations: true,
      verification_requests: true,
      dispute_filings: true,
      appeal_filings: true,
      flagged_content: true,
      new_reports: true,
    },
    togglePreference: vi.fn(),
  }),
}));

vi.mock('../utils/permissions', () => ({
  usePermissions: () => ({
    can: () => true,
  }),
}));

vi.mock('../api/users', () => ({
  update: vi.fn(),
  invite: vi.fn(),
}));

vi.mock('../utils/useApiData', () => ({
  useApiData: () => ({ data: [], loading: false, error: null, refetch: mockRefetch }),
  useMutation: () => [vi.fn(), { loading: false, error: null, data: null }],
}));

vi.mock('../components/layout/Header', () => ({
  default: ({ title }) => <div data-testid="mock-header">{title}</div>,
}));

vi.mock('../components/common/Tabs', () => ({
  default: ({ tabs, activeTab, onChange }) => (
    <div data-testid="mock-tabs">
      {tabs.map((t) => (
        <button key={t.key} data-testid={`tab-${t.key}`} onClick={() => onChange(t.key)}>
          {t.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('../components/common/StatusBadge', () => ({
  default: ({ status }) => <span data-testid="mock-status-badge">{status}</span>,
}));

vi.mock('../components/common/DataTable', () => ({
  default: ({ columns, data, emptyMessage }) => (
    <div data-testid="mock-datatable">
      {data.length === 0 ? <span>{emptyMessage}</span> : <span>{data.length} rows</span>}
    </div>
  ),
}));

import * as usersApi from '../api/users';

describe('Settings Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usersApi.update.mockResolvedValue({ data: {}, message: 'Profile updated' });
  });

  // ===============================
  // Profile tab - Save Changes
  // ===============================
  describe('Profile tab - Save Changes', () => {
    it('renders profile form with user data', async () => {
      render(<Settings />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Admin User')).toBeInTheDocument();
        expect(screen.getByDisplayValue('+63 912 345 6789')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Manila')).toBeInTheDocument();
      });
    });

    it('calls usersApi.update with correct data on Save Changes', async () => {
      render(<Settings />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Admin User')).toBeInTheDocument();
      });

      const nameInput = screen.getByDisplayValue('Admin User');
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, 'Updated Admin');

      const phoneInput = screen.getByDisplayValue('+63 912 345 6789');
      await userEvent.clear(phoneInput);
      await userEvent.type(phoneInput, '+63 999 888 7777');

      const saveBtn = screen.getByText('Save Changes');
      await userEvent.click(saveBtn);

      await waitFor(() => {
        expect(usersApi.update).toHaveBeenCalledWith('admin-uuid', {
          name: 'Updated Admin',
          phone: '+63 999 888 7777',
          location: 'Manila',
        });
      });
    });

    it('shows success message after saving', async () => {
      render(<Settings />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Admin User')).toBeInTheDocument();
      });

      const saveBtn = screen.getByText('Save Changes');
      await userEvent.click(saveBtn);

      await waitFor(() => {
        expect(screen.getByText('Profile saved successfully')).toBeInTheDocument();
      });
    });

    it('shows saving state on button while saving', async () => {
      // Make the API call slow so we can see the loading state
      usersApi.update.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));

      render(<Settings />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Admin User')).toBeInTheDocument();
      });

      const saveBtn = screen.getByText('Save Changes');
      await userEvent.click(saveBtn);

      // Button should show "Saving..." immediately
      expect(screen.getByText('Saving...')).toBeInTheDocument();
      expect(screen.getByText('Saving...')).toBeDisabled();
    });

    it('shows error message when save fails', async () => {
      usersApi.update.mockRejectedValue(new Error('Network error'));

      render(<Settings />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Admin User')).toBeInTheDocument();
      });

      const saveBtn = screen.getByText('Save Changes');
      await userEvent.click(saveBtn);

      await waitFor(() => {
        expect(screen.getByText('Failed to save profile')).toBeInTheDocument();
      });
    });

    it('shows email field as disabled', async () => {
      render(<Settings />);

      await waitFor(() => {
        const emailInput = screen.getByDisplayValue('admin@gawa.ph');
        expect(emailInput).toBeDisabled();
      });
    });
  });

  it('does not render the Service Area settings tab', () => {
    render(<Settings />);

    expect(screen.queryByTestId('tab-service-area')).not.toBeInTheDocument();
    expect(screen.queryByText('Service Area Configuration')).not.toBeInTheDocument();
  });
});
