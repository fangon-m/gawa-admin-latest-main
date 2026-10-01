import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getById as getTransactionById, releaseEscrow, processRefund, approvePayout } from '../api/transactions';
import { useApiData } from '../utils/useApiData';
import { usePermissions } from '../utils/permissions';
import { useAuth } from '../context/AuthContext';
import { formatDateTime, formatCurrency, formatEntityIdNumeric } from '../utils/helpers';
import Header from '../components/layout/Header';
import StatusBadge from '../components/common/StatusBadge';
import ConfirmModal from '../components/common/ConfirmModal';

export default function TransactionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can } = usePermissions(user?.role);
  const [modal, setModal] = useState(null);

  // Guard against missing or invalid IDs
  if (!id || id === 'undefined' || id === 'null') {
    return (
      <div>
        <Header title="Transaction Not Found" />
        <div className="empty-state">
          <div className="empty-state-text">Transaction not found</div>
          <button className="btn btn-outline mt-4" onClick={() => navigate('/transactions')}>Back to Transactions</button>
        </div>
      </div>
    );
  }

  const { data: txn, loading, refetch } = useApiData(() => getTransactionById(id), [id], {
    defaultValue: null,
    transform: (r) => r?.data ?? r,
  });

  const handleReleaseEscrow = async () => {
    try { await releaseEscrow(id); setModal(null); refetch(); } catch (err) { console.error('Release escrow failed:', err); }
  };

  const handleProcessRefund = async () => {
    try { await processRefund(id, {}); setModal(null); refetch(); } catch (err) { console.error('Process refund failed:', err); }
  };

  const handleApprovePayout = async () => {
    try { await approvePayout(id); setModal(null); refetch(); } catch (err) { console.error('Approve payout failed:', err); }
  };

  if (loading) {
    return (
      <div>
        <Header title="Transaction" />
        <div className="page-loading"><div className="page-loading__spinner" /></div>
      </div>
    );
  }

  if (!txn) {
    return (
      <div>
        <Header title="Transaction Not Found" />
        <div className="empty-state">
          <div className="empty-state-text">Transaction not found</div>
          <button className="btn btn-outline mt-4" onClick={() => navigate('/transactions')}>Back to Transactions</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title={`Transaction ${formatEntityIdNumeric(txn.id, 'TXN-')}`} />
      <div className="card mb-4">
        <div className="card-body">
          <div className="detail-grid">
            <div className="detail-field"><div className="detail-label">Transaction ID</div><div className="detail-value font-mono">{formatEntityIdNumeric(txn.id, 'TXN-')}</div></div>
            <div className="detail-field"><div className="detail-label">Type</div><div className="detail-value"><StatusBadge status={txn.type} /></div></div>
            <div className="detail-field"><div className="detail-label">Direction</div><div className="detail-value"><StatusBadge status={txn.direction === 'in' ? 'in' : 'out'} /></div></div>
            <div className="detail-field"><div className="detail-label">Amount</div><div className="detail-value">{formatCurrency(txn.amount)}</div></div>
            <div className="detail-field"><div className="detail-label">Fee</div><div className="detail-value">{formatCurrency(txn.fee || 0)}</div></div>
            <div className="detail-field"><div className="detail-label">Net Amount</div><div className="detail-value">{formatCurrency(txn.netAmount || txn.amount)}</div></div>
            <div className="detail-field"><div className="detail-label">Status</div><div className="detail-value"><StatusBadge status={txn.status} /></div></div>
            <div className="detail-field"><div className="detail-label">Payment Method</div><div className="detail-value">{txn.paymentMethod || 'N/A'}</div></div>
            <div className="detail-field"><div className="detail-label">Reference</div><div className="detail-value" style={{ fontSize: 13 }}>{txn.reference || 'N/A'}</div></div>
            <div className="detail-field"><div className="detail-label">User</div><div className="detail-value"><span className="cell-link" onClick={() => navigate(`/users/${txn.userId}`)}>{txn.userName || txn.userId}</span></div></div>
            <div className="detail-field"><div className="detail-label">Counterparty</div><div className="detail-value">{txn.counterpartyName || '—'}</div></div>
            <div className="detail-field"><div className="detail-label">Related</div><div className="detail-value">
              {txn.relatedTitle && txn.relatedId && txn.relatedType && (
                <span className="cell-link" onClick={() => {
                  if (txn.relatedType === 'job_post') navigate(`/jobs/${txn.relatedId}`);
                  else if (txn.relatedType === 'equipment_rental') navigate(`/rentals/${txn.relatedId}`);
                }}>{txn.relatedTitle}</span>
              )}
              {!txn.relatedTitle && '—'}
            </div></div>
            <div className="detail-field"><div className="detail-label">Date</div><div className="detail-value">{formatDateTime(txn.createdAt)}</div></div>
            <div className="detail-field"><div className="detail-label">Description</div><div className="detail-value" style={{ gridColumn: 'span 2' }}>{txn.description || 'N/A'}</div></div>
          </div>
        </div>
      </div>

      {(txn.status === 'escrow' || txn.status === 'held') && can('releaseEscrow') && (
        <div className="card mb-4">
          <div className="card-header"><h3>Escrow / Trust Ledger</h3></div>
          <div className="card-body">
            <button className="btn btn-success" onClick={() => setModal('release-escrow')}>
              Release Escrow
            </button>
          </div>
        </div>
      )}

      {txn.type === 'payout' && txn.status === 'pending' && can('approvePayout') && (
        <div className="card mb-4">
          <div className="card-header"><h3>Payout Action Required</h3></div>
          <div className="card-body">
            <button className="btn btn-success" onClick={() => setModal('approve-payout')}>
              Approve Payout
            </button>
          </div>
        </div>
      )}

      {txn.type !== 'refund' && txn.type !== 'deposit' && txn.type !== 'payout' && txn.status === 'completed' && can('processRefund') && (
        <div className="card mb-4">
          <div className="card-header"><h3>Actions</h3></div>
          <div className="card-body">
            <button className="btn btn-accent" onClick={() => setModal('refund')}>
              Initiate Refund
            </button>
          </div>
        </div>
      )}

      <ConfirmModal open={modal === 'release-escrow'} title="Release Escrow"
        message={`Release ${formatCurrency(txn.amount)} from escrow?`}
        confirmLabel="Release" variant="success" onConfirm={handleReleaseEscrow} onCancel={() => setModal(null)} />
      <ConfirmModal open={modal === 'refund'} title="Process Refund"
        message={`Refund ${formatCurrency(txn.amount)} to user?`}
        confirmLabel="Process Refund" variant="accent" onConfirm={handleProcessRefund} onCancel={() => setModal(null)} />
      <ConfirmModal open={modal === 'approve-payout'} title="Approve Payout"
        message={`Approve payout of ${formatCurrency(txn.amount)}?`}
        confirmLabel="Approve" variant="success" onConfirm={handleApprovePayout} onCancel={() => setModal(null)} />
    </div>
  );
}
