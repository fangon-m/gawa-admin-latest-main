import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as authApi from '../api/auth';
import PasswordInput from '../components/common/PasswordInput';

const MIN_PASSWORD_LENGTH = 7;

function readResetParams() {
  if (typeof window === 'undefined') return { token: '', accessToken: '' };
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const search = new URLSearchParams(window.location.search);
  return {
    token: hash.get('token') || search.get('token') || '',
    accessToken: hash.get('access_token') || '',
  };
}

function clearTokenFromUrl() {
  if (typeof window === 'undefined') return;
  window.history.replaceState(null, '', window.location.pathname);
}

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState('request');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = readResetParams();
    if (params.token || params.accessToken) {
      setToken(params.token);
      setAccessToken(params.accessToken);
      setStep('reset');
    }
  }, []);

  const handleRequestReset = async (e) => {
    e.preventDefault();
    setMsg('');
    setLoading(true);
    try {
      await authApi.requestReset(email);
      setMsgType('success');
      setMsg('If that email belongs to a team member, a reset link has been sent. Check the inbox and spam folder.');
    } catch (err) {
      setMsgType('error');
      setMsg(err?.error || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setMsg('');
    if (newPassword !== confirmPassword) {
      setMsgType('error');
      setMsg('Passwords do not match');
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setMsgType('error');
      setMsg(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    setLoading(true);
    try {
      if (token) {
        await authApi.resetPassword(token, newPassword);
      } else {
        await authApi.resetPasswordWithAccessToken(accessToken, newPassword);
      }
      setMsgType('success');
      setMsg('Password reset successful. Redirecting to login...');
      clearTokenFromUrl();
      setTimeout(() => navigate('/'), 2000);
    } catch (err) {
      setMsgType('error');
      setMsg(err?.error || 'Failed to reset password');
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
          <p className="login-subtitle">
            {step === 'request' ? 'Reset your password' : 'Set a new password'}
          </p>
        </div>

        {step === 'request' ? (
          <form className="login-form" onSubmit={handleRequestReset}>
            <div className="form-group">
              <label className="form-label" htmlFor="reset-email">Email</label>
              <input
                id="reset-email"
                className="form-input"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            {msg && (
              <div className={msgType === 'error' ? 'login-error' : ''} style={{ fontSize: 13, color: msgType === 'success' ? 'var(--color-success)' : 'inherit', marginBottom: 12 }}>
                {msg}
              </div>
            )}
            <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading}>
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Link to="/" style={{ fontSize: 13, color: 'var(--color-primary)' }}>Back to Login</Link>
            </div>
          </form>
        ) : (
          <form className="login-form" onSubmit={handleResetPassword}>
            <div className="form-group">
              <label className="form-label" htmlFor="new-password">New Password</label>
              <PasswordInput
                id="new-password"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
                autoFocus
                maxLength={128}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="confirm-password">Confirm Password</label>
              <PasswordInput
                id="confirm-password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
                maxLength={128}
              />
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
              At least {MIN_PASSWORD_LENGTH} characters.
            </div>
            {msg && (
              <div style={{ fontSize: 13, color: msgType === 'success' ? 'var(--color-success)' : 'var(--color-error)', marginBottom: 12 }}>
                {msg}
              </div>
            )}
            <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading}>
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
