import React from 'react';
import { X } from 'lucide-react';

export default function DetailPanel({ open, onClose, title, children }) {
  if (!open) return null;

  return (
    <>
      <div className="detail-panel-overlay" onClick={onClose} />
      <div className={`detail-panel ${open ? 'open' : ''}`}>
        <div className="detail-panel-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="detail-panel-body">
          {children}
        </div>
      </div>
    </>
  );
}
