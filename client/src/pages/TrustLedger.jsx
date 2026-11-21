import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../utils/permissions';
import { useApiData } from '../utils/useApiData';
import { get, post } from '../api/client';
import { formatDate, formatDateTime, formatCurrency, formatNumber, userEntityPath, formatEntityIdNumeric } from '../utils/helpers';
import Header from '../components/layout/Header';
import FilterBar from '../components/common/FilterBar';
import DataTable from '../components/common/DataTable';
import StatusBadge from '../components/common/StatusBadge';
import StatCard from '../components/common/StatCard';
import { Landmark, ArrowDownToLine, ArrowUpFromLine, RotateCcw, PiggyBank, Lock, Clock, X } from 'lucide-react';

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
  const [releaseTarget, setReleaseTarget] = useState(null);
  const [recipient, setRecipient] = useState('');
  const [releaseReason, setReleaseReason] = useState('');
  const [releaseError, setReleaseError] = useState('');
  const [releasing, setReleasing] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);

  const { data: ledgerData, loading, error, refetch } = useApiData(async () => {
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

  const openRelease = (row) => {
    setReleaseTarget(row);
    setRecipient(row.suggestedRecipient || '');
    setReleaseReason('');
    setReleaseError('');
    setPreviewImage(null);
  };

  const closeRelease = () => {
    if (releasing) return;
    setReleaseTarget(null);
    setPreviewImage(null);
  };

  const needsReason = !!releaseTarget &&
    (!releaseTarget.suggestedRecipient || recipient !== releaseTarget.suggestedRecipient);

  const handleReleaseSubmit = async (event) => {
    event.preventDefault();
    if (!releaseTarget || !recipient || (needsReason && !releaseReason.trim())) return;
    setReleasing(true);
    setReleaseError('');
    try {
      await post(`/trust-ledger/${releaseTarget.releaseTransactionId}/release`, {
        recipient,
        reason: releaseReason.trim(),
      });
      closeRelease();
      refetch();
    } catch (err) {
      setReleaseError(err?.error || err?.message || 'Failed to release funds. Please try again.');
      setReleasing(false);
    }
  };

  const columns = [
    { key: 'displayId', label: 'ID', render: (row) => <span className="text-xs text-muted font-mono">{formatEntityIdNumeric(row.id, 'TXN-')}</span> },
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
      key: 'releasedTo', label: 'Released To', render: (row) => {
        if (!row.releasedTo) return '-';
        return (
          <div>
            <div style={{ fontWeight: 600 }}>{row.releasedToName || '-'}</div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
              {row.releasedTo === 'owner' ? 'Owner' : 'Client (renter)'}
            </div>
          </div>
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
              onClick={(e) => { e.stopPropagation(); openRelease(row); }}
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
            loading={loading}
            pageSize={10}
            onRowClick={(row) => row.userId && navigate(userEntityPath(row.userId))}
            emptyMessage={loading ? 'Loading...' : 'No trust ledger entries found.'}
          />
        </div>
      </div>

      {releaseTarget && (
        <div className="modal-overlay" onClick={closeRelease}>
          <div className="modal" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 560 }}>
            <form onSubmit={handleReleaseSubmit}>
              <div className="modal-header">
                <h3>Release equipment security deposit</h3>
                <button type="button" className="modal-close" onClick={closeRelease} disabled={releasing}>
                  <X size={16} />
                </button>
              </div>
              <div className="modal-body">
                <div className="detail-grid" style={{ marginBottom: '1rem' }}>
                  <div className="detail-field"><div className="detail-label">Amount</div><div className="detail-value">{formatCurrency(releaseTarget.amount)}</div></div>
                  <div className="detail-field"><div className="detail-label">Client (renter)</div><div className="detail-value">{releaseTarget.userName}</div></div>
                  <div className="detail-field"><div className="detail-label">Owner</div><div className="detail-value">{releaseTarget.ownerName || '-'}</div></div>
                  <div className="detail-field">
                    <div className="detail-label">Return condition</div>
                    <div className="detail-value">
                      {releaseTarget.returnCondition
                        ? <StatusBadge
                            status={releaseTarget.returnCondition === 'damaged' ? 'flagged' : 'active'}
                            label={releaseTarget.returnCondition === 'damaged' ? 'Damaged' : 'No damage'}
                          />
                        : <span style={{ color: 'var(--color-text-muted)' }}>Not recorded</span>}
                    </div>
                  </div>
                </div>

                <div className="detail-label mb-2">Supporting return images</div>
                {releaseTarget.returnDamageImagesUrl?.length ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1rem' }}>
                    {releaseTarget.returnDamageImagesUrl.map((url, index) => (
                      <button
                        key={`${url}-${index}`}
                        type="button"
                        title="View supporting image"
                        onClick={() => setPreviewImage(url)}
                        style={{ padding: 0, border: '1px solid var(--color-border)', borderRadius: 6, background: 'none', cursor: 'pointer' }}
                      >
                        <img src={url} alt={`Return evidence ${index + 1}`} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6 }} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted" style={{ marginBottom: '1rem' }}>No supporting images were submitted.</p>
                )}

                <div className="detail-label mb-2">Release to</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { value: 'renter', label: 'Client (renter)', hint: 'Refund the deposit — the item was returned with no damage' },
                    { value: 'owner', label: 'Owner', hint: 'Pay the owner — the item was returned damaged' },
                  ].map((option) => (
                    <label
                      key={option.value}
                      style={{
                        display: 'flex', gap: 8, alignItems: 'flex-start', padding: 10, cursor: 'pointer',
                        border: `1px solid ${recipient === option.value ? 'var(--color-accent)' : 'var(--color-border)'}`,
                        borderRadius: 8,
                      }}
                    >
                      <input
                        type="radio"
                        name="deposit-recipient"
                        value={option.value}
                        checked={recipient === option.value}
                        onChange={() => setRecipient(option.value)}
                        disabled={releasing}
                        style={{ marginTop: 2 }}
                      />
                      <span>
                        <strong>{option.label}</strong>
                        {releaseTarget.suggestedRecipient === option.value && (
                          <span className="status-badge status-active" style={{ marginLeft: 6, fontSize: 11 }}>Recommended</span>
                        )}
                        <span className="text-sm text-muted" style={{ display: 'block' }}>{option.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>

                <label className="form-label" htmlFor="deposit-release-reason" style={{ marginTop: '1rem' }}>
                  Reason {needsReason && <span style={{ color: 'var(--color-error)' }}>*</span>}
                </label>
                <textarea
                  id="deposit-release-reason"
                  className="form-input"
                  rows={2}
                  value={releaseReason}
                  onChange={(event) => setReleaseReason(event.target.value)}
                  placeholder="Required when overriding the return condition"
                  disabled={releasing}
                  style={{ width: '100%', resize: 'vertical' }}
                />
                {releaseError && <div className="alert alert-error" role="alert" style={{ marginTop: 8 }}>{releaseError}</div>}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={closeRelease} disabled={releasing}>Cancel</button>
                <button type="submit" className="btn btn-accent" disabled={releasing || !recipient || (needsReason && !releaseReason.trim())}>
                  {releasing && <span className="loading-spinner loading-spinner--inline" aria-hidden="true" />}
                  {releasing ? 'Releasing...' : 'Confirm release'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {previewImage && (
        <div className="modal-overlay" onClick={() => setPreviewImage(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 720 }}>
            <div className="modal-header">
              <h3>Return evidence</h3>
              <button type="button" className="modal-close" onClick={() => setPreviewImage(null)}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center' }}>
              <img src={previewImage} alt="Return evidence" style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }} />
            </div>
          </div>
        </div>
      )}

      <div className="card mt-4">
        <div className="card-body" style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          <div><strong>Note:</strong> The trust ledger serves as the platform-level escrow account holding all client payments and security deposits. Balances are updated automatically as transactions are processed.</div>
        </div>
      </div>
    </div>
  );
}
