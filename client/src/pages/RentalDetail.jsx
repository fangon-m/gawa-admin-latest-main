import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { usePermissions } from '../utils/permissions';
import { useApiData, useMutation } from '../utils/useApiData';
import { getById as getRentalById, flag as flagRental, remove as removeRental } from '../api/rentals';
import { formatDateTime, formatCurrency } from '../utils/helpers';
import Header from '../components/layout/Header';
import StatusBadge from '../components/common/StatusBadge';
import ConfirmModal from '../components/common/ConfirmModal';
import { Calendar, User, Package, PhilippinePeso, Shield, Flag, Trash2 } from 'lucide-react';

export default function RentalDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { can } = usePermissions(currentUser?.role);
  const { addNotification } = useNotifications();
  const [showConfirm, setShowConfirm] = useState(null);
  const [removeConfirmText, setRemoveConfirmText] = useState('');

  if (!id || id === 'undefined' || id === 'null') {
    return (
      <div>
        <Header title="Rental Not Found" />
        <div className="empty-state">
          <div className="empty-state-text">Rental not found</div>
          <button className="btn btn-outline mt-4" onClick={() => navigate('/rentals')}>Back to Rentals</button>
        </div>
      </div>
    );
  }

  const { data: rental, loading, error, refetch } = useApiData(() => getRentalById(id), [id], {
    defaultValue: null,
    transform: (r) => r?.data ?? r,
  });

  const [doFlag] = useMutation(flagRental);
  const [doRemove] = useMutation(removeRental);

  const handleAction = async (action) => {
    try {
      if (action === 'flag') {
        await doFlag(id);
      } else if (action === 'remove') {
        await doRemove(id);
        setShowConfirm(null);
        navigate('/rentals');
        return;
      }
      setShowConfirm(null);
      refetch();
    } catch (err) { console.error('Rental action failed:', err); }
  };

  if (loading) {
    return (
      <div>
        <Header title="Rental" />
        <div className="page-loading"><div className="page-loading__spinner" /></div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Header title="Error Loading Rental" />
        <div className="empty-state">
          <div className="empty-state-text">Error loading rental: {error}</div>
          <button className="btn btn-outline mt-4" onClick={() => navigate('/rentals')}>Back to Rentals</button>
        </div>
      </div>
    );
  }

  if (!rental) {
    return (
      <div>
        <Header title="Rental Not Found" />
        <div className="empty-state">
          <div className="empty-state-text">Rental not found</div>
          <button className="btn btn-outline mt-4" onClick={() => navigate('/rentals')}>Back to Rentals</button>
        </div>
      </div>
    );
  }

  const isCompleted = rental.rentalStatus === 'completed';

  return (
    <div>
      <Header title={`Rental ${rental.rentalId?.slice(0, 8) || rental.id?.slice(0, 8)}`} />
      <div className="card mb-4">
        <div className="card-body" style={{ padding: 'var(--space-3) var(--space-5)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>{rental.listingTitle}</h2>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', color: 'var(--color-text-muted)', fontSize: 13, marginTop: 2 }}>
                <span>by {rental.ownerName}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.375rem' }}>
              {can('flagRental') && <button className="btn btn-outline btn-sm" onClick={() => setShowConfirm('flag')}>Flag</button>}
              {can('removeRental') && <button className="btn btn-danger btn-sm" onClick={() => setShowConfirm('remove')}>Remove</button>}
              <button className="btn btn-accent btn-sm" onClick={() => navigate('/messages')}>Message</button>
            </div>
          </div>

          <div className="detail-grid" style={{ gap: 'var(--space-3)' }}>
            <div className="detail-field"><div className="detail-label">Status</div><div className="detail-value"><StatusBadge status={rental.rentalStatus} /></div></div>
            <div className="detail-field"><div className="detail-label">Renter</div><div className="detail-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <User size={14} />
              <span className="cell-link" onClick={() => navigate(`/users/${rental.renterId}`)}>{rental.renterName}</span>
            </div></div>
            <div className="detail-field"><div className="detail-label">Owner</div><div className="detail-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <User size={14} />
              <span className="cell-link" onClick={() => navigate(`/users/${rental.ownerId}`)}>{rental.ownerName}</span>
            </div></div>
            <div className="detail-field"><div className="detail-label">Rental Period</div><div className="detail-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calendar size={14} />
              {formatDateTime(rental.startDate)} - {formatDateTime(rental.endDate)}
            </div></div>
            <div className="detail-field"><div className="detail-label">Total Amount</div><div className="detail-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <PhilippinePeso size={14} /> {formatCurrency(rental.totalPrice)}
            </div></div>
            <div className="detail-field"><div className="detail-label">Created</div><div className="detail-value">{formatDateTime(rental.createdAt)}</div></div>
          </div>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-header"><h3><Shield size={16} style={{ marginRight: 6 }} />Deposit Information</h3></div>
        <div className="card-body">
          <div className="detail-grid">
            <div className="detail-field">
              <div className="detail-label">Deposit Paid</div>
              <div className="detail-value">{formatCurrency(rental.securityDepositPaid)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3>Timeline</h3></div>
        <div className="card-body">
          <div className="case-timeline">
            <div className="timeline-item">
              <div className="timeline-dot completed" />
              <div className="timeline-date">{formatDateTime(rental.createdAt)}</div>
              <div className="timeline-title">Rental Created</div>
            </div>
            <div className="timeline-item">
              <div className={`timeline-dot ${rental.rentalStatus !== 'active' ? 'completed' : ''}`} />
              <div className="timeline-date">{formatDateTime(rental.startDate)}</div>
              <div className="timeline-title">Rental Started</div>
            </div>
            <div className="timeline-item">
              <div className={`timeline-dot ${isCompleted ? 'completed' : ''}`} />
              <div className="timeline-date">{formatDateTime(rental.endDate)}</div>
              <div className="timeline-title">Rental Ended</div>
            </div>
          </div>
        </div>
      </div>

      {showConfirm === 'remove' ? (
        <div className="modal-overlay" onClick={() => { setShowConfirm(null); setRemoveConfirmText(''); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Remove Rental</h3>
              <button className="modal-close" onClick={() => { setShowConfirm(null); setRemoveConfirmText(''); }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="modal-body">
              <div style={{ padding: '0.75rem', background: 'var(--color-error-subtle, #fee2e2)', borderRadius: 'var(--radius-md)', marginBottom: '1rem', border: '1px solid var(--color-error)', color: 'var(--color-error)' }}>
                <strong>This action cannot be undone.</strong> The rental record will be permanently deleted.
              </div>
              <p style={{ color: 'var(--color-text-muted)', lineHeight: 1.6, marginBottom: '0.75rem' }}>
                To confirm, type the equipment name <strong>"{rental.listingTitle}"</strong> below:
              </p>
              <input
                type="text"
                className="form-input"
                placeholder={`Type "${rental.listingTitle}" to confirm`}
                value={removeConfirmText}
                onChange={(e) => setRemoveConfirmText(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '0.5rem',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg)',
                  color: 'var(--color-text)',
                  fontSize: '0.875rem',
                }}
                autoFocus
              />
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => { setShowConfirm(null); setRemoveConfirmText(''); }}>Cancel</button>
              <button
                className="btn btn-danger"
                disabled={removeConfirmText !== rental.listingTitle}
                onClick={() => {
                  if (removeConfirmText === rental.listingTitle) {
                    handleAction('remove');
                    setRemoveConfirmText('');
                  }
                }}
              >
                Remove Rental
              </button>
            </div>
          </div>
        </div>
      ) : (
        <ConfirmModal
          open={showConfirm === 'flag'}
          title="Flag Rental"
          message="Flag this rental for review?"
          confirmLabel="Flag"
          variant="warning"
          onConfirm={() => handleAction('flag')}
          onCancel={() => setShowConfirm(null)}
        />
      )}
    </div>
  );
}