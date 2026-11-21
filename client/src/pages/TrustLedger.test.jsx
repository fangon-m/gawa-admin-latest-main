// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TrustLedger from './TrustLedger';

const { mockPost, mockRefetch } = vi.hoisted(() => ({
  mockPost: vi.fn(),
  mockRefetch: vi.fn(),
}));

const baseEscrowEntry = {
  id: 'txn-1',
  displayId: 'ESC-abc12345',
  type: 'deposit',
  amount: 500,
  status: 'held',
  userName: 'Renter Name',
  ownerName: 'Owner Name',
  paymentMethod: 'gcash',
  releaseTransactionId: 'txn-1',
  isEquipmentEscrow: true,
  returnCondition: 'damaged',
  returnDamageImagesUrl: ['https://example.com/damage.jpg'],
  suggestedRecipient: 'owner',
  releaseDate: null,
  createdAt: '2026-11-01T10:00:00.000Z',
};

let escrowEntry;

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'admin-1', role: 'admin' } }) }));
vi.mock('../utils/permissions', () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock('../api/client', () => ({ get: vi.fn(), post: mockPost }));
vi.mock('../utils/useApiData', () => ({
  useApiData: () => ({ data: { summary: {}, entries: [escrowEntry] }, loading: false, error: null, refetch: mockRefetch }),
}));
vi.mock('../components/layout/Header', () => ({ default: ({ title }) => <h1>{title}</h1> }));
vi.mock('../components/common/FilterBar', () => ({ default: () => <div>Filters</div> }));
vi.mock('../components/common/StatCard', () => ({ default: ({ label }) => <div>{label}</div> }));
vi.mock('../components/common/StatusBadge', () => ({ default: ({ label, status }) => <span>{label || status}</span> }));
vi.mock('../components/common/DataTable', () => ({
  default: ({ columns, data }) => (
    <div>
      {data.map((row, index) => (
        <div key={index}>
          {columns.find((column) => column.key === 'releasedTo')?.render(row)}
          {columns.find((column) => column.key === 'releaseDate')?.render(row)}
        </div>
      ))}
    </div>
  ),
}));

afterEach(cleanup);

describe('TrustLedger deposit release', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    escrowEntry = { ...baseEscrowEntry };
    mockPost.mockResolvedValue({ data: {} });
  });

  it('shows the return condition and supporting images, and recommends the owner for damage', () => {
    render(<TrustLedger />);

    fireEvent.click(screen.getByRole('button', { name: 'Release' }));

    expect(screen.getByText('Damaged')).toBeInTheDocument();
    expect(screen.getByAltText('Return evidence 1')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Owner/ })).toBeChecked();
    expect(screen.getAllByText('Recommended')).toHaveLength(1);
  });

  it('shows who received a released deposit in the table', () => {
    escrowEntry.status = 'released';
    escrowEntry.releaseDate = '2026-11-05T10:00:00.000Z';
    escrowEntry.releasedTo = 'owner';
    escrowEntry.releasedToName = 'Owner Name';

    render(<TrustLedger />);

    expect(screen.getByText('Owner Name')).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Release' })).not.toBeInTheDocument();
  });

  it('requires a reason when overriding the suggested recipient', async () => {
    render(<TrustLedger />);
    fireEvent.click(screen.getByRole('button', { name: 'Release' }));

    fireEvent.click(screen.getByRole('radio', { name: /Client \(renter\)/ }));
    const submit = screen.getByRole('button', { name: 'Confirm release' });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Item returned undamaged after inspection' } });
    expect(submit).toBeEnabled();

    fireEvent.click(submit);

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/trust-ledger/txn-1/release', {
      recipient: 'renter',
      reason: 'Item returned undamaged after inspection',
    }));
    expect(mockRefetch).toHaveBeenCalled();
  });
});
