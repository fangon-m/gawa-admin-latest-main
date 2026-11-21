import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

/** Floating error alert for transient action failures (e.g. a blocked delete). */
export default function ErrorToast({ message, onDismiss, duration = 6000 }) {
  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss, duration]);

  if (!message) return null;

  return (
    <div className="toast-error" role="alert" aria-live="assertive">
      <AlertTriangle size={17} aria-hidden="true" />
      <span>{message}</span>
      <button type="button" aria-label="Dismiss error" onClick={onDismiss}>
        <X size={14} />
      </button>
    </div>
  );
}
