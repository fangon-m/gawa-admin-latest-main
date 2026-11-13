import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { formatCurrency } from '../utils/helpers';
import JobDetail from './JobDetail';

const mockNavigate = vi.fn();
const useApiDataMock = vi.fn();

const job = {
  jobPostId: 'job-uuid',
  jobTitle: 'Fix the roof',
  clientId: 'client-1',
  clientName: 'Jane Client',
  hiringOption: 'contractor',
  serviceType: 'Roofing',
  jobAddress: '123 Main St',
  jobLatitude: 14.5,
  jobLongitude: 121,
  preferredStartTime: 'Within 3 days',
  budget: 5000,
  paymentMethod: ['gcash', 'bank_transfer'],
  jobStatus: 'in_progress',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-05T00:00:00Z',
  matchCount: 1,
  jobTrades: ['Roofing'],
  skills: ['Roofing'],
  flags: [],
  matches: [{
    jobMatchId: 'match-1',
    userId: 'talent-1',
    userName: 'Tom Talent',
    status: 'accepted',
    agreedPrice: 4500,
    connections: 12,
    matchedAt: '2026-01-02T00:00:00Z',
  }],
  completions: [{
    jobCompletionId: 'completion-1',
    message: 'Roof replacement finished',
    talentName: 'Tom Talent',
    matchStatus: 'accepted',
    requestedAt: '2026-01-04T00:00:00Z',
    confirmedAt: null,
    supportingImagesUrl: ['https://example.com/proof.jpg'],
  }],
  checkIn: { checkedInAt: '2026-01-03T00:00:00Z' },
};

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'JOB-123456' }),
  useNavigate: () => mockNavigate,
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-1', role: 'admin' } }),
}));

vi.mock('../context/NotificationContext', () => ({
  useNotifications: () => ({ addNotification: vi.fn() }),
}));

vi.mock('../utils/permissions', () => ({
  usePermissions: () => ({ can: () => false }),
}));

vi.mock('../utils/useApiData', () => ({
  useApiData: (...args) => useApiDataMock(...args),
  useMutation: () => [vi.fn()],
}));

vi.mock('../api/jobs', () => ({
  getById: vi.fn(),
  flag: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('../api/entityNotes', () => ({
  list: vi.fn(),
  add: vi.fn(),
}));

vi.mock('../components/layout/Header', () => ({
  default: ({ title }) => <div>{title}</div>,
}));

vi.mock('../components/common/NotesPanel', () => ({
  default: () => <div>Notes</div>,
}));

vi.mock('../components/common/ConfirmModal', () => ({
  default: () => null,
}));

describe('JobDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let callCount = 0;
    useApiDataMock.mockImplementation(() => {
      callCount += 1;
      return callCount % 2 === 1
        ? { data: job, loading: false, error: null, refetch: vi.fn() }
        : { data: [], refetch: vi.fn() };
    });
  });

  it('shows free-text preferred start instead of an invalid date', () => {
    render(<JobDetail />);

    expect(screen.getByText('Within 3 days')).toBeTruthy();
    expect(screen.queryByText(/Invalid Date/i)).toBeNull();
  });

  it('shows budget, payment methods, and GP used', () => {
    render(<JobDetail />);

    expect(screen.getByText(formatCurrency(5000))).toBeTruthy();
    expect(screen.getByText('gcash, bank transfer')).toBeTruthy();
    expect(screen.getAllByText(/GP Used: 12/).length).toBeGreaterThan(0);
  });

  it('renders a job timeline on the completions tab', () => {
    render(<JobDetail />);

    fireEvent.click(screen.getByRole('button', { name: 'completions' }));

    expect(screen.getByText('Job Timeline')).toBeTruthy();
    expect(screen.getByText('Job Posted')).toBeTruthy();
    expect(screen.getByText('Match Accepted')).toBeTruthy();
    expect(screen.getByText('Checked In')).toBeTruthy();
    expect(screen.getByText('Completion Requested')).toBeTruthy();
    expect(screen.getByText('Completion Confirmed')).toBeTruthy();
    expect(screen.getByText('Awaiting client confirmation')).toBeTruthy();
  });
});
