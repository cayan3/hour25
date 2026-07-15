import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/offline/sync', () => ({
  requestFlush: vi.fn(),
}));

import { offlineDB } from '../../../src/lib/offline/store';
import { enqueueMany, type EntryWrite } from '../../../src/lib/offline/queue';
import { requestFlush } from '../../../src/lib/offline/sync';

beforeEach(async () => {
  await offlineDB.writes.clear();
  vi.mocked(requestFlush).mockClear();
});

describe('enqueueMany', () => {
  it('writes a row with defaults filled in, a fresh rev, and zero attempts', async () => {
    const write: EntryWrite = { date: '2026-07-15', slotIndex: 4, op: 'upsert', labelId: 'label-1' };
    await enqueueMany('user-1', [write]);

    const row = await offlineDB.writes.get(['user-1', '2026-07-15', 4]);
    expect(row).toMatchObject({
      userId: 'user-1',
      date: '2026-07-15',
      slotIndex: 4,
      op: 'upsert',
      labelId: 'label-1',
      note: null,
      chunkMinutes: 30,
      attempts: 0,
    });
    expect(row?.rev).toBeTypeOf('string');
    expect(row?.enqueuedAt).toBeTypeOf('number');
  });

  it('triggers a flush for the writing user', async () => {
    await enqueueMany('user-1', [{ date: '2026-07-15', slotIndex: 4, op: 'upsert', labelId: 'label-1' }]);
    expect(requestFlush).toHaveBeenCalledWith('user-1');
  });

  it('bulkPut dedups repeated writes to the same slot, keeping the latest', async () => {
    await enqueueMany('user-1', [{ date: '2026-07-15', slotIndex: 4, op: 'upsert', labelId: 'label-1' }]);
    const firstRow = await offlineDB.writes.get(['user-1', '2026-07-15', 4]);

    await enqueueMany('user-1', [{ date: '2026-07-15', slotIndex: 4, op: 'upsert', labelId: 'label-2' }]);
    const rows = await offlineDB.writes.toArray();

    expect(rows).toHaveLength(1);
    expect(rows[0].labelId).toBe('label-2');
    expect(rows[0].rev).not.toBe(firstRow?.rev);
  });

  it('preserves an explicit note and chunkMinutes rather than defaulting them', async () => {
    await enqueueMany('user-1', [
      { date: '2026-07-15', slotIndex: 4, op: 'upsert', labelId: 'label-1', note: 'gym', chunkMinutes: 45 },
    ]);
    const row = await offlineDB.writes.get(['user-1', '2026-07-15', 4]);
    expect(row?.note).toBe('gym');
    expect(row?.chunkMinutes).toBe(45);
  });
});
