import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../../context/NotificationContext';
import { CheckCheck, Bell, BellOff } from 'lucide-react';

const typeIcons = {
  verification_approved: 'V',
  verification_rejected: 'V',
  dispute_filed: 'D',
  dispute_resolved: 'D',
  appeal_forwarded: 'A',
  appeal_decided: 'A',
  user_suspended: 'S',
  user_reinstated: 'R',
  points_issued: 'P',
  points_deducted: 'P',
  content_flagged: 'F',
  moderation_decision: 'M',
  new_report: 'R',
  job_completed: 'J',
  user_flagged: 'U',
  user_registered: 'U',
};

function timeAgo(timestamp) {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export default function NotificationPanel({ onClose }) {
  const { notifications, unreadCount, markAsRead, markAllRead } = useNotifications();
  const navigate = useNavigate();

  const handleClick = (notification) => {
    if (!notification.read) markAsRead(notification.id);
    if (notification.link) navigate(notification.link);
    if (onClose) onClose();
  };

  const handleMarkAll = () => {
    markAllRead();
  };

  const recent = notifications.slice(0, 20);

  return (
    <div className="notification-panel">
      <div className="notification-panel-header">
        <span className="notification-panel-title">Notifications</span>
        {unreadCount > 0 && (
          <button className="notification-panel-mark-all" onClick={handleMarkAll}>
            <CheckCheck size={14} /> Mark all read
          </button>
        )}
      </div>

      <div className="notification-panel-list">
        {recent.length === 0 ? (
          <div className="notification-panel-empty">
            <BellOff size={24} />
            <span>No notifications yet</span>
          </div>
        ) : (
          recent.map((notif) => (
            <div
              key={notif.id}
              className={`notification-panel-item${notif.read ? '' : ' unread'}`}
              onClick={() => handleClick(notif)}
            >
              <div className="notification-panel-icon">
                {typeIcons[notif.type] || 'N'}
              </div>
              <div className="notification-panel-content">
                <div className="notification-panel-title">{notif.title}</div>
                <div className="notification-panel-desc">{notif.description}</div>
                <div className="notification-panel-time">
                  {timeAgo(notif.timestamp)}
                  {notif.actorName !== 'System' && ` · ${notif.actorName}`}
                </div>
              </div>
              {!notif.read && <div className="notification-panel-dot" />}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
