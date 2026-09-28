import React from 'react';
import { formatDateTime } from '../../utils/helpers';

export default function CaseTimeline({ entries = [] }) {
  if (entries.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '1.5rem' }}>
        <div className="empty-state-text">No timeline entries</div>
      </div>
    );
  }

  return (
    <div className="case-timeline">
      {entries.map((entry, idx) => (
        <div key={idx} className="timeline-item">
          <div className={`timeline-dot ${entry.completed ? 'completed' : ''}`} />
          <div className="timeline-date">{formatDateTime(entry.date)}</div>
          <div className="timeline-title">{entry.title}</div>
          {entry.description && <div className="timeline-desc">{entry.description}</div>}
          {entry.actor && <div className="timeline-desc" style={{ fontSize: '0.75rem' }}>by {entry.actor}</div>}
        </div>
      ))}
    </div>
  );
}
