import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/offline/sync', () => ({
  requestFlush: vi.fn(),
}));

import { offlineDB, type DeadWrite } from '../../../src/lib/offline/store';
import { retryDeadWrite, discardDeadWrite } from '../../../src/lib/offline/deadLetters';
import { useQueueStatusStore } from '../../../src/store/queueStatus';

const USER = 'user-1';

function deadRow(overrides: Partial<DeadWrite> = {}): DeadWrite {
  return {
    userId: USER,
    date: '2026-07-16',
    slotIndex: 18,
    op: 'upsert',
    labelId: 'label-old',
    note: null,
    chunkMinutes: 30,
    enqueuedAt: 1,
    rev: 'rev-dead',
    attempts: 8,
    failedAt: Date.now(),
    reason: 'permanent write failure',
    ...overrides,
  };
}

beforeEach(async () => {
  await offlineDB.writes.clear();
  await offlineDB.dead.clear();
  useQueueStatusStore.setState({ status: 'idle', deadCount: 0 });
});

describe('retryDeadWrite', () => {
  it('re-enqueues through the normal queue and removes the dead row when the slot has no pending write', async () => {
    const id = await offlineDB.dead.add(deadRow());
    const dead = (await offlineDB.dead.get(id))!;

    await retryDeadWrite(USER, dead);

    const queued = await offlineDB.writes.get([USER, '2026-07-16', 18]);
    expect(queued).toMatchObject({ op: 'upsert', labelId: 'label-old', attempts: 0 });
    expect(await offlineDB.dead.count()).toBe(0);
    expect(useQueueStatusStore.getState().deadCount).toBe(0);
  });

  it('never clobbers a newer pending write for the same slot — the live write wins, the dead row still clears', async () => {
    const id = await offlineDB.dead.add(deadRow());
    const dead = (await offlineDB.dead.get(id))!;
    // The user re-labeled the slot after it was set aside: strictly newer
    // intent, queued but not yet flushed.
    await offlineDB.writes.put({
      userId: USER,
      date: '2026-07-16',
      slotIndex: 18,
      op: 'upsert',
      labelId: 'label-new',
      note: 'kept',
      chunkMinutes: 30,
      enqueuedAt: 2,
      rev: 'rev-new',
      attempts: 0,
    });

    await retryDeadWrite(USER, dead);

    const queued = await offlineDB.writes.get([USER, '2026-07-16', 18]);
    expect(queued?.labelId).toBe('label-new');
    expect(queued?.note).toBe('kept');
    expect(queued?.rev).toBe('rev-new');
    expect(await offlineDB.dead.count()).toBe(0);
  });

  it('does not skip re-enqueueing for a pending write on a different slot', async () => {
    const id = await offlineDB.dead.add(deadRow({ slotIndex: 18 }));
    const dead = (await offlineDB.dead.get(id))!;
    await offlineDB.writes.put({
      userId: USER,
      date: '2026-07-16',
      slotIndex: 19,
      op: 'upsert',
      labelId: 'label-neighbor',
      note: null,
      chunkMinutes: 30,
      enqueuedAt: 2,
      rev: 'rev-19',
      attempts: 0,
    });

    await retryDeadWrite(USER, dead);

    expect((await offlineDB.writes.get([USER, '2026-07-16', 18]))?.labelId).toBe('label-old');
    expect((await offlineDB.writes.get([USER, '2026-07-16', 19]))?.labelId).toBe('label-neighbor');
  });
});

describe('discardDeadWrite', () => {
  it('drops the dead row without queueing anything and republishes the count', async () => {
    const id = await offlineDB.dead.add(deadRow());
    const dead = (await offlineDB.dead.get(id))!;

    await discardDeadWrite(USER, dead);

    expect(await offlineDB.dead.count()).toBe(0);
    expect(await offlineDB.writes.count()).toBe(0);
    expect(useQueueStatusStore.getState().deadCount).toBe(0);
  });
});
