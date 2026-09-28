import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as authApi from '../api/auth';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState('request');
  const [email, setEmail] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const token = params.get('access_token');
    if (token) {
      setAccessToken(token);
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
      setMsg('Check your email for the password reset link.');
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
    if (newPassword.length < 6) {
      setMsgType('error');
      setMsg('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      await authApi.resetPassword(accessToken, newPassword);
      setMsgType('success');
      setMsg('Password reset successful. Redirecting to login...');
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
              <input
                id="new-password"
                className="form-input"
                type="password"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoFocus
                minLength={6}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="confirm-password">Confirm Password</label>
              <input
                id="confirm-password"
                className="form-input"
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
              />
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
