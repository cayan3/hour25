import { describe, it, expect, beforeEach } from 'vitest';
import { offlineDB } from '../../../src/lib/offline/store';

beforeEach(async () => {
  await offlineDB.writes.clear();
  await offlineDB.dead.clear();
});

describe('offlineDB.writes', () => {
  it('dedupes on the compound primary key — a second put replaces the first', async () => {
    const base = {
      userId: 'user-1',
      date: '2026-07-15',
      slotIndex: 3,
      op: 'upsert' as const,
      labelId: 'label-a',
      note: null,
      chunkMinutes: 30,
      enqueuedAt: 1,
      rev: 'rev-1',
      attempts: 0,
    };
    await offlineDB.writes.put(base);
    await offlineDB.writes.put({ ...base, labelId: 'label-b', rev: 'rev-2' });

    const all = await offlineDB.writes.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].labelId).toBe('label-b');
    expect(all[0].rev).toBe('rev-2');
  });

  it('supports compound-key get and delete', async () => {
    const row = {
      userId: 'user-1',
      date: '2026-07-15',
      slotIndex: 9,
      op: 'delete' as const,
      labelId: null,
      note: null,
      chunkMinutes: 30,
      enqueuedAt: 1,
      rev: 'rev-1',
      attempts: 0,
    };
    await offlineDB.writes.put(row);
    expect(await offlineDB.writes.get(['user-1', '2026-07-15', 9])).toBeDefined();

    await offlineDB.writes.delete(['user-1', '2026-07-15', 9]);
    expect(await offlineDB.writes.get(['user-1', '2026-07-15', 9])).toBeUndefined();
  });
});

describe('offlineDB.dead', () => {
  it('auto-increments an id and stores the failure reason', async () => {
    const id = await offlineDB.dead.add({
      userId: 'user-1',
      date: '2026-07-15',
      slotIndex: 9,
      op: 'upsert',
      labelId: 'bad-label',
      note: null,
      chunkMinutes: 30,
      enqueuedAt: 1,
      rev: 'rev-1',
      attempts: 8,
      failedAt: Date.now(),
      reason: 'permanent write failure',
    });
    expect(typeof id).toBe('number');
    const row = await offlineDB.dead.get(id);
    expect(row?.reason).toBe('permanent write failure');
  });
});
