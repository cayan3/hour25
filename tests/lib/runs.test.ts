import { describe, it, expect } from 'vitest';
import { computeRuns, clipRunsToRows } from '../../src/lib/runs';
import type { MergedEntry } from '../../src/lib/merge';

function entry(slotIndex: number, labelId: string, note: string | null = null): MergedEntry {
  return { slotIndex, labelId, note, chunkMinutes: 30 };
}

describe('computeRuns', () => {
  it('returns no runs for an empty day', () => {
    expect(computeRuns([])).toEqual([]);
  });

  it('a lone slot is a single-slot run', () => {
    expect(computeRuns([entry(5, 'a')])).toEqual([{ start: 5, end: 5, labelId: 'a' }]);
  });

  it('merges contiguous same-label slots into one run', () => {
    expect(computeRuns([entry(4, 'a'), entry(5, 'a'), entry(6, 'a')])).toEqual([
      { start: 4, end: 6, labelId: 'a' },
    ]);
  });

  it('adjacent slots with different labels are separate runs', () => {
    expect(computeRuns([entry(4, 'a'), entry(5, 'b')])).toEqual([
      { start: 4, end: 4, labelId: 'a' },
      { start: 5, end: 5, labelId: 'b' },
    ]);
  });

  it('a gap breaks a run even for the same label', () => {
    expect(computeRuns([entry(4, 'a'), entry(6, 'a')])).toEqual([
      { start: 4, end: 4, labelId: 'a' },
      { start: 6, end: 6, labelId: 'a' },
    ]);
  });

  it('a note does not break a run', () => {
    expect(computeRuns([entry(4, 'a'), entry(5, 'a', 'lunch note')])).toEqual([
      { start: 4, end: 5, labelId: 'a' },
    ]);
  });

  it('a wrap-around sleep pattern (0–13 and 46–47) is two runs within one day', () => {
    const entries = [
      ...Array.from({ length: 14 }, (_, i) => entry(i, 'sleep')),
      entry(46, 'sleep'),
      entry(47, 'sleep'),
    ];
    expect(computeRuns(entries)).toEqual([
      { start: 0, end: 13, labelId: 'sleep' },
      { start: 46, end: 47, labelId: 'sleep' },
    ]);
  });
});

describe('clipRunsToRows', () => {
  it('a run inside one row is a single segment carrying the full run length', () => {
    expect(clipRunsToRows([{ start: 2, end: 5, labelId: 'a' }], 12)).toEqual([
      { start: 2, end: 5, labelId: 'a', runLength: 4 },
    ]);
  });

  it('clips a run crossing a row boundary into two segments (DESIGN §2: correct, not a bug)', () => {
    expect(clipRunsToRows([{ start: 10, end: 14, labelId: 'a' }], 12)).toEqual([
      { start: 10, end: 11, labelId: 'a', runLength: 5 },
      { start: 12, end: 14, labelId: 'a', runLength: 5 },
    ]);
  });

  it('a run spanning several full rows produces one segment per row', () => {
    expect(clipRunsToRows([{ start: 0, end: 35, labelId: 'a' }], 12)).toEqual([
      { start: 0, end: 11, labelId: 'a', runLength: 36 },
      { start: 12, end: 23, labelId: 'a', runLength: 36 },
      { start: 24, end: 35, labelId: 'a', runLength: 36 },
    ]);
  });

  it('a run ending exactly at a row boundary does not spill a segment into the next row', () => {
    expect(clipRunsToRows([{ start: 8, end: 11, labelId: 'a' }], 12)).toEqual([
      { start: 8, end: 11, labelId: 'a', runLength: 4 },
    ]);
  });
});
