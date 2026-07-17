import { SLOTS_PER_DAY } from './constants';
import type { EntryWrite } from './offline/queue';

// The sleep window's slot indices in fill order, handling the wrap-around
// window (e.g. 46→14 = 23:00–07:00: slots 46, 47, 0…13). start === end is
// treated as no sleep window (SPEC §8) — the Settings UI prevents saving it,
// this guard covers data that predates that rule.
export function sleepSlotIndices(sleepStart: number, sleepEnd: number): number[] {
  if (sleepStart === sleepEnd) return [];
  const indices: number[] = [];
  for (let i = sleepStart; i !== sleepEnd; i = (i + 1) % SLOTS_PER_DAY) {
    indices.push(i);
  }
  return indices;
}

// SPEC §8: pure and non-destructive — paints only the sleep window, always
// skipping filled slots. The caller computes `filled` from the MERGED
// (server + pending) state, never a live server read, so Fill sleep works
// identically offline.
export function buildSleepFill(
  date: string,
  sleepLabelId: string,
  sleepStart: number,
  sleepEnd: number,
  filled: ReadonlySet<number>,
): EntryWrite[] {
  const writes: EntryWrite[] = [];
  for (const i of sleepSlotIndices(sleepStart, sleepEnd)) {
    if (!filled.has(i)) writes.push({ date, slotIndex: i, op: 'upsert', labelId: sleepLabelId });
  }
  return writes;
}
