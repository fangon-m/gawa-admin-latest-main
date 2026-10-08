import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../utils/permissions';
import { useApiData } from '../utils/useApiData';
import { get, post } from '../api/client';
import { formatDate, formatDateTime, formatCurrency, formatNumber } from '../utils/helpers';
import Header from '../components/layout/Header';
import FilterBar from '../components/common/FilterBar';
import DataTable from '../components/common/DataTable';
import StatusBadge from '../components/common/StatusBadge';
import StatCard from '../components/common/StatCard';
import { Landmark, ArrowDownToLine, ArrowUpFromLine, RotateCcw, PiggyBank, Lock, Clock } from 'lucide-react';

const typeFilters = [
  { key: 'type', label: 'Type', placeholder: 'All Types', options: [
    { value: 'job_payment', label: 'Job Payment' },
    { value: 'rental_payment', label: 'Rental Payment' },
    { value: 'deposit', label: 'Deposit' },
  ]},
  { key: 'status', label: 'Status', placeholder: 'All Statuses', options: [
    { value: 'pending', label: 'Pending' },
    { value: 'held', label: 'Held' },
    { value: 'released', label: 'Released' },
    { value: 'refunded', label: 'Refunded' },
  ]},
];

export default function TrustLedger() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can } = usePermissions(user?.role);
  const [fil, setFil] = useState({ type: '', status: '' });
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data: ledgerData, loading, error } = useApiData(async () => {
    const [summaryResponse, entriesResponse] = await Promise.all([
      get('/trust-ledger/summary'),
      get('/trust-ledger'),
    ]);
    return {
      summary: summaryResponse?.data ?? summaryResponse ?? {},
      entries: entriesResponse?.data ?? entriesResponse ?? [],
    };
  }, [], {
    defaultValue: { summary: {}, entries: [] },
  });
  const summary = ledgerData.summary;
  const entries = ledgerData.entries;

  const filtered = useMemo(() => {
    let data = [...entries];
    if (fil.type) data = data.filter((e) => e.type === fil.type);
    if (fil.status) data = data.filter((e) => e.status === fil.status);
    if (dateFrom) data = data.filter((e) => new Date(e.createdAt) >= new Date(dateFrom));
    if (dateTo) data = data.filter((e) => new Date(e.createdAt) <= new Date(dateTo + 'T23:59:59'));
    return data;
  }, [fil, dateFrom, dateTo, entries]);

  const summaryCards = [
    {
      label: 'Current Balance',
      value: formatCurrency(summary.currentBalance || 0),
      icon: <PiggyBank size={20} />,
      color: summary.currentBalance >= 0 ? 'var(--color-success)' : 'var(--color-error)',
    },
    {
      label: 'Total Deposits',
      value: formatCurrency(summary.totalDeposits || 0),
      icon: <ArrowDownToLine size={20} />,
      color: 'var(--color-blue)',
    },
    {
      label: 'Total Payouts',
      value: formatCurrency(summary.totalPayouts || 0),
      icon: <ArrowUpFromLine size={20} />,
      color: 'var(--color-warning)',
    },
    {
      label: 'Total Refunds',
      value: formatCurrency(summary.totalRefunds || 0),
      icon: <RotateCcw size={20} />,
      color: 'var(--color-text-muted)',
    },
    {
      label: 'Total Entries',
      value: formatNumber(summary.totalEntries || 0),
      icon: <Landmark size={20} />,
      color: 'var(--color-accent)',
    },
    {
      label: 'Held in Escrow',
      value: formatCurrency(summary.totalHeld || 0),
      icon: <Lock size={20} />,
      color: 'var(--color-warning)',
    },
    {
      label: 'Pending Release',
      value: formatCurrency(summary.totalPending || 0),
      icon: <Clock size={20} />,
      color: 'var(--color-blue)',
    },
  ];

  const handleRelease = async (id) => {
    try {
      await post(`/trust-ledger/${id}/release`);
      window.location.reload();
    } catch (err) {
      console.error('Failed to release funds:', err);
      alert('Failed to release funds. Please try again.');
    }
  };

  const columns = [
    { key: 'displayId', label: 'ID', render: (row) => <span className="text-xs text-muted font-mono">{row.displayId || row.id?.slice(0, 8)}</span> },
    { key: 'type', label: 'Type', render: (row) => (
      <StatusBadge status={row.type} label={row.isEquipmentEscrow ? 'Equipment Security Deposit' : row.type === 'deposit' ? 'Security Deposit' : row.type === 'job_payment' ? 'Job Payment' : 'Rental Payment'} />
    )},
    { key: 'userName', label: 'User' },
    { key: 'ownerName', label: 'Owner', render: (row) => row.ownerName || '-' },
    { key: 'paymentMethod', label: 'Payment Method', render: (row) => row.paymentMethod?.replaceAll('_', ' ') || '-' },
    { key: 'amount', label: 'Amount', render: (row) => (
      <span style={{ color: row.amount >= 0 ? 'var(--color-success)' : 'var(--color-error)', fontWeight: 600 }}>
        {row.amount >= 0 ? '+' : ''}{formatCurrency(row.amount)}
      </span>
    )},
    {
      key: 'status', label: 'Status', render: (row) => {
        const variant = row.status === 'held' ? 'warning' : row.status === 'pending' ? 'pending' : 'active';
        const icon = row.status === 'held' ? <Lock size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
          : row.status === 'pending' ? <Clock size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
          : null;
        return (
          <span className={`status-badge status-${variant}`} style={{ display: 'inline-flex', alignItems: 'center' }}>
            {icon}
            {row.status}
          </span>
        );
      },
    },
    {
      key: 'releaseDate', label: 'Release Date', render: (row) => {
        if (row.releaseDate) return formatDate(row.releaseDate);
        if (row.releaseTransactionId && (row.status === 'pending' || row.status === 'held')) {
          return (
            <button
              className="btn btn-sm btn-accent"
              onClick={(e) => { e.stopPropagation(); handleRelease(row.releaseTransactionId); }}
              style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}
            >
              Release
            </button>
          );
        }
        return '-';
      },
    },
    { key: 'createdAt', label: 'Date', render: (row) => formatDateTime(row.createdAt) },
  ];

  return (
    <div>
      <Header title="Trust Ledger" />
      <div className="kpi-row">
        {summaryCards.map((card, idx) => (
          <StatCard key={idx} {...card} />
        ))}
      </div>
      {error && <div className="alert alert-error" role="alert">Unable to load trust ledger: {error}</div>}

      <div className="card">
        <div className="card-header">
          <FilterBar filters={typeFilters} values={fil} onChange={(key, value) => setFil((p) => ({ ...p, [key]: value }))} />
          <div className="flex gap-2 items-center">
            <input type="date" className="form-input" style={{ width: 140, fontSize: 'var(--text-xs)' }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <span className="text-muted">—</span>
            <input type="date" className="form-input" style={{ width: 140, fontSize: 'var(--text-xs)' }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            <span className="text-sm text-muted">{loading ? 'Loading...' : `${filtered.length} entries`}</span>
          </div>
        </div>
        <div className="card-body p-0">
          <DataTable
            columns={columns}
            data={filtered}
            pageSize={10}
            onRowClick={(row) => row.userId && navigate(`/users/${row.userId}`)}
            emptyMessage={loading ? 'Loading...' : 'No trust ledger entries found.'}
          />
        </div>
      </div>

      <div className="card mt-4">
        <div className="card-body" style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          <div><strong>Note:</strong> The trust ledger serves as the platform-level escrow account holding all client payments and security deposits. Balances are updated automatically as transactions are processed.</div>
        </div>
      </div>
    </div>
  );
}
