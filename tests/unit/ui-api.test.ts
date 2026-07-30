import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiGet } from '../../src/ui/api';

describe('UI API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('bypasses the browser cache for local API reads', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ stacks: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await apiGet('token-value', '/api/stacks');

    expect(fetchMock).toHaveBeenCalledWith('/api/stacks', expect.objectContaining({
      cache: 'no-store',
      headers: expect.objectContaining({ authorization: 'Bearer token-value' }),
    }));
  });
});
