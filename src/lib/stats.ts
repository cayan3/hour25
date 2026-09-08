import { CHUNK_MINUTES, SLOTS_PER_DAY } from './constants';
import { addDays, localDateString, parseLocalDate } from './time';
import type { DatedEntry } from './merge';

function currentSlotIndex(now: Date): number {
  return Math.floor((now.getHours() * 60 + now.getMinutes()) / CHUNK_MINUTES);
}

// How many of a day's slots have elapsed. Past day: all 48. Today: through the
// slot the clock is in. Future day: none — future slots are loggable (pressing
// Fill sleep in the morning writes tonight's 23:00 slots), but they are not yet
// time anyone could have tracked. Counting them would make a fully-logged week
// read as one-third logged on Tuesday, and would let filled exceed expected.
export function expectedSlots(date: string, now: Date = new Date()): number {
  const today = localDateString(now);
  if (date > today) return 0; // YYYY-MM-DD sorts chronologically
  return date === today ? currentSlotIndex(now) + 1 : SLOTS_PER_DAY;
}

// The only definition of "untracked" anywhere in the app (C-31): an empty
// slot IS untracked time. There is no stored Untracked row.
export function untrackedSlots(date: string, filledCount: number, now: Date = new Date()): number {
  return Math.max(0, expectedSlots(date, now) - filledCount);
}

export type PeriodKind = 'day' | 'week' | 'month';

export interface PeriodRange {
  start: string;
  end: string;
}

// Weeks start Monday (ISO-8601), fixed rather than locale-derived: the week
// boundary decides which day's entries land in "this week", so it must read
// the same on every device the account is used from (C-45's reason, applied
// to a boundary rather than a format). Revisit as a user setting if asked for.
export function periodRange(kind: PeriodKind, anchor: string): PeriodRange {
  if (kind === 'day') return { start: anchor, end: anchor };
  if (kind === 'week') {
    const start = addDays(anchor, -((parseLocalDate(anchor).getDay() + 6) % 7));
    return { start, end: addDays(start, 6) };
  }
  const d = parseLocalDate(anchor);
  const y = d.getFullYear();
  const m = d.getMonth();
  // new Date(y, m + 1, 0) is the last day of month m — numeric arguments, so
  // this is not the forbidden string→Date path.
  return {
    start: localDateString(new Date(y, m, 1)),
    end: localDateString(new Date(y, m + 1, 0)),
  };
}

// Step one period backwards/forwards. Month anchors normalize to the 1st so
// stepping never overflows (Jan 31 + 1 month would otherwise land on Mar 3).
export function shiftPeriod(kind: PeriodKind, anchor: string, delta: number): string {
  if (kind === 'day') return addDays(anchor, delta);
  if (kind === 'week') return addDays(anchor, delta * 7);
  const d = parseLocalDate(anchor);
  return localDateString(new Date(d.getFullYear(), d.getMonth() + delta, 1));
}

export function datesInRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export interface LabelTotal {
  labelId: string;
  slots: number;
  minutes: number;
}

export interface PeriodSummary {
  /** Slots that have elapsed in the period — the denominator everything else divides. */
  expectedSlots: number;
  filledSlots: number;
  sleepSlots: number;
  untrackedSlots: number;
  wakingExpectedSlots: number;
  wakingFilledSlots: number;
  expectedMinutes: number;
  filledMinutes: number;
  sleepMinutes: number;
  untrackedMinutes: number;
  wakingExpectedMinutes: number;
  wakingFilledMinutes: number;
  /** 0–100, or null when the period holds no waking time to measure. */
  wakingPercent: number | null;
  /** Every label with at least one elapsed slot, most time first. */
  byLabel: LabelTotal[];
}

// The headline metric (DESIGN §8): filled waking slots ÷ waking slots, with
// sleep subtracted from both sides (C-24). Sleep is whatever carries
// `sleep_label_id` — never a name or category (C-3/C-46) — so irregular nights
// are handled for free: a slot counts as sleep wherever in the day it falls,
// and the configured sleep *window* is not consulted at all (that drives Fill
// sleep only).
//
// Counts elapsed slots only, on both sides, so filled can never exceed
// expected and every figure on the page reconciles: byLabel + untracked =
// expected, and sleep + waking = expected.
export function summarizePeriod(
  entries: DatedEntry[],
  range: PeriodRange,
  sleepLabelId: string | null,
  now: Date = new Date(),
): PeriodSummary {
  const elapsedByDate = new Map(
    datesInRange(range.start, range.end).map((d) => [d, expectedSlots(d, now)]),
  );

  let expected = 0;
  for (const n of elapsedByDate.values()) expected += n;

  const slotsByLabel = new Map<string, number>();
  let filled = 0;
  let sleep = 0;

  for (const entry of entries) {
    const elapsed = elapsedByDate.get(entry.date);
    // Outside the period, or logged ahead of the clock — not measurable yet.
    if (elapsed === undefined || entry.slotIndex >= elapsed) continue;
    filled++;
    if (entry.labelId === sleepLabelId) sleep++;
    slotsByLabel.set(entry.labelId, (slotsByLabel.get(entry.labelId) ?? 0) + 1);
  }

  const untracked = Math.max(0, expected - filled);
  const wakingExpected = Math.max(0, expected - sleep);
  const wakingFilled = Math.max(0, filled - sleep);

  return {
    expectedSlots: expected,
    filledSlots: filled,
    sleepSlots: sleep,
    untrackedSlots: untracked,
    wakingExpectedSlots: wakingExpected,
    wakingFilledSlots: wakingFilled,
    expectedMinutes: expected * CHUNK_MINUTES,
    filledMinutes: filled * CHUNK_MINUTES,
    sleepMinutes: sleep * CHUNK_MINUTES,
    untrackedMinutes: untracked * CHUNK_MINUTES,
    wakingExpectedMinutes: wakingExpected * CHUNK_MINUTES,
    wakingFilledMinutes: wakingFilled * CHUNK_MINUTES,
    wakingPercent: wakingExpected > 0 ? (wakingFilled / wakingExpected) * 100 : null,
    byLabel: [...slotsByLabel.entries()]
      .map(([labelId, slots]) => ({ labelId, slots, minutes: slots * CHUNK_MINUTES }))
      .sort((a, b) => b.slots - a.slots || a.labelId.localeCompare(b.labelId)),
  };
}
