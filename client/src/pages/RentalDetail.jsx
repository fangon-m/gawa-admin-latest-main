import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApiData } from '../utils/useApiData';
import { getById as getRentalById, receiveEquipment as receiveEqp, returnEquipment as returnEqp } from '../api/rentals';
import { formatDateTime, formatCurrency } from '../utils/helpers';
import Header from '../components/layout/Header';
import StatusBadge from '../components/common/StatusBadge';
import EvidenceGallery from '../components/common/EvidenceGallery';
import { Calendar, User, Package, PhilippinePeso, Shield, RotateCcw } from 'lucide-react';

export default function RentalDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  // Guard against missing or invalid IDs
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

  const { data: rental, loading, refetch } = useApiData(() => getRentalById(id), [id], {
    defaultValue: null,
    transform: (r) => r?.data ?? r,
  });

  if (loading) {
    return (
      <div>
        <Header title="Rental" />
        <div className="page-loading"><div className="page-loading__spinner" /></div>
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

  return (
    <div>
      <Header title={`Rental ${rental.id}`} />
      <div className="card mb-4">
        <div className="card-body">
          <div className="detail-grid">
            <div className="detail-field">
              <div className="detail-label">Equipment</div>
              <div className="detail-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Package size={14} /> {rental.listingTitle}
              </div>
            </div>
            <div className="detail-field">
              <div className="detail-label">Status</div>
              <div className="detail-value"><StatusBadge status={rental.status} /></div>
            </div>
            <div className="detail-field">
              <div className="detail-label">Renter</div>
              <div className="detail-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <User size={14} />
                <span className="cell-link" onClick={() => navigate(`/users/${rental.renterId}`)}>{rental.renterName}</span>
              </div>
            </div>
            <div className="detail-field">
              <div className="detail-label">Owner</div>
              <div className="detail-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <User size={14} />
                <span className="cell-link" onClick={() => navigate(`/users/${rental.ownerId}`)}>{rental.ownerName}</span>
              </div>
            </div>
            <div className="detail-field">
              <div className="detail-label">Rental Period</div>
              <div className="detail-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Calendar size={14} />
                {formatDateTime(rental.startDate)} - {formatDateTime(rental.endDate)}
              </div>
            </div>
            <div className="detail-field">
              <div className="detail-label">Total Amount</div>
              <div className="detail-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <PhilippinePeso size={14} /> {formatCurrency(rental.totalAmount)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-header"><h3><Shield size={16} style={{ marginRight: 6 }} />Deposit Information</h3></div>
        <div className="card-body">
          <div className="detail-grid">
            <div className="detail-field">
              <div className="detail-label">Deposit Amount</div>
              <div className="detail-value">{formatCurrency(rental.depositAmount)}</div>
            </div>
            <div className="detail-field">
              <div className="detail-label">Deposit Status</div>
              <div className="detail-value"><StatusBadge status={rental.depositStatus} /></div>
            </div>
          </div>
          {rental.damageReport && (
            <div className="detail-field" style={{ marginTop: 16 }}>
              <div className="detail-label">Damage Report</div>
              <div className="detail-value" style={{ color: 'var(--color-error)', marginTop: 4 }}>{rental.damageReport}</div>
            </div>
          )}
          {(() => {
            const images = [];
            const rr = rental.returnRecord;
            if (rr?.supportingImagesUrl?.length) images.push(...rr.supportingImagesUrl.map((u) => (typeof u === 'string' ? { url: u, label: 'Return Image' } : u)));
            if (rr?.supportingImages?.length) images.push(...rr.supportingImages.map((u) => (typeof u === 'string' ? { url: u, label: 'Return Image' } : u)));
            return images.length > 0 ? (
              <div style={{ marginTop: '0.75rem' }}>
                <div className="detail-label" style={{ marginBottom: '0.375rem' }}>Supporting Images</div>
                <EvidenceGallery items={images} />
              </div>
            ) : null;
          })()}
        </div>
      </div>

      {rental.status === 'pending' && (
        <div className="card mb-4">
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Receive Equipment</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Mark equipment as received by the renter</div>
            </div>
            <button
              className="btn btn-accent"
              onClick={async () => {
                try {
                  await receiveEqp(id);
                  refetch();
                } catch (err) { console.error('Receive equipment failed:', err); }
              }}
            >
              <Package size={14} style={{ marginRight: 6 }} /> Receive
            </button>
          </div>
        </div>
      )}

      {rental.status === 'active' && (
        <div className="card mb-4">
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Return Equipment</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Mark equipment as returned by the renter</div>
            </div>
            <button
              className="btn btn-accent"
              onClick={async () => {
                try {
                  await returnEqp(id, { itemCondition: 'Returned' });
                  refetch();
                } catch (err) { console.error('Return equipment failed:', err); }
              }}
            >
              <RotateCcw size={14} style={{ marginRight: 6 }} /> Return
            </button>
          </div>
        </div>
      )}

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
              <div className={`timeline-dot ${rental.status !== 'pending' ? 'completed' : ''}`} />
              <div className="timeline-date">{formatDateTime(rental.startDate)}</div>
              <div className="timeline-title">Rental Started</div>
            </div>
            <div className="timeline-item">
              <div className={`timeline-dot ${rental.status === 'completed' ? 'completed' : ''}`} />
              <div className="timeline-date">{formatDateTime(rental.endDate)}</div>
              <div className="timeline-title">Rental Ended</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
