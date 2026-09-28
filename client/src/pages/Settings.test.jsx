import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Settings from './Settings';

// Mock all dependencies
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'admin-uuid', name: 'Admin User', email: 'admin@gawa.ph', phone: '+63 912 345 6789', location: 'Manila', role: 'admin' },
    refetchUser: vi.fn(),
  }),
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

vi.mock('../api/settings', () => ({
  getByKey: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock('../api/incidents', () => ({
  list: vi.fn().mockResolvedValue({ data: [] }),
}));

vi.mock('../utils/useApiData', () => ({
  useApiData: () => ({ data: [], loading: false, error: null, refetch: vi.fn() }),
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
import * as settingsApi from '../api/settings';

describe('Settings Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: settings API returns service area
    settingsApi.getByKey.mockResolvedValue({
      data: { key: 'service_area', value: 'Bulacan, Metro Manila' },
    });
    usersApi.update.mockResolvedValue({ data: {}, message: 'Profile updated' });
    settingsApi.upsert.mockResolvedValue({ data: {}, message: 'Saved' });
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

  // ===============================
  // Service Area tab - Save Configuration
  // ===============================
  describe('Service Area tab - Save Configuration', () => {
    it('loads service area from API on mount', async () => {
      render(<Settings />);

      // Switch to service area tab
      await waitFor(() => {
        const tab = screen.getByTestId('tab-service-area');
        fireEvent.click(tab);
      });

      await waitFor(() => {
        expect(settingsApi.getByKey).toHaveBeenCalledWith('service_area');
        expect(screen.getByText('Service Area Configuration')).toBeInTheDocument();
      });
    });

    it('calls settingsApi.upsert on Save Configuration', async () => {
      settingsApi.getByKey.mockResolvedValue({
        data: { key: 'service_area', value: 'Bulacan' },
      });

      render(<Settings />);

      // Switch to service area tab and wait for data to load
      await waitFor(() => {
        const tab = screen.getByTestId('tab-service-area');
        fireEvent.click(tab);
      });

      // Wait for the textarea to load with the value from API
      await waitFor(() => {
        expect(screen.getByText('Save Configuration')).toBeInTheDocument();
      });

      const saveBtn = screen.getByText('Save Configuration');
      await userEvent.click(saveBtn);

      await waitFor(() => {
        expect(settingsApi.upsert).toHaveBeenCalledWith('service_area', 'Bulacan');
      });
    });

    it('shows success message after saving service area', async () => {
      settingsApi.getByKey.mockResolvedValue({
        data: { key: 'service_area', value: 'Bulacan' },
      });

      render(<Settings />);

      await waitFor(() => {
        const tab = screen.getByTestId('tab-service-area');
        fireEvent.click(tab);
      });

      await waitFor(() => {
        expect(screen.getByText('Save Configuration')).toBeInTheDocument();
      });

      const saveBtn = screen.getByText('Save Configuration');
      await userEvent.click(saveBtn);

      await waitFor(() => {
        expect(screen.getByText('Configuration saved successfully')).toBeInTheDocument();
      });
    });

    it('shows error message when service area save fails', async () => {
      settingsApi.upsert.mockRejectedValue(new Error('API error'));

      render(<Settings />);

      await waitFor(() => {
        const tab = screen.getByTestId('tab-service-area');
        fireEvent.click(tab);
      });

      await waitFor(() => {
        expect(screen.getByText('Save Configuration')).toBeInTheDocument();
      });

      const saveBtn = screen.getByText('Save Configuration');
      await userEvent.click(saveBtn);

      await waitFor(() => {
        expect(screen.getByText('Failed to save configuration')).toBeInTheDocument();
      });
    });
  });

  // ===============================
  // Active Sessions tab - Revoke
  // ===============================
  describe('Active Sessions tab - Revoke', () => {
    it('renders session list with Revoke buttons', async () => {
      render(<Settings />);

      // Switch to sessions tab
      await waitFor(() => {
        const tab = screen.getByTestId('tab-sessions');
        fireEvent.click(tab);
      });

      await waitFor(() => {
        expect(screen.getByText('Chrome on Windows')).toBeInTheDocument();
        expect(screen.getByText('Safari on macOS')).toBeInTheDocument();
        expect(screen.getByText('Firefox on Linux')).toBeInTheDocument();
        // Should have 2 Revoke buttons (current session excluded)
        const revokeBtns = screen.getAllByText('Revoke');
        expect(revokeBtns).toHaveLength(2);
      });
    });

    it('removes session from list when Revoke is clicked', async () => {
      render(<Settings />);

      await waitFor(() => {
        const tab = screen.getByTestId('tab-sessions');
        fireEvent.click(tab);
      });

      await waitFor(() => {
        expect(screen.getAllByText('Revoke')).toHaveLength(2);
      });

      const revokeBtns = screen.getAllByText('Revoke');
      await userEvent.click(revokeBtns[0]);

      await waitFor(() => {
        // Now only 1 Revoke button should remain
        expect(screen.getAllByText('Revoke')).toHaveLength(1);
      });
    });

    it('shows success message when a session is revoked', async () => {
      render(<Settings />);

      await waitFor(() => {
        const tab = screen.getByTestId('tab-sessions');
        fireEvent.click(tab);
      });

      await waitFor(() => {
        expect(screen.getAllByText('Revoke')).toHaveLength(2);
      });

      const revokeBtns = screen.getAllByText('Revoke');
      await userEvent.click(revokeBtns[0]);

      await waitFor(() => {
        expect(screen.getByText('Session "Safari on macOS" revoked')).toBeInTheDocument();
      });
    });

    it('does not show Revoke button for the current session', async () => {
      render(<Settings />);

      await waitFor(() => {
        const tab = screen.getByTestId('tab-sessions');
        fireEvent.click(tab);
      });

      await waitFor(() => {
        // Current session should have the "(Current)" badge
        expect(screen.getByText('(Current)')).toBeInTheDocument();
        // And should NOT have a Revoke button
        const currentSession = screen.getByText('Chrome on Windows').closest('.settings-row');
        expect(currentSession?.querySelector('button')).toBeNull();
      });
    });
  });
});
