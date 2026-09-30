import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiData } from '../utils/useApiData';
import { list as listTransactions } from '../api/transactions';
import { formatDate, formatCurrency, formatEntityId } from '../utils/helpers';
import Header from '../components/layout/Header';
import FilterBar from '../components/common/FilterBar';
import DataTable from '../components/common/DataTable';
import StatusBadge from '../components/common/StatusBadge';

const filters = [
  { key: 'type', label: 'Type', placeholder: 'All Types', options: [
    { value: 'job_payment', label: 'Job Payment' },
    { value: 'rental_payment', label: 'Rental Payment' },
    { value: 'deposit', label: 'Deposit' },
    { value: 'refund', label: 'Refund' },
    { value: 'payout', label: 'Payout' },
  ]},
  { key: 'status', label: 'Status', placeholder: 'All Statuses', options: [
    { value: 'completed', label: 'Completed' },
    { value: 'pending', label: 'Pending' },
    { value: 'escrow', label: 'Escrow' },
    { value: 'held', label: 'Held' },
  ]},
  { key: 'paymentMethod', label: 'Payment', placeholder: 'All Methods', options: [
    { value: 'cash', label: 'Cash' },
    { value: 'gcash', label: 'GCash' },
  ]},
];

export default function Transactions() {
  const navigate = useNavigate();
  const [fil, setFil] = useState({ type: '', status: '', paymentMethod: '' });
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data: transactions, loading } = useApiData(() => listTransactions({ limit: 100 }), [], {
    defaultValue: [],
    transform: (r) => r?.data ?? r ?? [],
  });

  const filtered = useMemo(() => {
    let data = [...transactions];
    if (fil.type) data = data.filter((t) => t.type === fil.type);
    if (fil.status) data = data.filter((t) => t.status === fil.status);
    if (fil.paymentMethod) data = data.filter((t) => t.paymentMethod === fil.paymentMethod);
    if (dateFrom) data = data.filter((t) => new Date(t.createdAt) >= new Date(dateFrom));
    if (dateTo) data = data.filter((t) => new Date(t.createdAt) <= new Date(dateTo + 'T23:59:59'));
    return data;
  }, [fil, dateFrom, dateTo, transactions]);

  const columns = [
    { key: 'id', label: 'ID', render: (row) => <span className="text-xs text-muted font-mono">{formatEntityId(row.id, 'TXN-')}</span> },
    { key: 'type', label: 'Type', render: (row) => <StatusBadge status={row.type} /> },
    { key: 'userName', label: 'User' },
    { key: 'relatedTitle', label: 'Related', render: (row) => <span className="text-xs text-muted">{row.relatedTitle || '—'}</span> },
    { key: 'amount', label: 'Amount', render: (row) => <span className={row.direction === 'out' ? 'text-danger' : 'text-success'}>{(row.direction === 'out' ? '-' : '+')} {formatCurrency(row.amount)}</span> },
    { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'paymentMethod', label: 'Payment' },
    { key: 'reference', label: 'Reference', render: (row) => <span className="text-xs text-muted font-mono">{row.reference}</span> },
    { key: 'createdAt', label: 'Date', render: (row) => formatDate(row.createdAt) },
  ];

  return (
    <div>
      <Header title="Transaction Monitoring" />
      <div className="card">
        <div className="card-header">
          <FilterBar filters={filters} values={fil} onChange={(key, value) => setFil((p) => ({ ...p, [key]: value }))} />
          <div className="flex gap-2 items-center">
            <input type="date" className="form-input" style={{ width: 140, fontSize: 'var(--text-xs)' }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <span className="text-muted">—</span>
            <input type="date" className="form-input" style={{ width: 140, fontSize: 'var(--text-xs)' }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            <span className="text-sm text-muted">{loading ? 'Loading...' : `${filtered.length} transactions`}</span>
          </div>
        </div>
        <div className="card-body p-0">
          <DataTable columns={columns} data={filtered} onRowClick={(row) => { if (row.id) navigate(`/transactions/${row.id}`); }} pageSize={10} emptyMessage={loading ? 'Loading...' : 'No transactions found.'} />
        </div>
      </div>
    </div>
  );
}
