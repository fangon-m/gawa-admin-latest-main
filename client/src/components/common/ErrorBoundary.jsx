import React from 'react';
import { AlertTriangle } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          maxWidth: '500px',
          margin: '3rem auto',
        }}>
          <AlertTriangle size={48} style={{ color: 'var(--color-error, #ef4444)', marginBottom: '1rem' }} />
          <h2 style={{ marginBottom: '0.5rem' }}>Something went wrong</h2>
          <p style={{ color: 'var(--color-text-muted, #6b7280)', marginBottom: '1rem' }}>
            {this.props.message || 'An unexpected error occurred. Please try refreshing the page.'}
          </p>
          <button
            className="btn btn-accent"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
          >
            Refresh Page
          </button>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details style={{ marginTop: '1rem', textAlign: 'left' }}>
              <summary style={{ cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                Error Details
              </summary>
              <pre style={{
                marginTop: '0.5rem',
                padding: '0.75rem',
                background: 'var(--color-bg-secondary, #f3f4f6)',
                borderRadius: '0.5rem',
                fontSize: '0.75rem',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
              }}>
                {this.state.error?.stack || this.state.error?.message || String(this.state.error)}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
