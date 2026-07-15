import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/offline/flush', () => ({
  flushOnce: vi.fn(),
}));

import { flushOnce } from '../../../src/lib/offline/flush';
import { requestFlush } from '../../../src/lib/offline/sync';
import { deferred } from '../../helpers/deferred';

beforeEach(() => {
  vi.mocked(flushOnce).mockReset();
});

describe('requestFlush', () => {
  it('single-flights concurrent calls into one flushOnce invocation', async () => {
    const gate = deferred<'complete'>();
    vi.mocked(flushOnce).mockImplementation(() => gate.promise);

    const p1 = requestFlush('user-1');
    const p2 = requestFlush('user-1');
    expect(flushOnce).toHaveBeenCalledTimes(1);

    gate.resolve('complete');
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe('complete');
    expect(r2).toBe('complete');
  });

  it('never rejects, even if flushOnce throws', async () => {
    vi.mocked(flushOnce).mockRejectedValue(new Error('boom'));
    const result = await requestFlush('user-1');
    expect(result).toBe('network');
  });

  it('allows a new flush once the in-flight one has settled', async () => {
    vi.mocked(flushOnce).mockResolvedValueOnce('complete').mockResolvedValueOnce('complete');
    await requestFlush('user-1');
    await requestFlush('user-1');
    expect(flushOnce).toHaveBeenCalledTimes(2);
  });
});
