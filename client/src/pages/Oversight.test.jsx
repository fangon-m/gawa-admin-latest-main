// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Oversight from './Oversight';
import { userEntityPath } from '../utils/helpers';

const { report } = vi.hoisted(() => ({
  report: {
    id: 'report-1',
    reporterName: 'Taylor User',
    reportedUserId: 'user-1',
    reportedName: 'Reported Person',
    targetType: 'job_post',
    targetId: 'job-1',
    issueType: 'Fraud',
    comment: 'False listing',
    status: 'open',
    createdAt: '2026-11-01T00:00:00.000Z',
    attachmentPaths: ['reports/a.png'],
    attachmentUrls: ['https://signed.example.com/a.png'],
    attachmentTokens: ['valid-token'],
  },
}));

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'admin-1', role: 'admin' } }) }));
vi.mock('../context/NotificationContext', () => ({ useNotifications: () => ({ addNotification: vi.fn() }) }));
vi.mock('../utils/permissions', () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock('../api/reports', () => ({
  listAll: vi.fn().mockResolvedValue({ data: [report] }),
  getActions: vi.fn().mockResolvedValue({ actions: [], target: { exists: false }, warning: null }),
  executeAction: vi.fn(),
}));
vi.mock('../utils/useApiData', () => ({
  useApiData: () => ({ data: [report], loading: false, error: null, refetch: vi.fn() }),
  useMutation: () => [vi.fn(), { loading: false }],
}));
vi.mock('../components/layout/Header', () => ({ default: ({ title }) => <h1>{title}</h1> }));
vi.mock('../components/common/Tabs', () => ({ default: () => <div>Tabs</div> }));
vi.mock('../components/common/StatCard', () => ({ default: ({ label }) => <div>{label}</div> }));
vi.mock('../components/common/StatusBadge', () => ({ default: ({ label, status }) => <span>{label || status}</span> }));
vi.mock('../components/common/LoadingSpinner', () => ({ default: ({ label }) => <div>{label}</div> }));
vi.mock('../components/common/DetailPanel', () => ({
  default: ({ open, children }) => <div data-testid="detail-panel">{open ? children : null}</div>,
}));
vi.mock('../components/common/DataTable', () => ({
  default: ({ columns, data, onRowClick }) => (
    <div>
      {data.map((row) => (
        <div key={row.id}>
          <button type="button" onClick={() => onRowClick(row)}>Open report</button>
          {columns.map((column) => (
            <div key={column.key}>{column.render ? column.render(row) : row[column.key]}</div>
          ))}
        </div>
      ))}
    </div>
  ),
}));

afterEach(cleanup);

function renderOversight() {
  return render(
    <MemoryRouter>
      <Oversight />
    </MemoryRouter>
  );
}

describe('Oversight incident reports', () => {
  beforeEach(() => vi.clearAllMocks());

  it('links the reported user and shows attachment thumbnails in the table', () => {
    renderOversight();

    expect(screen.getByRole('link', { name: 'Reported Person' })).toHaveAttribute('href', userEntityPath(report.reportedUserId));
    expect(screen.getAllByAltText('Report evidence 1')).toHaveLength(1);
    expect(screen.getByAltText('Report evidence 1')).toHaveAttribute(
      'src',
      expect.stringContaining('/reports/attachments?path=reports%2Fa.png&token=valid-token')
    );
  });

  it('shows attachment photos in the detail panel instead of raw paths', () => {
    renderOversight();

    fireEvent.click(screen.getByRole('button', { name: 'Open report' }));

    expect(screen.getAllByAltText('Report evidence 1').length).toBeGreaterThan(1);
    expect(screen.queryByText('reports/a.png')).not.toBeInTheDocument();
  });

  it('offers the resolve action when the reported target no longer exists', async () => {
    renderOversight();

    fireEvent.click(screen.getByRole('button', { name: 'Open report' }));

    const resolveButton = await screen.findByRole('button', { name: 'Resolve — target unavailable' });
    expect(resolveButton).toBeEnabled();
    fireEvent.click(resolveButton);
  });
});
