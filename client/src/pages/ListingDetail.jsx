import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../utils/permissions';
import { useApiData } from '../utils/useApiData';
import { getById as getListingById, flag as flagListing, remove as removeListing } from '../api/listings';
import * as rentalsApi from '../api/rentals';
import { formatDate, formatCurrency } from '../utils/helpers';
import Header from '../components/layout/Header';
import StatusBadge from '../components/common/StatusBadge';
import DataTable from '../components/common/DataTable';
import NotesPanel from '../components/common/NotesPanel';
import EvidenceGallery from '../components/common/EvidenceGallery';
import ConfirmModal from '../components/common/ConfirmModal';

export default function ListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { can } = usePermissions(currentUser?.role);
  const [showConfirm, setShowConfirm] = useState(null);
  const [removeConfirmText, setRemoveConfirmText] = useState('');

  // Guard against missing or invalid IDs
  if (!id || id === 'undefined' || id === 'null') {
    return (
      <div>
        <Header title="Listing Not Found" />
        <div className="empty-state">
          <div className="empty-state-text">Listing not found</div>
          <button className="btn btn-outline mt-4" onClick={() => navigate('/listings')}>Back to Listings</button>
        </div>
      </div>
    );
  }

  const { data: listing, loading, refetch } = useApiData(() => getListingById(id), [id], {
    defaultValue: null,
    transform: (r) => r?.data ?? r,
  });
  const { data: rentals } = useApiData(() => rentalsApi.list({ listingId: id, limit: 50 }), [id], {
    defaultValue: [],
    transform: (r) => r?.data ?? r ?? [],
  });

  if (loading) {
    return (
      <div>
        <Header title="Equipment Listing" />
        <div className="page-loading"><div className="page-loading__spinner" /></div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div>
        <Header title="Listing Not Found" />
        <div className="empty-state">
          <div className="empty-state-text">Equipment listing not found</div>
          <button className="btn btn-outline mt-4" onClick={() => navigate('/listings')}>Back to Listings</button>
        </div>
      </div>
    );
  }

  const handleAction = async (action) => {
    try {
      if (action === 'flag') await flagListing(id);
      else if (action === 'remove') await removeListing(id);
      refetch();
    } catch (err) { console.error('Listing action failed:', err); }
    setShowConfirm(null);
  };

  return (
    <div>
      <Header title={listing.equipmentName} />
      <div className="card">
        <div className="card-body" style={{ padding: 'var(--space-3) var(--space-5)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>{listing.equipmentName}</h2>
              <div style={{ display: 'flex', gap: '0.5rem', color: 'var(--color-text-muted)', fontSize: 13, marginTop: 2 }}>
                <span>by <span className="cell-link" onClick={() => navigate(`/users/${listing.ownerId}`)}>{listing.ownerName}</span></span>
                {listing.equipmentCondition && <span>{listing.equipmentCondition}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.375rem' }}>
              {can('flagListing') && <button className="btn btn-outline btn-sm" onClick={() => setShowConfirm('flag')}>Flag</button>}
              {can('removeListing') && <button className="btn btn-danger btn-sm" onClick={() => setShowConfirm('remove')}>Remove</button>}
              <button className="btn btn-accent btn-sm" onClick={() => navigate('/messages')}>Message</button>
            </div>
          </div>

          <div className="detail-grid" style={{ gap: 'var(--space-3)' }}>
            <div className="detail-field"><div className="detail-label">Status</div><div className="detail-value"><StatusBadge status={listing.status} /></div></div>
            <div className="detail-field"><div className="detail-label">Day Pricing</div><div className="detail-value">{formatCurrency(listing.dayPricing)}</div></div>
            <div className="detail-field"><div className="detail-label">Week Pricing</div><div className="detail-value">{formatCurrency(listing.weekPricing)}</div></div>
            <div className="detail-field"><div className="detail-label">Stock</div><div className="detail-value">{listing.stock ?? 1}</div></div>
            <div className="detail-field"><div className="detail-label">Available Items</div><div className="detail-value">{listing.numberOfItems || 0}</div></div>
            <div className="detail-field"><div className="detail-label">Condition</div><div className="detail-value">{listing.equipmentCondition || 'N/A'}</div></div>
            <div className="detail-field"><div className="detail-label">Size</div><div className="detail-value">{listing.size || 'N/A'}</div></div>
            <div className="detail-field"><div className="detail-label">Weight</div><div className="detail-value">{listing.weight ? `${listing.weight} kg` : 'N/A'}</div></div>
            <div className="detail-field"><div className="detail-label">Skill Level</div><div className="detail-value">{listing.skillLevel || 'N/A'}</div></div>
            <div className="detail-field"><div className="detail-label">Equipment Value</div><div className="detail-value">{listing.equipmentValue ? formatCurrency(listing.equipmentValue) : 'N/A'}</div></div>
            <div className="detail-field"><div className="detail-label">Security Deposit</div><div className="detail-value">{listing.securityDeposit ? formatCurrency(listing.securityDeposit) : 'N/A'}</div></div>
            <div className="detail-field"><div className="detail-label">Payment Method</div><div className="detail-value">{listing.paymentMethod || 'Not specified'}</div></div>
            <div className="detail-field"><div className="detail-label">Created</div><div className="detail-value">{formatDate(listing.createdAt)}</div></div>
            <div className="detail-field"><div className="detail-label">Flags</div><div className="detail-value">{listing.flags?.length > 0 ? <StatusBadge status="flagged" label={listing.flags.length} /> : 'None'}</div></div>
          </div>
          {listing.equipmentDescription && (
            <div style={{ marginTop: '0.5rem' }}>
              <div className="detail-label" style={{ marginBottom: '0.25rem' }}>Description</div>
              <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-muted)' }}>{listing.equipmentDescription}</p>
            </div>
          )}
          {listing.equipmentImagesUrl?.length > 0 && (
            <div style={{ marginTop: '0.75rem' }}>
              <div className="detail-label" style={{ marginBottom: '0.375rem' }}>Images</div>
              <EvidenceGallery items={listing.equipmentImagesUrl.map((u) => (typeof u === 'string' ? { url: u, label: 'Equipment Image' } : u))} />
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 'var(--space-3)' }}>
        <div className="card-header"><h3>Rental History</h3></div>
        <div className="card-body" style={{ padding: 0 }}>
          <DataTable
            columns={[
              { key: 'renterName', label: 'Renter' },
              { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
              { key: 'totalAmount', label: 'Amount', render: (row) => formatCurrency(row.totalAmount) },
              { key: 'startDate', label: 'Start', render: (row) => formatDate(row.startDate) },
              { key: 'endDate', label: 'End', render: (row) => formatDate(row.endDate) },
            ]}
            data={rentals}
            emptyMessage="No rental history."
            pageSize={5}
          />
        </div>
      </div>

      {showConfirm === 'remove' ? (
        <div className="modal-overlay" onClick={() => { setShowConfirm(null); setRemoveConfirmText(''); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Remove Equipment Listing</h3>
              <button className="modal-close" onClick={() => { setShowConfirm(null); setRemoveConfirmText(''); }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="modal-body">
              <div style={{ padding: '0.75rem', background: 'var(--color-error-subtle, #fee2e2)', borderRadius: 'var(--radius-md)', marginBottom: '1rem', border: '1px solid var(--color-error)', color: 'var(--color-error)' }}>
                <strong>This action cannot be undone.</strong> The listing and all associated rental data will be removed.
              </div>
              <p style={{ color: 'var(--color-text-muted)', lineHeight: 1.6, marginBottom: '0.75rem' }}>
                To confirm, type the equipment name <strong>"{listing.equipmentName}"</strong> below:
              </p>
              <input
                type="text"
                className="form-input"
                placeholder={`Type "${listing.equipmentName}" to confirm`}
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
                disabled={removeConfirmText !== listing?.equipmentName}
                onClick={() => {
                  if (removeConfirmText === listing?.equipmentName) {
                    handleAction('remove');
                    setRemoveConfirmText('');
                  }
                }}
              >
                Remove Listing
              </button>
            </div>
          </div>
        </div>
      ) : (
        <ConfirmModal
          open={!!showConfirm}
          title="Flag Equipment Listing"
          message="Flag this listing for review?"
          confirmLabel="Flag"
          variant="warning"
          onConfirm={() => handleAction('flag')}
          onCancel={() => setShowConfirm(null)}
        />
      )}
    </div>
  );
}
