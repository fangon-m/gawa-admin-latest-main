import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import * as authApi from '../api/auth';
import { getById as getUserById } from '../api/users';
import { setToken, setRefreshToken } from '../api/client';

const AuthContext = createContext(null);
const STORAGE_KEY = 'gawa_admin_user';
const TOKEN_KEY = 'gawa_admin_token';
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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const storedToken = getStored(TOKEN_KEY);
    if (!storedToken) {
      setUser(null);
      setIsAuthenticated(false);
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
    try {
      const response = await authApi.login(email, password);
      const { token, refreshToken, user: userData } = response.data;
      setToken(token);
      if (refreshToken) setRefreshToken(refreshToken);
      else setRefreshToken(null);
      setStored(TOKEN_KEY, token);
      setUser(userData);
      setIsAuthenticated(true);
      return true;
    } catch (error) {
      throw error;
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
    setRefreshToken(null);
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
