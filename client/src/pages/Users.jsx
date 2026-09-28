import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../utils/permissions';
import { useApiData } from '../utils/useApiData';
import { list as listUsers } from '../api/users';
import { formatDate, formatEntityId, getInitials } from '../utils/helpers';
import Header from '../components/layout/Header';
import SearchBar from '../components/common/SearchBar';
import FilterBar from '../components/common/FilterBar';
import DataTable from '../components/common/DataTable';
import StatusBadge from '../components/common/StatusBadge';

const roleFilters = [
  { key: 'role', label: 'Role', placeholder: 'All Roles', options: [
    { value: 'client', label: 'Client' },
    { value: 'talent', label: 'Talent' },
    { value: 'contractor', label: 'Contractor' },
    { value: 'equipment_owner', label: 'Equipment Owner' },
  ]},
  { key: 'status', label: 'Status', placeholder: 'All Statuses', options: [
    { value: 'verified', label: 'Verified' },
    { value: 'unverified', label: 'Unverified' },
    { value: 'flagged', label: 'Flagged' },
    { value: 'suspended', label: 'Suspended' },
    { value: 'archived', label: 'Archived' },
  ]},
];

export default function Users() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can } = usePermissions(user?.role);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ role: '', status: '' });

  const { data: users, loading, error } = useApiData(() => listUsers({ limit: 100, search: search || undefined }), [search], {
    defaultValue: [],
    transform: (r) => r?.data ?? r ?? [],
  });

  const filtered = useMemo(() => {
    let data = [...users];
    if (search) {
      const q = search.toLowerCase();
      data = data.filter((u) => (u.name || u.fullName)?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || (u.location || u.completeAddress)?.toLowerCase().includes(q));
    }
    if (filters.role) data = data.filter((u) => u.role === filters.role);
    if (filters.status) data = data.filter((u) => u.status === filters.status);
    return data;
  }, [search, filters, users]);

  const columns = [
    { key: 'name', label: 'User', render: (row) => (
      <div className="flex items-center gap-2">
        <div className="user-avatar-sm">{getInitials(row.name || row.fullName)}</div>
        <div>
          <div className="cell-link">{row.name || row.fullName}</div>
          <div className="text-xs text-muted">{row.email}</div>
        </div>
      </div>
    )},
    { key: 'id', label: 'ID', render: (row) => <span className="text-xs text-muted font-mono">{formatEntityId(row.id, 'USR-')}</span> },
    { key: 'role', label: 'Role', render: (row) => <StatusBadge status={row.role} /> },
    { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'location', label: 'Location' },
    { key: 'joinedAt', label: 'Joined', render: (row) => formatDate(row.joinedAt) },
  ];

  return (
    <div>
      <Header title="User Management" />
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-3 flex-1">
            <SearchBar value={search} onChange={setSearch} placeholder="Search users..." />
            <FilterBar filters={roleFilters} values={filters} onChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))} />
          </div>
          <div className="text-sm text-muted">{loading ? 'Loading...' : `${users.length} users`}</div>
        </div>
        {error && (
          <div style={{ padding: '0.75rem 1rem', background: 'var(--color-error-subtle, #fee2e2)', borderBottom: '1px solid var(--color-error)', color: 'var(--color-error)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600 }}>Failed to load users:</span> {error}
          </div>
        )}
        <div className="card-body p-0">
          <DataTable
            columns={columns}
            data={filtered}
            onRowClick={(row) => { if (row.id) navigate(`/users/${row.id}`); }}
            pageSize={10}
            emptyMessage={loading ? 'Loading users...' : 'No users found matching your criteria.'}
          />
        </div>
      </div>
    </div>
  );
}
