import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// sync.ts imports the real Supabase client at module load (initOfflineSync's
// auth listener). This file only exercises requestFlush, and constructing a
// client would need the env vars.
vi.mock('../../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

import { offlineDB } from '../../../src/lib/offline/store';
import { configureFlush, type FlushDeps } from '../../../src/lib/offline/flush';
import { requestFlush } from '../../../src/lib/offline/sync';
import { useQueueStatusStore } from '../../../src/store/queueStatus';
import { SESSION_DEADLINE_MS } from '../../../src/lib/constants';

const USER = 'user-1';

// A faithful-enough Web Locks stand-in: one holder at a time, later requests
// queue behind it. That queueing is exactly what makes a hung flush wedge every
// other tab and PWA window on the origin, so the test needs it to be real.
function lockManagerStub() {
  const log: string[] = [];
  let tail: Promise<unknown> = Promise.resolve();
  const locks = {
    request<T>(name: string, callback: () => Promise<T>): Promise<T> {
      const run = tail.then(async () => {
        log.push(`acquired:${name}`);
        try {
          return await callback();
        } finally {
          log.push(`released:${name}`);
        }
      });
      tail = run.catch(() => undefined);
      return run;
    },
  };
  return { log, locks };
}

function deps(overrides: Partial<FlushDeps> = {}): FlushDeps {
  return {
    getSession: async () => ({ userId: USER }),
    sendUpsertBatch: vi.fn(async () => {}),
    sendDeleteBatch: vi.fn(async () => {}),
    ...overrides,
  };
}

beforeEach(async () => {
  await offlineDB.writes.clear();
  await offlineDB.dead.clear();
  useQueueStatusStore.setState({ status: 'idle', deadCount: 0, lastSyncedAt: null });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('requestFlush — C-75: a hung getSession must not hold the origin lock', () => {
  it('releases tt-flush and lets the next flush through when getSession never resolves', async () => {
    const lockManager = lockManagerStub();
    vi.stubGlobal('navigator', lockManager);
    configureFlush(deps({ getSession: () => new Promise(() => {}) }));

    // Only the deadline's own timer APIs: fake-indexeddb settles its requests
    // through setImmediate, and faking that stalls every Dexie call here.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const hung = requestFlush(USER);
    await vi.advanceTimersByTimeAsync(SESSION_DEADLINE_MS);

    await expect(hung).resolves.toBe('network');
    expect(lockManager.log).toEqual(['acquired:tt-flush', 'released:tt-flush']);

    // The lock is free again, so a later flush — this tab's next trigger, or
    // any other tab or PWA window on the origin — still gets to run.
    const sendUpsertBatch = vi.fn(async () => {});
    configureFlush(deps({ sendUpsertBatch }));

    await expect(requestFlush(USER)).resolves.toBe('complete');
    expect(lockManager.log).toEqual([
      'acquired:tt-flush',
      'released:tt-flush',
      'acquired:tt-flush',
      'released:tt-flush',
    ]);
  });
});
