import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import * as notificationsApi from '../api/notifications';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const { isAuthenticated, initializing } = useAuth();

  // Fetch notifications from API when authenticated
  useEffect(() => {
    if (initializing || !isAuthenticated) {
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);
    notificationsApi.list({ limit: 50 })
      .then((res) => {
        if (mounted) {
          setNotifications(res.data || []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [initializing, isAuthenticated]);

  const addNotification = useCallback((type, title, description, link) => {
    // Optimistically add to local state
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const notification = {
      id: tempId,
      type,
      title,
      description,
      timestamp: new Date().toISOString(),
      read: false,
      link: link || '/',
      actorName: 'System',
    };
    setNotifications((prev) => [notification, ...prev]);

    // Persist to backend
    notificationsApi.create({ type, title, description, link })
      .then((res) => {
        // Replace temp ID with real one from server
        setNotifications((prev) =>
          prev.map((n) => (n.id === tempId ? { ...n, id: res.data.id } : n))
        );
      })
      .catch(() => {
        // On failure, keep the notification locally (offline-friendly)
      });
  }, []);

  const markAsRead = useCallback((id) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    notificationsApi.markAsRead(id).catch(() => {
      // Revert on failure
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: false } : n))
      );
    });
  }, []);

  const markAllRead = useCallback(() => {
    const ids = notifications.filter((n) => !n.read).map((n) => n.id);
    if (ids.length === 0) return;

    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    notificationsApi.markAllRead().catch(() => {
      // Revert on failure — re-fetch from server
      notificationsApi.list({ limit: 50 }).then((res) => {
        setNotifications(res.data || []);
      }).catch(() => {});
    });
  }, [notifications]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        addNotification,
        markAsRead,
        markAllRead,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
