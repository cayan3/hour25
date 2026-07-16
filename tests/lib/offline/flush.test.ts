import { describe, it, expect, vi, beforeEach } from 'vitest';

import { offlineDB, type QueuedWrite } from '../../../src/lib/offline/store';
import { configureFlush, flushOnce, type FlushDeps } from '../../../src/lib/offline/flush';
import { deferred } from '../../helpers/deferred';
import { MAX_FLUSH_ATTEMPTS } from '../../../src/lib/constants';

const USER = 'user-1';
let seq = 0;

// Seeds a queue row directly (bypassing enqueueMany, which lives in a later
// task) — exactly the shape enqueueMany would have produced.
function seedRow(overrides: Partial<QueuedWrite> = {}): QueuedWrite {
  seq += 1;
  return {
    userId: USER,
    date: '2026-07-15',
    slotIndex: 0,
    op: 'upsert',
    labelId: 'label-1',
    note: null,
    chunkMinutes: 30,
    enqueuedAt: seq,
    rev: `rev-${seq}`,
    attempts: 0,
    ...overrides,
  };
}

beforeEach(async () => {
  await offlineDB.writes.clear();
  await offlineDB.dead.clear();
});

function baseDeps(overrides: Partial<FlushDeps> = {}): FlushDeps {
  return {
    getSession: async () => ({ userId: USER }),
    sendUpsertBatch: vi.fn(async () => {}),
    sendDeleteBatch: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('flushOnce — session check', () => {
  it("returns 'auth' and touches nothing when there is no session", async () => {
    const sendUpsertBatch = vi.fn(async () => {});
    configureFlush(baseDeps({ getSession: async () => null, sendUpsertBatch }));

    await offlineDB.writes.put(seedRow({ slotIndex: 1, labelId: 'x' }));

    const result = await flushOnce(USER);

    expect(result).toBe('auth');
    expect(sendUpsertBatch).not.toHaveBeenCalled();
    const row = await offlineDB.writes.get([USER, '2026-07-15', 1]);
    expect(row).toBeDefined();
    expect(row?.attempts).toBe(0);
  });
});

describe('flushOnce — C-27 edit-during-flight race', () => {
  it('keeps a slot edited mid-flush after the stale send completes', async () => {
    const gate = deferred<void>();
    const sendUpsertBatch = vi.fn(() => gate.promise);
    configureFlush(baseDeps({ sendUpsertBatch }));

    await offlineDB.writes.put(seedRow({ slotIndex: 10, labelId: 'label-A', rev: 'rev-A' }));

    const flushPromise = flushOnce(USER);
    // fake-indexeddb resolves requests via setImmediate (a real macrotask,
    // matching browser IndexedDB semantics), so plain microtask ticks
    // (`await Promise.resolve()`) never observe the pending Dexie read
    // completing. Poll instead of guessing a tick count.
    await vi.waitFor(() => {
      expect(sendUpsertBatch).toHaveBeenCalledTimes(1);
    });

    // Simulate a re-enqueue of the same slot while the first send is still in
    // flight — a fresh put with a new rev, exactly what enqueueMany would do.
    await offlineDB.writes.put(seedRow({ slotIndex: 10, labelId: 'label-B', rev: 'rev-B' }));
    const midFlightRow = await offlineDB.writes.get([USER, '2026-07-15', 10]);
    expect(midFlightRow?.labelId).toBe('label-B');

    gate.resolve(); // let the stale send complete
    const result = await flushPromise;

    expect(result).toBe('complete');
    const survivingRow = await offlineDB.writes.get([USER, '2026-07-15', 10]);
    expect(survivingRow).toBeDefined();
    expect(survivingRow?.labelId).toBe('label-B');
  });
});

describe('flushOnce — C-29 attempts policy', () => {
  it('a global (batch-level) network failure stops the loop and bumps nothing', async () => {
    const sendUpsertBatch = vi.fn(async () => {
      throw Object.assign(new Error('down'), { status: 500 });
    });
    configureFlush(baseDeps({ sendUpsertBatch }));

    await offlineDB.writes.put(seedRow({ slotIndex: 5, labelId: 'label-A', rev: 'rev-5' }));
    const before = await offlineDB.writes.get([USER, '2026-07-15', 5]);

    const result = await flushOnce(USER);

    expect(result).toBe('network');
    const after = await offlineDB.writes.get([USER, '2026-07-15', 5]);
    expect(after).toEqual(before);
    expect(after?.attempts).toBe(0);
  });

  it('isolates a poison row (dead-letters it) while a healthy row in the same batch still flushes', async () => {
    const sendUpsertBatch = vi.fn(async (_userId: string, rows: { slotIndex: number }[]) => {
      if (rows.length > 1 || rows[0].slotIndex === 6) {
        throw Object.assign(new Error('constraint violation'), { code: '23505' });
      }
    });
    configureFlush(baseDeps({ sendUpsertBatch }));

    await offlineDB.writes.put(seedRow({ slotIndex: 6, labelId: 'bad-label', rev: 'rev-6' }));
    await offlineDB.writes.put(seedRow({ slotIndex: 7, labelId: 'good-label', rev: 'rev-7' }));

    const result = await flushOnce(USER);

    expect(result).toBe('complete');
    const deadRows = await offlineDB.dead.toArray();
    expect(deadRows).toHaveLength(1);
    expect(deadRows[0].slotIndex).toBe(6);
    expect(await offlineDB.writes.get([USER, '2026-07-15', 6])).toBeUndefined();
    expect(await offlineDB.writes.get([USER, '2026-07-15', 7])).toBeUndefined(); // flushed successfully
  });

  it('bumps only the failing row and stops isolation on a network failure, leaving later rows untouched', async () => {
    const sendUpsertBatch = vi.fn(async (_userId: string, rows: { slotIndex: number }[]) => {
      // First call is the 2-row batch -> force isolation.
      // Isolated single-row call for slot 6 always fails as a network blip.
      if (rows.length > 1) {
        throw Object.assign(new Error('constraint violation'), { code: '23505' });
      }
      if (rows[0].slotIndex === 6) {
        throw Object.assign(new Error('flaky'), { status: 500 });
      }
    });
    configureFlush(baseDeps({ sendUpsertBatch }));

    await offlineDB.writes.put(seedRow({ slotIndex: 6, labelId: 'flaky-label', rev: 'rev-6' }));
    await offlineDB.writes.put(seedRow({ slotIndex: 7, labelId: 'good-label', rev: 'rev-7' }));

    const result = await flushOnce(USER);

    // The network classification stops the isolation pass and the whole flush
    // (SPEC §6 step 6): slot 6 gets its one attempts bump, slot 7 is never
    // sent and never bumped — a connectivity drop mid-isolation must not burn
    // attempts across the rest of the batch.
    expect(result).toBe('network');
    const row = await offlineDB.writes.get([USER, '2026-07-15', 6]);
    expect(row).toBeDefined();
    expect(row?.attempts).toBe(1);
    const laterRow = await offlineDB.writes.get([USER, '2026-07-15', 7]);
    expect(laterRow).toBeDefined();
    expect(laterRow?.attempts).toBe(0);
    expect(await offlineDB.dead.toArray()).toHaveLength(0);
  });

  it('dead-letters a row once its attempts reach MAX_FLUSH_ATTEMPTS during isolation', async () => {
    const sendUpsertBatch = vi.fn(async (_userId: string, rows: { slotIndex: number }[]) => {
      // First call is the 2-row batch -> force isolation.
      // Isolated single-row call for slot 6 always fails as a network blip.
      if (rows.length > 1) {
        throw Object.assign(new Error('constraint violation'), { code: '23505' });
      }
      if (rows[0].slotIndex === 6) {
        throw Object.assign(new Error('flaky'), { status: 500 });
      }
    });
    configureFlush(baseDeps({ sendUpsertBatch }));

    await offlineDB.writes.put(
      seedRow({ slotIndex: 6, labelId: 'flaky-label', rev: 'rev-6', attempts: MAX_FLUSH_ATTEMPTS - 1 })
    );
    await offlineDB.writes.put(seedRow({ slotIndex: 7, labelId: 'good-label', rev: 'rev-7' }));

    const result = await flushOnce(USER);

    expect(await offlineDB.writes.get([USER, '2026-07-15', 6])).toBeUndefined();
    const deadRows = await offlineDB.dead.toArray();
    expect(deadRows).toHaveLength(1);
    expect(deadRows[0].slotIndex).toBe(6);
    expect(deadRows[0].attempts).toBe(MAX_FLUSH_ATTEMPTS);
    // The failure that pushed slot 6 over the cap was a network classification,
    // so the flush still stops there — slot 7 stays queued for the next round.
    expect(result).toBe('network');
    expect(await offlineDB.writes.get([USER, '2026-07-15', 7])).toBeDefined();
  });
});
