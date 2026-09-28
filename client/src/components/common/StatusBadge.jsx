import React from 'react';
import { capitalizeWords } from '../../utils/helpers';

export default function StatusBadge({ status, label, className }) {
  const cls = (status || '').toLowerCase().replace(/\s+/g, '-');
  const display = label || status || '';
  return (
    <span className={`status-badge ${cls} ${className || ''}`}>
      {capitalizeWords(display)}
    </span>
  );
}
