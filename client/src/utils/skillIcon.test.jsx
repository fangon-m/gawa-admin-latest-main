// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as lucideIcons from 'lucide-react';
import { resolveLucideIcon, SkillIcon } from './skillIcon';

describe('SkillIcon', () => {
  it('resolves a stored "Mop" skill to the lucide cleaning icon instead of raw text', () => {
    expect(resolveLucideIcon('Mop')).toBe(lucideIcons.BrushCleaning);

    const { container } = render(<SkillIcon icon="Mop" />);

    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(screen.queryByText('Mop')).not.toBeInTheDocument();
  });

  it('still resolves exact lucide names and ignores case and separators', () => {
    expect(resolveLucideIcon('Hammer')).toBe(lucideIcons.Hammer);
    expect(resolveLucideIcon('brush_cleaning')).toBe(lucideIcons.BrushCleaning);
  });

  it('falls back to an emoji label when the value is not a lucide name', () => {
    render(<SkillIcon icon="🧹" />);

    expect(screen.getByRole('img', { name: '🧹' })).toHaveTextContent('🧹');
  });

  it('renders uploaded icons as images and defaults to a book icon when empty', () => {
    const { container, rerender } = render(<SkillIcon icon="https://cdn.example.com/mop.png" />);

    expect(container.querySelector('img')).toHaveAttribute('src', 'https://cdn.example.com/mop.png');

    rerender(<SkillIcon icon="" />);

    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
