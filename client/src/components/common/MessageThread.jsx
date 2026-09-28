import React from 'react';
import { formatDateTime, getInitials } from '../../utils/helpers';

export default function MessageThread({ messages = [], currentUserId }) {
  if (messages.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '2rem' }}>
        <div className="empty-state-text">No messages yet</div>
        <div className="empty-state-sub">Start a conversation below</div>
      </div>
    );
  }

  return (
    <div className="message-thread">
      {messages.map((msg, idx) => {
        const isSent = msg.senderId === currentUserId;
        return (
          <div key={idx} className={`message ${isSent ? 'sent' : 'received'}`}>
            <div>{msg.text}</div>
            <div className="message-time">{formatDateTime(msg.createdAt)}</div>
          </div>
        );
      })}
    </div>
  );
}
