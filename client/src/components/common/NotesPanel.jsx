import React, { useState } from 'react';
import { formatDateTime, getInitials } from '../../utils/helpers';

export default function NotesPanel({ notes = [], onAddNote }) {
  const [text, setText] = useState('');

  const handleSubmit = () => {
    if (!text.trim()) return;
    onAddNote({ text: text.trim() });
    setText('');
  };

  return (
    <div className="notes-panel">
      {notes.length === 0 && (
        <div className="empty-state" style={{ padding: '1.5rem' }}>
          <div className="empty-state-text">No notes yet</div>
        </div>
      )}
      {notes.map((note, idx) => (
        <div key={idx} className="note-item">
          <div className="note-item-header">
            <span className="note-item-author">
              {note.authorName || getInitials(note.author || 'Admin')}
            </span>
            <span className="note-item-date">{formatDateTime(note.createdAt)}</span>
          </div>
          <div className="note-item-text">{note.text}</div>
        </div>
      ))}
      {onAddNote && (
        <div className="notes-input-area">
          <textarea
            placeholder="Add an internal note..."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            className="btn btn-accent btn-sm"
            onClick={handleSubmit}
            disabled={!text.trim()}
            style={{ alignSelf: 'flex-end' }}
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}
