import { describe, it, expect, vi, afterEach } from 'vitest';

import { withDeadline, TIMED_OUT } from '../../src/lib/deadline';

afterEach(() => {
  vi.useRealTimers();
});

describe('withDeadline', () => {
  it('resolves with the value when the promise settles inside the deadline', async () => {
    await expect(withDeadline(Promise.resolve('session'), 1000)).resolves.toBe('session');
  });

  it('resolves with TIMED_OUT once the deadline passes on a still-pending promise', async () => {
    vi.useFakeTimers();
    const raced = withDeadline(new Promise<string>(() => {}), 1000);

    await vi.advanceTimersByTimeAsync(1000);

    await expect(raced).resolves.toBe(TIMED_OUT);
  });

  it('propagates a rejection rather than reporting it as a deadline', async () => {
    await expect(withDeadline(Promise.reject(new Error('boom')), 1000)).rejects.toThrow('boom');
  });

  it('stops the deadline timer when the promise wins the race', async () => {
    vi.useFakeTimers();

    await expect(withDeadline(Promise.resolve('session'), 1000)).resolves.toBe('session');

    // A timer left armed on every call would outlive the flush that scheduled
    // it — one per flush, every 30s while the queue is non-empty.
    expect(vi.getTimerCount()).toBe(0);
  });
});
