import React from 'react';

/**
 * Single animated loading indicator used across the admin portal.
 *
 * The circle itself is styled in `styles/components.css` (`.loading-spinner`),
 * which owns the shared `spin` keyframes so every spinner on every page moves
 * the same way. `size` only changes the diameter.
 */
export default function LoadingSpinner({ size = 'md', label, className = '' }) {
  return (
    <div className={`loading-indicator ${className}`.trim()} role="status" aria-live="polite">
      <div className={`loading-spinner loading-spinner--${size}`} aria-hidden="true" />
      {label && <span className="loading-indicator-label">{label}</span>}
    </div>
  );
}
