import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import EvidenceGallery from './EvidenceGallery';

const items = [
  { url: 'https://example.com/front.jpg', label: 'Front of ID' },
  { url: 'https://example.com/back.jpg', label: 'Back of ID' },
];

describe('EvidenceGallery', () => {
  it('opens an image full size when clicked', () => {
    render(<EvidenceGallery items={items} />);

    fireEvent.click(screen.getByRole('button', { name: /front of id/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('img', { name: 'Front of ID' })).toBeTruthy();
    expect(within(dialog).getByText('1 / 2')).toBeTruthy();
  });

  it('navigates between images and closes with Escape', () => {
    render(<EvidenceGallery items={items} />);

    fireEvent.click(screen.getByRole('button', { name: /front of id/i }));
    fireEvent.click(screen.getByRole('button', { name: /next image/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('img', { name: 'Back of ID' })).toBeTruthy();
    expect(within(dialog).getByText('2 / 2')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps placeholder files non-clickable', () => {
    render(<EvidenceGallery items={[{ label: 'Receipt', type: 'pdf' }]} />);

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Receipt')).toBeTruthy();
  });
});
