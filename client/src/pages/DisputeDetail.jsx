import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { usePermissions } from '../utils/permissions';
import { useApiData, useMutation } from '../utils/useApiData';
import * as disputesApi from '../api/disputes';
import * as entityNotesApi from '../api/entityNotes';
import { formatDateTime } from '../utils/helpers';
import Header from '../components/layout/Header';
import StatusBadge from '../components/common/StatusBadge';
import SeverityBadge from '../components/common/SeverityBadge';
import EvidenceGallery from '../components/common/EvidenceGallery';
import CaseTimeline from '../components/common/CaseTimeline';
import NotesPanel from '../components/common/NotesPanel';

export default function DisputeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { can } = usePermissions(currentUser?.role);
  const { addNotification } = useNotifications();

  const { data: dispute, refetch } = useApiData(() => disputesApi.getById(id), [id], {
    defaultValue: null,
    transform: (r) => r?.data ?? r,
  });

  const [doUpdateStatus] = useMutation(disputesApi.updateStatus);
  const [doAddNote] = useMutation(entityNotesApi.add);

  const { data: notes, refetch: refetchNotes } = useApiData(
    () => entityNotesApi.list('disputes', id),
    [id],
    { defaultValue: [], transform: (r) => r?.data ?? r ?? [] }
  );

  const handleAction = async (status, resolution) => {
    try {
      await doUpdateStatus(id, { status, resolution: resolution || '', assignedTo: currentUser?.id });
      addNotification('moderation_decision', `Dispute ${status}`, `Dispute has been ${status}`, `/disputes/${id}`);
      refetch();
    } catch {
      // silently handle
    }
  };

  if (!dispute) {
    return (
      <div>
        <Header title="Dispute Not Found" />
        <div className="empty-state">
          <div className="empty-state-text">Dispute not found</div>
          <button className="btn btn-outline mt-4" onClick={() => navigate('/oversight')}>Back to Oversight</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title={dispute.title || 'Dispute'} />
      <div className="card mb-4">
        <div className="card-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>{dispute.title}</h2>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', fontSize: 14, color: 'var(--color-text-muted)' }}>
                <StatusBadge status={dispute.type} />
                <SeverityBadge severity={dispute.severity} />
                <StatusBadge status={dispute.status} />
                <span>Filed by {dispute.reporterName || dispute.reporterId} ({formatDateTime(dispute.createdAt)})</span>
                <span>vs {dispute.respondentName || dispute.respondentId}</span>
                {(dispute.assignedName || dispute.assignedTo) && <span>Assigned: {dispute.assignedName || dispute.assignedTo}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {can('resolveDispute') && dispute.status !== 'resolved' && (
                <button className="btn btn-success btn-sm" onClick={() => handleAction('resolved', 'Resolved by admin')}>
                  Resolve
                </button>
              )}
              {can('dismissDispute') && dispute.status !== 'dismissed' && (
                <button className="btn btn-outline btn-sm" onClick={() => handleAction('dismissed', 'Dismissed by admin')}>
                  Dismiss
                </button>
              )}
              {can('escalateDispute') && (
                <button className="btn btn-warning btn-sm" onClick={() => handleAction('escalated', 'Escalated to senior admin')}>
                  Escalate
                </button>
              )}
              {can('sendMessage') && (
                <button className="btn btn-accent btn-sm" onClick={() => navigate('/messages')}>Message</button>
              )}
            </div>
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: '1rem' }}>{dispute.description}</p>
          {dispute.resolution && (
            <div style={{ padding: '0.75rem', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-success)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-success)', marginBottom: 4 }}>Resolution</div>
              <div style={{ fontSize: 14 }}>{dispute.resolution}</div>
              {dispute.resolvedAt && <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>{formatDateTime(dispute.resolvedAt)}</div>}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div className="card">
          <div className="card-header"><h3>Evidence</h3></div>
          <div className="card-body">
            <EvidenceGallery items={dispute.evidence || []} />
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h3>Case Timeline</h3></div>
          <div className="card-body">
            <CaseTimeline entries={dispute.timeline || []} />
          </div>
        </div>
      </div>

      <div className="card mt-4">
        <div className="card-header"><h3>Involved Users</h3></div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: '2rem' }}>
            <div>
              <div className="detail-label">Reporter</div>
              <div className="detail-value">
                <span className="cell-link" onClick={() => navigate(`/users/${dispute.reporterId}`)}>
                  {dispute.reporterName || dispute.reporterId}
                </span>
              </div>
            </div>
            <div>
              <div className="detail-label">Respondent</div>
              <div className="detail-value">
                <span className="cell-link" onClick={() => navigate(`/users/${dispute.respondentId}`)}>
                  {dispute.respondentName || dispute.respondentId}
                </span>
              </div>
            </div>
            {(dispute.assignedName || dispute.assignedTo) && (
              <div>
                <div className="detail-label">Assigned To</div>
                <div className="detail-value">{dispute.assignedName || dispute.assignedTo}</div>
              </div>
            )}
          </div>
          {dispute.relatedId && (
            <div className="mt-4">
              <div className="detail-label">Related {dispute.relatedType}</div>
              <div className="detail-value">
                <span className="cell-link" onClick={() => {
                  if (dispute.relatedType === 'job') navigate(`/jobs/${dispute.relatedId}`);
                  else if (dispute.relatedType === 'rental') navigate(`/listings/${dispute.relatedId}`);
                  else if (dispute.relatedType === 'user') navigate(`/users/${dispute.relatedId}`);
                }}>{dispute.relatedId}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card mt-4">
        <div className="card-header"><h3>Admin Notes</h3></div>
        <div className="card-body">
          <NotesPanel
            notes={notes}
            onAddNote={async (note) => {
              try {
                await doAddNote('disputes', id, note.text);
                addNotification('moderation_decision', 'Note Added', `Note added to dispute`, `/disputes/${id}`);
                refetchNotes();
              } catch (err) { console.error('Add note failed:', err); }
            }}
          />
        </div>
      </div>
    </div>
  );
}
