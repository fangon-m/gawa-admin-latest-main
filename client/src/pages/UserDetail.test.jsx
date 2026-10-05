import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import UserDetail from './UserDetail';

const mockNavigate = vi.fn();
const mockAddNotification = vi.fn();
const useApiDataMock = vi.fn();

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'user-123' }),
  useNavigate: () => mockNavigate,
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-1', role: 'admin' } }),
}));

vi.mock('../context/NotificationContext', () => ({
  useNotifications: () => ({ addNotification: mockAddNotification }),
}));

vi.mock('../utils/permissions', () => ({
  usePermissions: () => ({ can: () => true }),
}));

vi.mock('../utils/useApiData', () => ({
  useApiData: (...args) => useApiDataMock(...args),
  useMutation: () => [vi.fn(), { loading: false }],
}));

vi.mock('../api/users', () => ({
  getById: vi.fn(),
  suspend: vi.fn(),
  reinstate: vi.fn(),
  archiveUser: vi.fn(),
  unarchiveUser: vi.fn(),
  flagUser: vi.fn(),
  resetPassword: vi.fn(),
}));

vi.mock('../components/layout/Header', () => ({
  default: ({ title }) => <div>{title}</div>,
}));

vi.mock('../components/common/StatusBadge', () => ({
  default: ({ label, status }) => <span>{label || status}</span>,
}));

vi.mock('../components/common/Tabs', () => ({
  default: ({ tabs, activeTab, onChange }) => (
    <div>
      {tabs.map((tab) => (
        <button key={tab.key || tab} onClick={() => onChange(tab.key || tab)}>
          {tab.label || tab}
        </button>
      ))}
      <div>Active: {activeTab}</div>
    </div>
  ),
}));

vi.mock('../components/common/NotesPanel', () => ({
  default: () => <div>Notes</div>,
}));

vi.mock('../components/common/ConfirmModal', () => ({
  default: () => null,
}));

vi.mock('../components/common/DataTable', () => ({
  default: ({ columns, data, emptyMessage }) => (
    <div>
      {data?.length ? data.map((row, index) => (
        <div key={index}>
          {columns.map((col) => (
            <span key={col.key}>{col.render ? col.render(row) : row[col.key]}</span>
          ))}
        </div>
      )) : <div>{emptyMessage}</div>}
    </div>
  ),
}));

vi.mock('lucide-react', () => ({
  Mail: () => <span>Mail</span>,
  Phone: () => <span>Phone</span>,
  Ban: () => <span>Ban</span>,
  RotateCcw: () => <span>RotateCcw</span>,
  Flag: () => <span>Flag</span>,
  MapPin: () => <span>MapPin</span>,
  ClipboardCheck: () => <span>ClipboardCheck</span>,
  RefreshCw: () => <span>RefreshCw</span>,
  Award: () => <span>Award</span>,
  XCircle: () => <span>XCircle</span>,
  Gavel: () => <span>Gavel</span>,
}));

describe('UserDetail', () => {
  beforeEach(() => {
    useApiDataMock.mockReset();
    mockNavigate.mockReset();
    mockAddNotification.mockReset();
  });

  it('renders job rows in the Jobs tab when the payload uses snake_case fields', async () => {
    let callIndex = 0;
    const userData = {
      id: 'user-123',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      role: 'client',
      status: 'active',
      flags: 0,
      notes: [],
      phone: null,
      location: 'Metro Manila',
      joinedAt: '2024-01-01T00:00:00.000Z',
      skills: [],
    };

    useApiDataMock.mockImplementation(() => {
      const currentCall = callIndex++ % 7;
      if (currentCall === 0) {
        return { data: userData, loading: false, refetch: vi.fn() };
      }
      if (currentCall === 1) {
        return { data: [], loading: false, refetch: vi.fn() };
      }
      if (currentCall === 2) {
        return {
          data: [{ job_title: 'Renovation', job_post_id: 'job-1', hiring_option: 'contractor_based', job_status: 'active', created_at: '2024-01-01T00:00:00.000Z' }],
          loading: false,
          refetch: vi.fn(),
        };
      }
      if (currentCall === 3) {
        return { data: [], loading: false, refetch: vi.fn() };
      }
      if (currentCall === 4) {
        return { data: [], loading: false, refetch: vi.fn() };
      }
      if (currentCall === 5) {
        return { data: { data: [], stats: {} }, loading: false, refetch: vi.fn() };
      }
      return { data: [], loading: false, refetch: vi.fn() };
    });

    render(<UserDetail />);
    fireEvent.click(screen.getByRole('button', { name: 'Jobs' }));

    expect(await screen.findByText('Renovation')).toBeInTheDocument();
  });

  it('offers a reversible archive action and requires a reason before confirming', () => {
    const userData = {
      id: 'user-123',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      role: 'client',
      status: 'active',
      flags: 0,
      notes: [],
      skills: [],
    };
    useApiDataMock.mockImplementation(() => ({ data: userData, loading: false, refetch: vi.fn() }));

    render(<UserDetail />);
    fireEvent.click(screen.getByRole('button', { name: 'Archive & Ban Account' }));

    expect(screen.getByText(/Their records will be retained/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive & Ban', exact: true })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Reason for archiving'), { target: { value: 'Policy violation' } });
    expect(screen.getByRole('button', { name: 'Archive & Ban', exact: true })).toBeEnabled();
  });
});
