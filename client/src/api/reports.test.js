import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from './client';
import { listAll } from './reports';

vi.mock('./client', () => ({
  get: vi.fn(),
  post: vi.fn(),
}));

describe('listAll reports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches every report page for complete exports', async () => {
    get
      .mockResolvedValueOnce({ data: [{ id: 'report-1' }], pagination: { totalPages: 2 } })
      .mockResolvedValueOnce({ data: [{ id: 'report-2' }], pagination: { totalPages: 2 } });

    await expect(listAll()).resolves.toMatchObject({
      data: [{ id: 'report-1' }, { id: 'report-2' }],
    });
    expect(get).toHaveBeenNthCalledWith(1, '/reports?page=1&limit=100');
    expect(get).toHaveBeenNthCalledWith(2, '/reports?page=2&limit=100');
  });
});
