import { describe, it, expect, afterEach } from 'vitest';
import { MutationObserver, onlineManager } from '@tanstack/react-query';
import { queryClient } from '../../src/lib/queryClient';

// Settings/label/category writes are online-only: while the browser reports
// offline, they must run and fail fast into their catch handlers, not sit
// paused (frozen buttons, no error) and silently replay on reconnect. React
// Query's 'online' networkMode default does exactly that pausing — these
// tests pin the 'always' override.
describe('queryClient mutation defaults: no offline pausing', () => {
  afterEach(() => {
    onlineManager.setOnline(true);
    queryClient.getMutationCache().clear();
  });

  it('runs the mutationFn while offline instead of pausing', async () => {
    onlineManager.setOnline(false);
    let called = false;
    const observer = new MutationObserver(queryClient, {
      mutationFn: async () => {
        called = true;
        return 'saved';
      },
    });

    await expect(observer.mutate()).resolves.toBe('saved');
    expect(called).toBe(true);
    expect(observer.getCurrentResult().isPaused).toBe(false);
  });

  it('rejects into the caller when the offline request fails', async () => {
    onlineManager.setOnline(false);
    const observer = new MutationObserver(queryClient, {
      mutationFn: async () => {
        throw new TypeError('Failed to fetch');
      },
    });

    await expect(observer.mutate()).rejects.toThrow('Failed to fetch');
    const result = observer.getCurrentResult();
    expect(result.isPaused).toBe(false);
    expect(result.isError).toBe(true);
  });
});
