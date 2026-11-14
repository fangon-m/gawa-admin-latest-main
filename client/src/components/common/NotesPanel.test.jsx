import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import NotesPanel from './NotesPanel';

describe('NotesPanel', () => {
  it('displays API note content and allows the provided delete action', () => {
    const note = {
      id: 'note-1',
      content: 'Reviewed account activity',
      authorName: 'GAWA Admin',
      created_at: '2026-11-14T10:00:00.000Z',
    };
    const onDeleteNote = vi.fn();

    render(<NotesPanel notes={[note]} onDeleteNote={onDeleteNote} />);

    expect(screen.getByText('Reviewed account activity')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete note' }));
    expect(onDeleteNote).toHaveBeenCalledWith(note);
  });
});
