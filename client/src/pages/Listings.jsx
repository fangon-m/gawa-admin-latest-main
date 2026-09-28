import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiData } from '../utils/useApiData';
import { list as listListings } from '../api/listings';
import { formatCurrency } from '../utils/helpers';
import Header from '../components/layout/Header';
import SearchBar from '../components/common/SearchBar';
import FilterBar from '../components/common/FilterBar';
import DataTable from '../components/common/DataTable';
import StatusBadge from '../components/common/StatusBadge';

const filters = [
  { key: 'status', label: 'Status', placeholder: 'All Statuses', options: [
    { value: 'published', label: 'Published' },
    { value: 'flagged', label: 'Flagged' },
    { value: 'unpublished', label: 'Unpublished' },
  ]},
];

export default function Listings() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [fil, setFil] = useState({ status: '' });

  const { data: listings, loading } = useApiData(() => listListings({ limit: 100, search: search || undefined }), [search], {
    defaultValue: [],
    transform: (r) => r?.data ?? r ?? [],
  });

  const filtered = useMemo(() => {
    let data = [...listings];
    if (search) {
      const q = search.toLowerCase();
      data = data.filter((l) => l.equipmentName?.toLowerCase().includes(q) || l.ownerName?.toLowerCase().includes(q));
    }
    if (fil.status) data = data.filter((l) => l.status === fil.status);
    return data;
  }, [search, fil, listings]);

  const columns = [
    { key: 'equipmentName', label: 'Equipment', render: (row) => <span className="cell-link" onClick={() => { if (row.listingId) navigate(`/listings/${row.listingId}`); }}>{row.equipmentName}</span> },
    { key: 'id', label: 'ID', render: (row) => <span className="text-xs text-muted font-mono">{row.listingId?.slice(0, 8)}</span> },
    { key: 'ownerName', label: 'Owner' },
    { key: 'dayPricing', label: 'Day Rate', render: (row) => formatCurrency(row.dayPricing) },
    { key: 'weekPricing', label: 'Week Rate', render: (row) => formatCurrency(row.weekPricing) },
    { key: 'equipmentCondition', label: 'Condition' },
    { key: 'stock', label: 'Stock' },
    { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
  ];

  return (
    <div>
      <Header title="Listing Management" onSearch={setSearch} />
      <div className="card">
        <div className="card-header">
          <FilterBar filters={filters} values={fil} onChange={(key, value) => setFil((p) => ({ ...p, [key]: value }))} />
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <DataTable columns={columns} data={filtered} onRowClick={(row) => { if (row.listingId) navigate(`/listings/${row.listingId}`); }} pageSize={10} emptyMessage={loading ? 'Loading...' : 'No listings found.'} />
        </div>
      </div>
    </div>
  );
}
