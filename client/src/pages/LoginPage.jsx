import React, { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PasswordInput from '../components/common/PasswordInput';

// Only the email address is remembered. The password is never stored: it
// would be readable by any script on the origin, and it used to be shipped in
// the bundle as a pre-filled default.
const EMAIL_STORAGE_KEY = 'gawa_admin_email';

function readRememberedEmail() {
  try {
    return localStorage.getItem(EMAIL_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function rememberEmail(email) {
  try {
    if (email) localStorage.setItem(EMAIL_STORAGE_KEY, email);
    else localStorage.removeItem(EMAIL_STORAGE_KEY);
  } catch {
    /* storage unavailable — the form still works */
  }
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  // Read once on mount: the remembered address decides where the cursor
  // starts, and it must not change while the form is open.
  const rememberedEmail = useRef(readRememberedEmail()).current;
  const [email, setEmail] = useState(rememberedEmail);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const showsRemembered = rememberedEmail !== '' && email === rememberedEmail;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    // A trailing space in the address is the most common reason a valid
    // login is rejected, so it is trimmed before it is sent.
    const address = email.trim();
    try {
      const success = await login(address, password);
      if (success) {
        rememberEmail(address.toLowerCase());
        navigate('/', { replace: true });
      } else {
        setError('Invalid email or password');
      }
    } catch (err) {
      setError(err?.error || err?.message || 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const forgetEmail = () => {
    rememberEmail('');
    setEmail('');
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <img src="/logo.svg" alt="GAWA" className="login-logo" />
          <h1>GAWA Admin</h1>
          <p className="login-subtitle">Sign in to your account</p>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="email">Email</label>
            <input
              id="email"
              className="form-input"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
              autoFocus={!rememberedEmail}
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <PasswordInput
              id="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus={!!rememberedEmail}
              required
            />
            <div style={{ textAlign: 'right', marginTop: 4 }}>
              {showsRemembered && (
                <button
                  type="button"
                  onClick={forgetEmail}
                  style={{
                    background: 'none', border: 'none', padding: 0, marginRight: 12,
                    fontSize: 13, color: 'var(--color-primary)', cursor: 'pointer',
                  }}
                >
                  Not you?
                </button>
              )}
              <Link to="/reset-password" style={{ fontSize: 13, color: 'var(--color-primary)' }}>Forgot password?</Link>
            </div>
          </div>
          {error && <div className="login-error">{error}</div>}
          <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <div className="login-footer">
        </div>
      </div>
    </div>
  );
}
