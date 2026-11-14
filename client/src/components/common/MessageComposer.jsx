import React, { useState } from 'react';

export default function MessageComposer({ onSend, disabled = false }) {
  const [text, setText] = useState('');

  const handleSend = async () => {
    const message = text.trim();
    if (!message || disabled) return;
    const sent = await onSend(message);
    if (sent !== false) setText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="message-composer">
      <input
        type="text"
        placeholder="Type a message..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />
      <button className="btn btn-accent btn-sm" onClick={handleSend} disabled={disabled || !text.trim()}>
        Send
      </button>
    </div>
  );
}
