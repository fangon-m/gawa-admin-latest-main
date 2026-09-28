import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import * as authApi from '../api/auth';
import { getById as getUserById } from '../api/users';
import { setToken, setRefreshToken } from '../api/client';

const AuthContext = createContext(null);
const STORAGE_KEY = 'gawa_admin_user';
const TOKEN_KEY = 'gawa_admin_token';
const LOCAL_AUTH_KEY = 'gawa_admin_local_auth';
const DEFAULT_EMAIL = 'gawaadmin@email.com';
const DEFAULT_PASSWORD = 'gawaadmin123';
const LOCAL_ADMIN_TOKEN = 'gawa-local-admin-token';
const defaultAuthState = {
  user: null,
  isAuthenticated: false,
  initializing: false,
  login: async () => false,
  logout: () => {},
  refetchUser: async () => {},
};

function getStored(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function setStored(key, value) {
  try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch {}
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = getStored(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  });
  const [isAuthenticated, setIsAuthenticated] = useState(() => getStored(LOCAL_AUTH_KEY) === 'true');
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    if (getStored(LOCAL_AUTH_KEY) === 'true') {
      setInitializing(false);
      return;
    }

    const storedToken = getStored(TOKEN_KEY);
    if (!storedToken) {
      setInitializing(false);
      return;
    }

    setToken(storedToken);
    authApi.me()
      .then((response) => {
        const userData = response?.data ?? response;
        setUser(userData);
        setIsAuthenticated(true);
      })
      .catch(() => {
        setToken(null);
        setStored(TOKEN_KEY, null);
        setUser(null);
        setIsAuthenticated(false);
      })
      .finally(() => {
        setInitializing(false);
      });
  }, []);

  useEffect(() => {
    const handleAuthExpired = () => {
      setToken(null);
      setStored(TOKEN_KEY, null);
      setStored(LOCAL_AUTH_KEY, null);
      setUser(null);
      setIsAuthenticated(false);
    };

    window.addEventListener('auth:expired', handleAuthExpired);
    return () => window.removeEventListener('auth:expired', handleAuthExpired);
  }, []);

  // Persist user changes
  useEffect(() => {
    setStored(STORAGE_KEY, user ? JSON.stringify(user) : null);
  }, [user]);

  const login = useCallback(async (email, password) => {
    if (email === DEFAULT_EMAIL && password === DEFAULT_PASSWORD) {
      setToken(LOCAL_ADMIN_TOKEN);
      setRefreshToken(null);
      setStored(LOCAL_AUTH_KEY, 'true');
      setUser({
        id: 'local-admin',
        name: 'GAWA Admin',
        email: DEFAULT_EMAIL,
        role: 'admin',
        status: 'active',
      });
      setIsAuthenticated(true);
      return true;
    }

    try {
      const response = await authApi.login(email, password);
      const { token, refreshToken, user: userData } = response.data;
      setToken(token);
      if (refreshToken) setRefreshToken(refreshToken);
      setStored(TOKEN_KEY, token);
      setUser(userData);
      setIsAuthenticated(true);
      return true;
    } catch {
      return false;
    }
  }, []);

  const refetchUser = useCallback(async () => {
    const id = user?.id;
    if (!id) return;
    try {
      const response = await getUserById(id);
      const userData = response?.data ?? response;
      if (userData) {
        setUser(userData);
      }
    } catch {
      // silently fail
    }
  }, [user?.id]);

  const logout = useCallback(() => {
    setToken(null);
    setStored(TOKEN_KEY, null);
    setStored(LOCAL_AUTH_KEY, null);
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, initializing, login, logout, refetchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  return ctx ?? defaultAuthState;
}
