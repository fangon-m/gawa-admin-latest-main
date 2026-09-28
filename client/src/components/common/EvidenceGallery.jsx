import React from 'react';
import { FileText } from 'lucide-react';

export default function EvidenceGallery({ items = [] }) {
  if (items.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '1.5rem' }}>
        <div className="empty-state-text">No evidence attached</div>
      </div>
    );
  }

  return (
    <div className="evidence-gallery">
      {items.map((item, idx) => (
        <div key={idx} className="evidence-item">
          {item.url ? (
            <img src={item.url} alt={item.label || 'Evidence'} loading="lazy" />
          ) : (
            <div className="evidence-placeholder">
              <FileText size={24} />
              <span>{item.label || `File ${idx + 1}`}</span>
              {item.type && <span style={{ fontSize: '0.7rem' }}>{item.type}</span>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
