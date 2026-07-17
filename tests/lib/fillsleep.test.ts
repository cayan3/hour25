import { describe, expect, it } from 'vitest';
import { buildSleepFill, sleepSlotIndices } from '../../src/lib/fillsleep';

const DATE = '2026-07-17';
const SLEEP = 'sleep-label-id';

describe('sleepSlotIndices', () => {
  it('produces a simple forward window, end exclusive', () => {
    expect(sleepSlotIndices(2, 6)).toEqual([2, 3, 4, 5]);
  });

  it('wraps around midnight (23:00–07:00 = 46→14)', () => {
    expect(sleepSlotIndices(46, 14)).toEqual([46, 47, ...Array.from({ length: 14 }, (_, i) => i)]);
  });

  it('treats start === end as no sleep window', () => {
    expect(sleepSlotIndices(10, 10)).toEqual([]);
  });
});

describe('buildSleepFill', () => {
  it('paints every slot of an empty wrap-around window on the given date', () => {
    const writes = buildSleepFill(DATE, SLEEP, 46, 14, new Set());
    expect(writes).toHaveLength(16);
    expect(writes.map((w) => w.slotIndex)).toEqual(sleepSlotIndices(46, 14));
    for (const w of writes) {
      expect(w).toMatchObject({ date: DATE, op: 'upsert', labelId: SLEEP });
    }
  });

  it('skips filled slots (non-destructive)', () => {
    const writes = buildSleepFill(DATE, SLEEP, 46, 2, new Set([47, 0]));
    expect(writes.map((w) => w.slotIndex)).toEqual([46, 1]);
  });

  it('returns nothing when every window slot is already filled', () => {
    expect(buildSleepFill(DATE, SLEEP, 2, 4, new Set([2, 3]))).toEqual([]);
  });

  it('returns nothing for the empty window guard (start === end)', () => {
    expect(buildSleepFill(DATE, SLEEP, 14, 14, new Set())).toEqual([]);
  });

  it('never touches slots outside the window', () => {
    const writes = buildSleepFill(DATE, SLEEP, 44, 46, new Set());
    expect(writes.map((w) => w.slotIndex)).toEqual([44, 45]);
  });
});
