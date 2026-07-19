import { describe, it, expect } from 'vitest';
import { mergePending, mergePendingAllDates, type ServerEntryRow } from '../../src/lib/merge';
import type { QueuedWrite } from '../../src/lib/offline/store';

const DATE = '2026-07-15';

function pendingRow(overrides: Partial<QueuedWrite>): QueuedWrite {
  return {
    userId: 'user-1',
    date: DATE,
    slotIndex: 0,
    op: 'upsert',
    labelId: null,
    note: null,
    chunkMinutes: 30,
    enqueuedAt: 1,
    rev: 'rev-1',
    attempts: 0,
    ...overrides,
  };
}

const server: ServerEntryRow[] = [
  { date: DATE, slot_index: 1, label_id: 'server-label', note: null, chunk_minutes: 30 },
  { date: DATE, slot_index: 2, label_id: 'server-label-2', note: 'hi', chunk_minutes: 30 },
];

describe('mergePending', () => {
  it('an upsert overrides server data for that slot', () => {
    const pending = [pendingRow({ slotIndex: 1, labelId: 'pending-label', note: 'edited' })];
    const result = mergePending(server, pending);
    const slot1 = result.find((r) => r.slotIndex === 1);
    expect(slot1).toMatchObject({ labelId: 'pending-label', note: 'edited' });
  });

  it('a delete tombstones a server slot', () => {
    const pending = [pendingRow({ slotIndex: 2, op: 'delete', labelId: null })];
    const result = mergePending(server, pending);
    expect(result.find((r) => r.slotIndex === 2)).toBeUndefined();
  });

  it('returns an empty array for empty inputs', () => {
    expect(mergePending([], [])).toEqual([]);
  });

  it('handles a pending-only day (no server rows yet)', () => {
    const pending = [pendingRow({ slotIndex: 5, labelId: 'new-label' })];
    const result = mergePending([], pending);
    expect(result).toEqual([{ slotIndex: 5, labelId: 'new-label', note: null, chunkMinutes: 30 }]);
  });

  it('handles a server-only day (no pending writes)', () => {
    const result = mergePending(server, []);
    expect(result.map((r) => r.slotIndex)).toEqual([1, 2]);
  });

  it('sorts the merged result by slotIndex', () => {
    const pending = [pendingRow({ slotIndex: 0, labelId: 'earliest' })];
    const result = mergePending(server, pending);
    expect(result.map((r) => r.slotIndex)).toEqual([0, 1, 2]);
  });
});

describe('mergePendingAllDates', () => {
  it('applies the overlay per date and returns entries sorted by date then slot', () => {
    const result = mergePendingAllDates(
      [
        { date: '2026-07-16', slot_index: 5, label_id: 'a', note: null, chunk_minutes: 30 },
        { date: '2026-07-15', slot_index: 3, label_id: 'b', note: null, chunk_minutes: 30 },
      ],
      [pendingRow({ date: '2026-07-15', slotIndex: 1, labelId: 'c' })],
    );
    expect(result.map((r) => [r.date, r.slotIndex])).toEqual([
      ['2026-07-15', 1],
      ['2026-07-15', 3],
      ['2026-07-16', 5],
    ]);
  });

  it('keeps a pending delete from one date out without touching another date', () => {
    const result = mergePendingAllDates(
      [
        { date: '2026-07-15', slot_index: 3, label_id: 'b', note: null, chunk_minutes: 30 },
        { date: '2026-07-16', slot_index: 3, label_id: 'b', note: null, chunk_minutes: 30 },
      ],
      [pendingRow({ date: '2026-07-15', slotIndex: 3, op: 'delete' })],
    );
    expect(result.map((r) => r.date)).toEqual(['2026-07-16']);
  });

  it('includes a date the server has never seen', () => {
    const result = mergePendingAllDates(
      [],
      [pendingRow({ date: '2026-07-20', slotIndex: 8, labelId: 'offline-only' })],
    );
    expect(result).toEqual([
      { date: '2026-07-20', slotIndex: 8, labelId: 'offline-only', note: null, chunkMinutes: 30 },
    ]);
  });
});
