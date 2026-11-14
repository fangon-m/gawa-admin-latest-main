import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as authApi from '../api/auth';
import PasswordInput from '../components/common/PasswordInput';

const MIN_PASSWORD_LENGTH = 7;

function readInviteToken() {
  if (typeof window === 'undefined') return '';
  const hash = window.location.hash.replace(/^#/, '');
  if (hash) return new URLSearchParams(hash).get('token') || '';
  return new URLSearchParams(window.location.search).get('token') || '';
}

function clearTokenFromUrl() {
  if (typeof window === 'undefined') return;
  window.history.replaceState(null, '', window.location.pathname);
}

export default function AcceptInvitePage() {
  const navigate = useNavigate();
  const [token] = useState(readInviteToken);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const rules = useMemo(() => ([
    { ok: password.length >= MIN_PASSWORD_LENGTH, label: `At least ${MIN_PASSWORD_LENGTH} characters` },
  ]), [password]);

  const showError = (message) => {
    setMsgType('error');
    setMsg(message);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg('');

    if (!token) return showError('This invitation link is missing its token. Ask an administrator to resend it.');
    if (password !== confirmPassword) return showError('Passwords do not match');
    if (!rules.every((rule) => rule.ok)) return showError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);

    setLoading(true);
    try {
      await authApi.acceptInvite(token, password);
      setDone(true);
      clearTokenFromUrl();
      setMsgType('success');
      setMsg('Your account is ready. Redirecting to sign in…');
      setTimeout(() => navigate('/'), 2000);
    } catch (err) {
      showError(err?.error || 'This invitation is invalid or has expired');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <img src="/logo.svg" alt="GAWA" className="login-logo" />
          <h1>GAWA Admin</h1>
          <p className="login-subtitle">{done ? 'Account created' : 'Set your password'}</p>
        </div>

        {done ? (
          <div className="login-form">
            <div style={{ fontSize: 13, color: 'var(--color-success)', marginBottom: 16 }}>{msg}</div>
            <Link to="/" className="btn btn-primary btn-lg w-full" style={{ textAlign: 'center' }}>Go to sign in</Link>
          </div>
        ) : (
          <form className="login-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="invite-password">New Password</label>
              <PasswordInput
                id="invite-password"
                placeholder="Choose a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                autoComplete="new-password"
                maxLength={128}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="invite-confirm">Confirm Password</label>
              <PasswordInput
                id="invite-confirm"
                placeholder="Repeat your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                maxLength={128}
              />
            </div>

            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', fontSize: 12 }}>
              {rules.map((rule) => (
                <li key={rule.label} style={{ color: rule.ok ? 'var(--color-success)' : 'var(--color-text-muted)', marginBottom: 4 }}>
                  {rule.ok ? '✓' : '•'} {rule.label}
                </li>
              ))}
            </ul>

            {msg && (
              <div style={{ fontSize: 13, color: msgType === 'success' ? 'var(--color-success)' : 'var(--color-error)', marginBottom: 12 }}>
                {msg}
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading}>
              {loading ? 'Creating account…' : 'Set Password'}
            </button>
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Link to="/" style={{ fontSize: 13, color: 'var(--color-primary)' }}>Back to Login</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
