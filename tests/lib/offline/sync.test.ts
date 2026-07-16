import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/lib/offline/flush', () => ({
  flushOnce: vi.fn(),
}));

let authCallback: ((event: string) => void) | null = null;
const unsubscribeSpy = vi.fn();

vi.mock('../../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn((cb: (event: string) => void) => {
        authCallback = cb;
        return { data: { subscription: { unsubscribe: unsubscribeSpy } } };
      }),
    },
  },
}));

import { flushOnce } from '../../../src/lib/offline/flush';
import { offlineDB } from '../../../src/lib/offline/store';
import { requestFlush, initOfflineSync } from '../../../src/lib/offline/sync';
import { deferred } from '../../helpers/deferred';

// The test environment has no DOM (vitest environment: 'node' — this app is
// offline-first Dexie logic, not component tests). Stub just the
// addEventListener/removeEventListener surface initOfflineSync uses, so the
// real registration/cleanup code path is exercised without pulling in jsdom.
function stubTarget() {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  return {
    addEventListener: vi.fn((type: string, cb: (...args: unknown[]) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(cb);
    }),
    removeEventListener: vi.fn((type: string, cb: (...args: unknown[]) => void) => {
      listeners.get(type)?.delete(cb);
    }),
    fire(type: string) {
      for (const cb of listeners.get(type) ?? []) cb();
    },
  };
}

// requestFlush's single-flight `inFlight` promise clears only after the
// mocked flushOnce's `.catch().finally()` chain settles — a couple of
// microtask hops after the call itself lands. Without this, a kick fired
// right after a prior one only observes the call, not the settle, and the
// next requestFlush short-circuits on the still-pending inFlight guard.
async function flushInFlight(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

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

describe('initOfflineSync', () => {
  let windowStub: ReturnType<typeof stubTarget>;
  let documentStub: ReturnType<typeof stubTarget> & { visibilityState: string };
  let dispose: (() => void) | null = null;

  beforeEach(() => {
    vi.mocked(flushOnce).mockResolvedValue('complete');
    authCallback = null;
    unsubscribeSpy.mockClear();

    windowStub = stubTarget();
    documentStub = Object.assign(stubTarget(), { visibilityState: 'visible' });
    vi.stubGlobal('window', windowStub);
    vi.stubGlobal('document', documentStub);
    // requestFlush's navigator.locks branch is covered by the `requestFlush`
    // describe block above; strip it here so repeated kicks in one test
    // resolve through the plain microtask path instead of real Web Locks.
    vi.stubGlobal('navigator', {});
  });

  afterEach(() => {
    dispose?.();
    dispose = null;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('kicks a flush immediately on startup when a user is present', () => {
    dispose = initOfflineSync(() => 'user-1');
    expect(flushOnce).toHaveBeenCalledWith('user-1');
  });

  it('does not kick on startup when there is no user', () => {
    dispose = initOfflineSync(() => null);
    expect(flushOnce).not.toHaveBeenCalled();
  });

  it('kicks on the online event', async () => {
    dispose = initOfflineSync(() => 'user-1');
    await flushInFlight(); // let the startup kick's single-flight guard clear
    vi.mocked(flushOnce).mockClear();

    windowStub.fire('online');
    expect(flushOnce).toHaveBeenCalledWith('user-1');
  });

  it('kicks on visibilitychange only when the tab becomes visible', async () => {
    dispose = initOfflineSync(() => 'user-1');
    await flushInFlight();
    vi.mocked(flushOnce).mockClear();

    documentStub.visibilityState = 'hidden';
    documentStub.fire('visibilitychange');
    expect(flushOnce).not.toHaveBeenCalled();

    documentStub.visibilityState = 'visible';
    documentStub.fire('visibilitychange');
    expect(flushOnce).toHaveBeenCalledWith('user-1');
  });

  it('kicks on SIGNED_IN and TOKEN_REFRESHED, not on other auth events', async () => {
    dispose = initOfflineSync(() => 'user-1');
    await flushInFlight();
    vi.mocked(flushOnce).mockClear();

    authCallback?.('SIGNED_OUT');
    expect(flushOnce).not.toHaveBeenCalled();

    authCallback?.('SIGNED_IN');
    expect(flushOnce).toHaveBeenCalledTimes(1);
    await flushInFlight();

    authCallback?.('TOKEN_REFRESHED');
    expect(flushOnce).toHaveBeenCalledTimes(2);
  });

  it('the 30s timer only kicks when the queue is non-empty', async () => {
    vi.useFakeTimers();
    const countSpy = vi.spyOn(offlineDB.writes, 'count');
    countSpy.mockResolvedValueOnce(0);

    dispose = initOfflineSync(() => 'user-1');
    vi.mocked(flushOnce).mockClear();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(flushOnce).not.toHaveBeenCalled();

    countSpy.mockResolvedValueOnce(3);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(flushOnce).toHaveBeenCalledWith('user-1');

    countSpy.mockRestore();
  });

  it('dispose removes listeners, the interval, and the auth subscription', () => {
    dispose = initOfflineSync(() => 'user-1');
    vi.mocked(flushOnce).mockClear();
    dispose();
    dispose = null;

    windowStub.fire('online');
    documentStub.fire('visibilitychange');
    authCallback?.('SIGNED_IN');

    expect(flushOnce).not.toHaveBeenCalled();
    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
  });
});
