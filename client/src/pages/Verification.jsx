import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { usePermissions } from '../utils/permissions';
import { useApiData, useMutation } from '../utils/useApiData';
import { list as listVerifications, approve, reject } from '../api/verifications';
import { formatDateTime, capitalizeWords } from '../utils/helpers';
import Header from '../components/layout/Header';
import Tabs from '../components/common/Tabs';
import DataTable from '../components/common/DataTable';
import StatusBadge from '../components/common/StatusBadge';
import DetailPanel from '../components/common/DetailPanel';
import EvidenceGallery from '../components/common/EvidenceGallery';
import NotesPanel from '../components/common/NotesPanel';

const statusTabs = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

export default function Verification() {
  const { user: currentUser } = useAuth();
  const { can } = usePermissions(currentUser?.role);
  const { addNotification } = useNotifications();
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [rejectDialog, setRejectDialog] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data: verifications, loading, error, refetch } = useApiData(() => listVerifications({ limit: 100 }), [], {
    defaultValue: [],
    transform: (r) => r?.data ?? r ?? [],
  });

  const [doApprove] = useMutation(approve);
  const [doReject] = useMutation(reject);

  const filtered = useMemo(() => {
    let data = tab === 'all' ? verifications : verifications.filter((v) => v.status === tab);
    if (search) {
      const q = search.toLowerCase();
      data = data.filter((v) => v.userName?.toLowerCase().includes(q));
    }
    return data;
  }, [tab, search, verifications]); 

  const columns = [
    { key: 'userName', label: 'User', width: '40%', render: (row) => <span className="font-medium">{row.userName}</span> },
    { key: 'userRole', label: 'Role', width: '12%', render: (row) => <StatusBadge status={row.userRole} /> },
    { key: 'submittedAt', label: 'Submitted', width: '12%', render: (row) => formatDateTime(row.submittedAt) },
    { key: 'reviewedAt', label: 'Reviewed', width: '12%', render: (row) => (row.reviewedAt ? formatDateTime(row.reviewedAt) : '-') },
    { key: 'status', label: 'Status', width: '12%', render: (row) => <StatusBadge status={row.status} /> },
  ];

  const handleApprove = async (v) => {
    try {
      await doApprove(v.id);
      setSelected(null);
      addNotification('verification_approved', 'Verification Approved', `Verification approved for ${v.userName}`, `/users/${v.userId}`);
      refetch();
    } catch (err) { console.error('Approve verification failed:', err); }
  };

  const handleReject = (v) => {
    setSelected(null);
    setRejectDialog(v);
  };

  const confirmReject = async () => {
    if (!rejectDialog) return;
    try {
      const remarks = rejectReason.trim() || null;
      await doReject(rejectDialog.id, { remarks });
      addNotification('verification_rejected', 'Verification Rejected', `Verification rejected for ${rejectDialog.userName}${remarks ? `: ${remarks}` : ''}`, `/users/${rejectDialog.userId}`);
      setRejectDialog(null);
      setSelected(null);
      setRejectReason('');
      refetch();
    } catch (err) {
      console.error('Reject verification failed:', err);
      addNotification('verification_error', 'Rejection Failed', err?.error || err?.message || 'Unable to reject verification');
    }
  };

  return (
    <div>
      <Header title="Verification Management" onSearch={setSearch} />
      <Tabs tabs={statusTabs} activeTab={tab} onChange={setTab} />
      <div className="tab-content">
        {error && <div className="alert alert-error" role="alert">Unable to load verification requests: {error}</div>}
        <div className="card">
          <div className="card-body p-0">
            <DataTable
              columns={[
                ...columns,
                {
                  key: 'actions', label: 'Actions', width: '12%', render: (row) => (
                    <div className="table-actions">
                      <button className="btn btn-sm btn-outline" onClick={(e) => { e.stopPropagation(); setSelected(row); }}>View</button>
                      {tab === 'pending' && can('approveVerification') && <button className="btn btn-sm btn-success" onClick={(e) => { e.stopPropagation(); handleApprove(row); }}>Approve</button>}
                      {tab === 'pending' && can('rejectVerification') && <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); handleReject(row); }}>Reject</button>}
                    </div>
                  ),
                },
              ]}
              data={filtered}
              loading={loading}
              onRowClick={(row) => setSelected(row)}
              pageSize={10}
              emptyMessage="No verification requests found."
            />
          </div>
        </div>
      </div>

      <DetailPanel open={!!selected} onClose={() => setSelected(null)} title="Verification Details">
        {selected && (
          <div>
            <div className="detail-panel-section">
              <h4>User Information</h4>
              <div className="detail-field"><div className="detail-label">Name</div><div className="detail-value">{selected.userName}</div></div>
              <div className="detail-field"><div className="detail-label">Role</div><div className="detail-value">{capitalizeWords(selected.userRole)}</div></div>
              <div className="detail-field"><div className="detail-label">Submitted</div><div className="detail-value">{formatDateTime(selected.submittedAt)}</div></div>
              <div className="detail-field"><div className="detail-label">Status</div><div className="detail-value"><StatusBadge status={selected.status} /></div></div>
              {selected.reviewerName && <div className="detail-field"><div className="detail-label">Reviewed By</div><div className="detail-value">{selected.reviewerName}</div></div>}
            </div>
            <div className="detail-panel-section">
              <h4>Documents</h4>
              {selected.frontImageUrl && <EvidenceGallery items={[
                { url: selected.frontImageUrl, label: 'Front of ID', type: 'image' },
                ...(selected.backImageUrl ? [{ url: selected.backImageUrl, label: 'Back of ID', type: 'image' }] : []),
                ...(selected.selfieImageUrl ? [{ url: selected.selfieImageUrl, label: 'Selfie', type: 'image' }] : []),
              ]} />}
              {!selected.frontImageUrl && !selected.backImageUrl && !selected.selfieImageUrl && (
                <div className="text-sm text-muted">No documents available</div>
              )}
            </div>
            <div className="detail-panel-section">
              <h4>Identity Information</h4>
              <div className="detail-field"><div className="detail-label">Full Name</div><div className="detail-value">{selected.firstName} {selected.lastName}</div></div>
              {selected.email && <div className="detail-field"><div className="detail-label">Email</div><div className="detail-value">{selected.email}</div></div>}
              {selected.phone && <div className="detail-field"><div className="detail-label">Phone</div><div className="detail-value">{selected.phone}</div></div>}
            </div>
            {selected.rejectionReason && (
              <div className="detail-panel-section">
                <h4>Rejection Reason</h4>
                <p className="text-sm">{selected.rejectionReason}</p>
              </div>
            )}
            <div className="detail-panel-section">
              <h4>Actions</h4>
              <div className="flex gap-2">
                {selected.status === 'pending' && (
                  <>
                    {can('approveVerification') && <button className="btn btn-success" onClick={() => handleApprove(selected)}>Approve</button>}
                    {can('rejectVerification') && <button className="btn btn-danger" onClick={() => handleReject(selected)}>Reject</button>}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </DetailPanel>

      {rejectDialog && (
        <div className="modal-overlay" onClick={() => { setRejectDialog(null); setRejectReason(''); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Reject Verification</h3>
              <button className="modal-close" onClick={() => { setRejectDialog(null); setRejectReason(''); }}><span style={{ fontSize: 18 }}>×</span></button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--color-text-muted)', lineHeight: 1.6, marginBottom: 12 }}>
                Enter rejection reason for <strong>{rejectDialog.userName}</strong>:
              </p>
              <textarea
                className="input"
                style={{ width: '100%', minHeight: 80, resize: 'vertical' }}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Rejection reason..."
                autoFocus
              />
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => { setRejectDialog(null); setRejectReason(''); }}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmReject}>Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}