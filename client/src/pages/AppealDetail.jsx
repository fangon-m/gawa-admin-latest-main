import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { usePermissions } from '../utils/permissions';
import { useApiData, useMutation } from '../utils/useApiData';
import * as appealsApi from '../api/appeals';
import * as entityNotesApi from '../api/entityNotes';
import { formatDateTime, capitalizeWords } from '../utils/helpers';
import Header from '../components/layout/Header';
import StatusBadge from '../components/common/StatusBadge';
import CaseTimeline from '../components/common/CaseTimeline';
import NotesPanel from '../components/common/NotesPanel';
import ConfirmModal from '../components/common/ConfirmModal';

export default function AppealDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { can, isSupport } = usePermissions(currentUser?.role);
  const { addNotification } = useNotifications();
  const [showDecision, setShowDecision] = useState(null);
  const [forwardRec, setForwardRec] = useState('');
  const [forwardNotes, setForwardNotes] = useState('');

  const { data: appeal, loading, refetch } = useApiData(() => appealsApi.getById(id), [id], {
    defaultValue: null,
    transform: (r) => r?.data ?? r,
  });

  const [doForward] = useMutation(appealsApi.forward);
  const [doDecide] = useMutation(appealsApi.decide);
  const [doAddNote] = useMutation(entityNotesApi.add);

  const { data: notes, refetch: refetchNotes } = useApiData(
    () => entityNotesApi.list('appeals', id),
    [id],
    { defaultValue: [], transform: (r) => r?.data ?? r ?? [] }
  );

  const handleDecision = async (decision) => {
    try {
      if (decision === 'forward') {
        await doForward(id, { recommendation: forwardRec || null, notes: forwardNotes || null });
      } else {
        await doDecide(id, { decision, decisionNotes: '' });
      }
      addNotification('appeal_decided', 'Appeal Decision',
        `Appeal decision for ${appeal?.userName || appeal?.userId}: ${decision}`,
        `/appeals/${id}`);
      setShowDecision(null);
      setForwardRec('');
      setForwardNotes('');
      refetch();
    } catch (err) {
      console.error('Appeal decision failed:', err);
      setShowDecision(null);
    }
  };

  if (loading) {
    return (
      <div>
        <Header title="Appeal" />
        <div className="page-loading"><div className="page-loading__spinner" /></div>
      </div>
    );
  }

  if (!appeal) {
    return (
      <div>
        <Header title="Appeal Not Found" />
        <div className="empty-state">
          <div className="empty-state-text">Appeal not found</div>
          <button className="btn btn-outline mt-4" onClick={() => navigate('/oversight')}>Back to Oversight</button>
        </div>
      </div>
    );
  }

  const decisionButtons = [];
  if (can('finalizeAppeal')) {
    decisionButtons.push(
      { label: 'Reinstate Account', action: 'reinstated', variant: 'success', show: true },
      { label: 'Extend Suspension', action: 'extend_suspension', variant: 'warning', show: true },
      { label: 'Permanently Delete', action: 'permanently_deleted', variant: 'danger', show: true },
    );
  }
  if (can('forwardAppeal') && isSupport && appeal?.status === 'pending') {
    decisionButtons.push({ label: 'Forward to Admin', action: 'forward', variant: 'primary', show: true });
  }

  return (
    <div>
      <Header title={`Appeal - ${appeal?.userName || appeal?.userId || 'Unknown'}`} />
      <div className="card mb-4">
        <div className="card-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>{appeal?.userName || appeal?.userId}</h2>
              <div style={{ display: 'flex', gap: '0.75rem', fontSize: 14, color: 'var(--color-text-muted)', marginTop: 4 }}>
                <StatusBadge status={appeal?.userRole || 'user'} />
                <StatusBadge status={appeal?.status} />
                {appeal?.decision && <StatusBadge status={appeal.decision} />}
                <span>Filed: {formatDateTime(appeal?.filedAt)}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column' }}>
              {decisionButtons.filter(b => b.show).map((btn) => (
                <button
                  key={btn.action}
                  className={`btn btn-sm ${btn.variant === 'danger' ? 'btn-danger' : btn.variant === 'success' ? 'btn-success' : btn.variant === 'warning' ? 'btn-warning' : 'btn-accent'}`}
                  onClick={() => setShowDecision(btn.action)}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-header"><h3>Suspension Details</h3></div>
        <div className="card-body">
          <div className="detail-field"><div className="detail-label">Reason for Suspension</div><div className="detail-value">{appeal?.suspensionReason}</div></div>
          {appeal?.supportRecommendation && (
            <div className="detail-field mt-4"><div className="detail-label">Support Recommendation</div><div className="detail-value" style={{ color: 'var(--color-accent)' }}>{appeal.supportRecommendation}</div></div>
          )}
          {appeal?.supportNotes && (
            <div className="detail-field mt-4"><div className="detail-label">Support Notes</div><div className="detail-value" style={{ fontSize: 14 }}>{appeal.supportNotes}</div></div>
          )}
          {appeal?.decisionNotes && (
            <div className="detail-field mt-4"><div className="detail-label">Decision Notes</div><div className="detail-value">{appeal.decisionNotes}</div></div>
          )}
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-header"><h3>Timeline</h3></div>
        <div className="card-body">
          <CaseTimeline entries={appeal?.timeline || []} />
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3>Admin Notes</h3></div>
        <div className="card-body">
          <NotesPanel
            notes={notes}
            onAddNote={async (note) => {
              try {
                await doAddNote('appeals', id, note.text);
                addNotification('appeal_forwarded', 'Note Added on Appeal',
                  `Note added for ${appeal?.userName || appeal?.userId}`, `/appeals/${id}`);
                refetchNotes();
                } catch (err) { console.error('Add note failed:', err); }
              }}
          />
        </div>
      </div>

      {showDecision === 'forward' ? (
        <div className="modal-overlay" onClick={() => { setShowDecision(null); setForwardRec(''); setForwardNotes(''); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Forward Appeal to Admin</h3>
              <button className="modal-close" onClick={() => { setShowDecision(null); setForwardRec(''); setForwardNotes(''); }}><span style={{ fontSize: 18 }}>×</span></button>
            </div>
            <div className="modal-body">
              <div className="detail-field" style={{ marginBottom: 12 }}>
                <div className="detail-label" style={{ marginBottom: 4 }}>Recommendation</div>
                <select className="form-input" value={forwardRec} onChange={(e) => setForwardRec(e.target.value)}>
                  <option value="">-- Select recommendation --</option>
                  <option value="reinstate">Reinstate</option>
                  <option value="uphold">Uphold Suspension</option>
                </select>
              </div>
              <div className="detail-field">
                <div className="detail-label" style={{ marginBottom: 4 }}>Notes</div>
                <textarea
                  className="form-input"
                  style={{ width: '100%', minHeight: 80, resize: 'vertical' }}
                  value={forwardNotes}
                  onChange={(e) => setForwardNotes(e.target.value)}
                  placeholder="Enter notes for the admin..."
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => { setShowDecision(null); setForwardRec(''); setForwardNotes(''); }}>Cancel</button>
              <button className="btn btn-accent" onClick={() => handleDecision('forward')}>Forward to Admin</button>
            </div>
          </div>
        </div>
      ) : (
        <ConfirmModal
          open={!!showDecision}
          title="Appeal Decision"
          message={`Are you sure you want to ${capitalizeWords(showDecision || '')} for ${appeal?.userName || appeal?.userId}? This action will affect their account status.`}
          confirmLabel="Confirm Decision"
          variant={showDecision === 'permanently_deleted' ? 'danger' : showDecision === 'reinstated' ? 'success' : 'primary'}
          onConfirm={() => handleDecision(showDecision)}
          onCancel={() => setShowDecision(null)}
        />
      )}
    </div>
  );
}
