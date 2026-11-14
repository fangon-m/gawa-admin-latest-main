import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { usePermissions } from '../utils/permissions';
import { useApiData } from '../utils/useApiData';
import { getById as getListingById, flag as flagListing, remove as removeListing } from '../api/listings';
import * as flagsApi from '../api/flags';
import * as rentalsApi from '../api/rentals';
import { formatDate, formatCurrency, userEntityPath, listingEntityPath } from '../utils/helpers';
import Header from '../components/layout/Header';
import StatusBadge from '../components/common/StatusBadge';
import DataTable from '../components/common/DataTable';
import EvidenceGallery from '../components/common/EvidenceGallery';

export default function ListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { can } = usePermissions(currentUser?.role);
  const { addNotification } = useNotifications();
  const [showConfirm, setShowConfirm] = useState(null);
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [flagReason, setFlagReason] = useState('');
  const [flagSubmitting, setFlagSubmitting] = useState(false);
  const [flagError, setFlagError] = useState('');
  const [flagActionModal, setFlagActionModal] = useState(null);
  const [flagActionNote, setFlagActionNote] = useState('');
  const [flagActionSubmitting, setFlagActionSubmitting] = useState(false);
  const [flagActionError, setFlagActionError] = useState('');
  const [removeConfirmText, setRemoveConfirmText] = useState('');
  const [removeError, setRemoveError] = useState('');

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
  // The route carries the friendly ID (LST-123456); data calls need the UUID.
  const listingId = listing?.listingId || id;
  const { data: rentals } = useApiData(() => rentalsApi.list({ listingId, limit: 50 }), [listingId], {
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

  const visibleFlags = (listing.flags || []).filter((flag) => flag.status !== 'dismissed');

  const handleFlagSubmit = async (event) => {
    event.preventDefault();
    const reason = flagReason.trim();
    if (!reason || flagSubmitting) return;
    setFlagSubmitting(true);
    setFlagError('');
    try {
      await flagListing(listingId, { reason });
      setShowFlagModal(false);
      setFlagReason('');
      addNotification('moderation_decision', 'Listing Flagged', `"${listing.equipmentName}" was flagged for review`, listingEntityPath(listingId));
      refetch();
    } catch (err) {
      setFlagError(err?.error || err?.message || 'Failed to flag equipment listing');
    } finally {
      setFlagSubmitting(false);
    }
  };

  const closeFlagAction = () => {
    if (flagActionSubmitting) return;
    setFlagActionModal(null);
    setFlagActionNote('');
    setFlagActionError('');
  };

  const handleFlagAction = async (event) => {
    event.preventDefault();
    if (!flagActionModal || flagActionSubmitting) return;
    setFlagActionSubmitting(true);
    setFlagActionError('');
    const { flag, action } = flagActionModal;
    const note = flagActionNote.trim();
    try {
      if (action === 'dismiss') await flagsApi.dismiss(flag.flagId, { note });
      else await flagsApi.resolve(flag.flagId, { note });
      setFlagActionModal(null);
      setFlagActionNote('');
      addNotification('moderation_decision', 'Flag Updated', `A flag on "${listing.equipmentName}" was ${action}ed`, listingEntityPath(listingId));
      refetch();
    } catch (err) {
      setFlagActionError(err?.error || err?.message || 'Failed to update flag');
    } finally {
      setFlagActionSubmitting(false);
    }
  };

  const handleRemove = async () => {
    if (removeConfirmText !== listing.equipmentName) return;
    setRemoveError('');
    try {
      await removeListing(listingId);
      navigate('/listings');
    } catch (err) {
      setRemoveError(err?.error || err?.message || 'Failed to remove equipment listing');
    }
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
                <span>by <span className="cell-link" onClick={() => navigate(userEntityPath(listing.ownerId))}>{listing.ownerName}</span></span>
                {listing.equipmentCondition && <span>{listing.equipmentCondition}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.375rem' }}>
              {can('flagListing') && <button className="btn btn-outline btn-sm" onClick={() => { setFlagReason(''); setFlagError(''); setShowFlagModal(true); }}>Flag</button>}
              {can('removeListing') && <button className="btn btn-danger btn-sm" onClick={() => { setRemoveConfirmText(''); setRemoveError(''); setShowConfirm('remove'); }}>Remove</button>}
              <button className="btn btn-accent btn-sm" onClick={() => navigate('/messages')}>Message</button>
            </div>
          </div>

          <div className="detail-grid" style={{ gap: 'var(--space-3)' }}>
            <div className="detail-field"><div className="detail-label">Status</div><div className="detail-value" style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', flexWrap: 'wrap' }}><StatusBadge status={listing.status} />{listing.openFlagCount > 0 && <StatusBadge status="flagged" label={`Flagged (${listing.openFlagCount} open)`} />}</div></div>
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
            <div className="detail-field"><div className="detail-label">Moderation</div><div className="detail-value">{listing.openFlagCount > 0 ? <span style={{ color: 'var(--color-error)', fontWeight: 600 }}>{listing.openFlagCount} open flag{listing.openFlagCount === 1 ? '' : 's'}</span> : 'No open flags'}</div></div>
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
          {visibleFlags.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <div className="detail-label" style={{ marginBottom: '0.5rem' }}>Flags</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {visibleFlags.map((flag) => {
                  const isOpen = !flag.status || flag.status === 'open';
                  return (
                    <div key={flag.flagId || flag.id} style={{ padding: '0.75rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: isOpen ? 'var(--color-error-subtle, #fef2f2)' : 'var(--color-surface)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: 4 }}>
                        <StatusBadge status={isOpen ? 'flagged' : flag.status} label={isOpen ? 'Open' : flag.status} />
                        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{formatDate(flag.createdAt)}</span>
                      </div>
                      <div style={{ fontSize: 13, marginBottom: 4 }}><strong>Reason:</strong> {flag.reason || 'No reason provided'}</div>
                      {flag.resolutionNote && <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}><strong>Note:</strong> {flag.resolutionNote}</div>}
                      {isOpen && (
                        <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                          <button className="btn btn-outline btn-sm" onClick={() => { setFlagActionError(''); setFlagActionNote(''); setFlagActionModal({ flag, action: 'dismiss' }); }}>Dismiss</button>
                          <button className="btn btn-accent btn-sm" onClick={() => { setFlagActionError(''); setFlagActionNote(''); setFlagActionModal({ flag, action: 'resolve' }); }}>Resolve</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
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
              { key: 'rentalStatus', label: 'Status', render: (row) => <StatusBadge status={row.rentalStatus} /> },
              { key: 'totalPrice', label: 'Amount', render: (row) => formatCurrency(row.totalPrice) },
              { key: 'startDate', label: 'Start', render: (row) => formatDate(row.startDate) },
              { key: 'endDate', label: 'End', render: (row) => formatDate(row.endDate) },
            ]}
            data={rentals}
            emptyMessage="No rental history."
            pageSize={5}
          />
        </div>
      </div>

      {showConfirm === 'remove' && (
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
                    handleRemove();
                  }
                }}
              >
                Remove Listing
              </button>
            </div>
            {removeError && <div className="alert alert-error" role="alert">{removeError}</div>}
          </div>
        </div>
      )}
      {showFlagModal && (
        <div className="modal-overlay" onClick={() => !flagSubmitting && setShowFlagModal(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <form onSubmit={handleFlagSubmit}>
              <div className="modal-header">
                <h3>Flag Equipment Listing</h3>
                <button type="button" className="modal-close" onClick={() => !flagSubmitting && setShowFlagModal(false)}>×</button>
              </div>
              <div className="modal-body">
                <p style={{ color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
                  Flag <strong>{listing.equipmentName}</strong> for moderation review. The listing status will not change.
                </p>
                <label className="detail-label" htmlFor="listing-flag-reason" style={{ display: 'block', marginBottom: '0.375rem' }}>Reason</label>
                <textarea
                  id="listing-flag-reason"
                  className="form-input"
                  rows={4}
                  maxLength={2000}
                  value={flagReason}
                  onChange={(event) => setFlagReason(event.target.value)}
                  disabled={flagSubmitting}
                  required
                />
                {flagError && <div className="alert alert-error" role="alert" style={{ marginTop: '0.5rem' }}>{flagError}</div>}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowFlagModal(false)} disabled={flagSubmitting}>Cancel</button>
                <button type="submit" className="btn btn-accent" disabled={flagSubmitting || !flagReason.trim()}>
                  {flagSubmitting ? 'Flagging...' : 'Flag for review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {flagActionModal && (
        <div className="modal-overlay" onClick={closeFlagAction}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <form onSubmit={handleFlagAction}>
              <div className="modal-header">
                <h3>{flagActionModal.action === 'dismiss' ? 'Dismiss Flag' : 'Resolve Flag'}</h3>
                <button type="button" className="modal-close" onClick={closeFlagAction}>×</button>
              </div>
              <div className="modal-body">
                <p style={{ color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
                  {flagActionModal.action === 'dismiss'
                    ? 'Dismiss this flag as a false positive. The flag record will be kept for audit.'
                    : 'Mark this flag as handled. The flag record will be kept for audit.'}
                </p>
                <label className="detail-label" htmlFor="listing-flag-action-note" style={{ display: 'block', marginBottom: '0.375rem' }}>Note (optional)</label>
                <textarea
                  id="listing-flag-action-note"
                  className="form-input"
                  rows={3}
                  maxLength={2000}
                  value={flagActionNote}
                  onChange={(event) => setFlagActionNote(event.target.value)}
                  disabled={flagActionSubmitting}
                />
                {flagActionError && <div className="alert alert-error" role="alert" style={{ marginTop: '0.5rem' }}>{flagActionError}</div>}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={closeFlagAction} disabled={flagActionSubmitting}>Cancel</button>
                <button type="submit" className="btn btn-accent" disabled={flagActionSubmitting}>
                  {flagActionSubmitting ? 'Applying...' : flagActionModal.action === 'dismiss' ? 'Dismiss flag' : 'Resolve flag'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
