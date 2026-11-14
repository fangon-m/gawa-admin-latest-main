import React, { useState } from 'react';
import { formatDateTime, getInitials } from '../../utils/helpers';
import { Trash2 } from 'lucide-react';

export default function NotesPanel({ notes = [], onAddNote, onDeleteNote, error }) {
  const [text, setText] = useState('');

  const handleSubmit = () => {
    if (!text.trim()) return;
    onAddNote({ text: text.trim() });
    setText('');
  };

  return (
    <div className="notes-panel">
      {error && <div className="text-sm" role="alert" style={{ color: 'var(--color-danger)' }}>{error}</div>}
      {notes.length === 0 && (
        <div className="empty-state" style={{ padding: '1.5rem' }}>
          <div className="empty-state-text">No notes yet</div>
        </div>
      )}
      {notes.map((note, idx) => (
        <div key={note.id || idx} className="note-item">
          <div className="note-item-header">
            <span className="note-item-author">
              {note.authorName || getInitials(note.author || 'Admin')}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="note-item-date">{formatDateTime(note.createdAt || note.created_at)}</span>
              {onDeleteNote && note.id && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  aria-label="Delete note"
                  title="Delete note"
                  onClick={() => onDeleteNote(note)}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
          <div className="note-item-text">{note.text ?? note.content}</div>
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
