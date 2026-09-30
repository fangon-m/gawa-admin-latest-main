import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiData } from '../utils/useApiData';
import { list as listRentals } from '../api/rentals';
import { formatDate, formatCurrency, formatEntityIdNumeric } from '../utils/helpers';
import Header from '../components/layout/Header';
import FilterBar from '../components/common/FilterBar';
import DataTable from '../components/common/DataTable';
import StatusBadge from '../components/common/StatusBadge';

const statusOptions = [
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const filters = [
  { key: 'status', label: 'Status', placeholder: 'All Statuses', options: statusOptions },
];

export default function Rentals() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [fil, setFil] = useState({ status: '' });

  const { data: rentals, loading } = useApiData(
    () => listRentals({ limit: 100, search: search || undefined, status: fil.status || undefined }),
    [search, fil.status],
    { defaultValue: [], transform: (r) => r?.data ?? r ?? [] }
  );

  const filtered = useMemo(() => {
    let data = [...rentals];
    if (search) {
      const q = search.toLowerCase();
      data = data.filter((r) =>
        r.listingTitle?.toLowerCase().includes(q) ||
        r.renterName?.toLowerCase().includes(q) ||
        r.ownerName?.toLowerCase().includes(q)
      );
    }
    return data;
  }, [search, rentals]);

  const columns = [
    { key: 'listingTitle', label: 'Equipment', render: (row) => <span className="cell-link" onClick={(e) => { e.stopPropagation(); if (row.listingId) navigate(`/listings/${row.listingId}`); }}>{row.listingTitle || row.equipmentName || 'N/A'}</span> },
    { key: 'id', label: 'ID', render: (row) => <span className="text-xs text-muted font-mono">{formatEntityIdNumeric(row.rentalId || row.id, 'RNT-')}</span> },
    { key: 'renterName', label: 'Renter' },
    { key: 'ownerName', label: 'Owner' },
    { key: 'totalPrice', label: 'Amount', render: (row) => formatCurrency(row.totalPrice) },
    { key: 'securityDepositPaid', label: 'Deposit', render: (row) => formatCurrency(row.securityDepositPaid) },
    { key: 'rentalStatus', label: 'Status', render: (row) => <StatusBadge status={row.rentalStatus} /> },
    { key: 'startDate', label: 'Start', render: (row) => formatDate(row.startDate) },
    { key: 'endDate', label: 'End', render: (row) => formatDate(row.endDate) },
  ];

  return (
    <div>
      <Header title="Rental Management" onSearch={setSearch} />
      <div className="card">
        <div className="card-header">
          <FilterBar filters={filters} values={fil} onChange={(key, value) => setFil((p) => ({ ...p, [key]: value }))} />
          <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>{loading ? 'Loading...' : `${filtered.length} rentals`}</span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <DataTable
            columns={columns}
            data={filtered}
            onRowClick={(row) => { if (row.rentalId) navigate(`/rentals/${row.rentalId}`); }}
            pageSize={10}
            emptyMessage={loading ? 'Loading...' : 'No rentals found.'}
          />
        </div>
      </div>
    </div>
  );
}