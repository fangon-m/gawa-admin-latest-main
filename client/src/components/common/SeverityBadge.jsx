import React from 'react';
import { capitalizeWords } from '../../utils/helpers';

export default function SeverityBadge({ severity }) {
  return (
    <span className={`severity-badge ${severity}`}>
      {capitalizeWords(severity)}
    </span>
  );
}
