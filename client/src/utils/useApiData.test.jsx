import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useApiData } from './useApiData';

function Harness({ fetchFn }) {
  const { data } = useApiData(fetchFn, [], { defaultValue: { data: [], stats: {} } });
  return <div>{Array.isArray(data?.data) ? 'wrapped' : 'unwrapped'}</div>;
}

describe('useApiData', () => {
  it('preserves wrapped responses with stats and pagination', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      data: [{ id: 'a1' }],
      stats: { totalAttempts: 1 },
      pagination: { total: 1 },
    });

    render(<Harness fetchFn={fetchFn} />);

    expect(await screen.findByText('wrapped')).toBeInTheDocument();
  });
});
