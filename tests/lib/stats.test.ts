import { describe, it, expect } from 'vitest';
import {
  datesInRange,
  expectedSlots,
  periodRange,
  previousPeriodNow,
  shiftPeriod,
  totalsByCategory,
  summarizePeriod,
  untrackedSlots,
} from '../../src/lib/stats';
import type { DatedEntry } from '../../src/lib/merge';

const SLEEP = 'label-sleep';
const WORK = 'label-work';
const READING = 'label-reading';

function entry(date: string, slotIndex: number, labelId: string): DatedEntry {
  return { date, slotIndex, labelId, note: null, chunkMinutes: 30 };
}

// Fills [from, to) on one date with one label.
function fill(date: string, from: number, to: number, labelId: string): DatedEntry[] {
  return Array.from({ length: to - from }, (_, i) => entry(date, from + i, labelId));
}

describe('expectedSlots', () => {
  const now = new Date(2026, 6, 15, 10, 15); // Wed 15 Jul 2026, 10:15 -> slot 20

  it('is the whole day for a past day', () => {
    expect(expectedSlots('2026-07-01', now)).toBe(48);
  });

  it('is currentSlotIndex + 1 for today', () => {
    expect(expectedSlots('2026-07-15', now)).toBe(21);
  });

  it('is zero for a future day', () => {
    // Future slots are loggable, but no time there has elapsed yet — counting
    // them would make a fully-logged week read as part-logged mid-week.
    expect(expectedSlots('2026-07-16', now)).toBe(0);
  });
});

describe('untrackedSlots', () => {
  it('is 48 minus filled for a past day', () => {
    const now = new Date(2026, 6, 15, 10, 0);
    expect(untrackedSlots('2026-07-01', 30, now)).toBe(48 - 30);
  });

  it('is currentSlotIndex + 1 minus filled for today-in-progress', () => {
    const now = new Date(2026, 6, 15, 10, 15); // 10:15am -> slot 20 -> expected 21
    expect(untrackedSlots('2026-07-15', 5, now)).toBe(21 - 5);
  });

  it('never goes negative when filled exceeds expected', () => {
    const now = new Date(2026, 6, 15, 10, 0);
    expect(untrackedSlots('2026-07-01', 100, now)).toBe(0);
  });
});

describe('periodRange', () => {
  it('spans one day for a day period', () => {
    expect(periodRange('day', '2026-07-15')).toEqual({ start: '2026-07-15', end: '2026-07-15' });
  });

  it('runs Monday to Sunday for a week period', () => {
    expect(periodRange('week', '2026-07-15')).toEqual({ start: '2026-07-13', end: '2026-07-19' });
  });

  it('keeps a Sunday in the week that started the Monday before it', () => {
    // The off-by-one a Sunday-start convention would produce: 12 Jul is a
    // Sunday, and belongs to the week beginning Mon 6 Jul.
    expect(periodRange('week', '2026-07-12')).toEqual({ start: '2026-07-06', end: '2026-07-12' });
  });

  it('spans the calendar month, whatever day anchors it', () => {
    expect(periodRange('month', '2026-07-15')).toEqual({ start: '2026-07-01', end: '2026-07-31' });
    expect(periodRange('month', '2026-02-10')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });

  it('handles a leap February', () => {
    expect(periodRange('month', '2028-02-10').end).toBe('2028-02-29');
  });
});

describe('shiftPeriod', () => {
  it('steps a day and a week', () => {
    expect(shiftPeriod('day', '2026-07-15', -1)).toBe('2026-07-14');
    expect(shiftPeriod('week', '2026-07-15', 1)).toBe('2026-07-22');
  });

  it('steps months without overflowing off a 31st', () => {
    // Naive date arithmetic turns 31 Jan + 1 month into 3 Mar.
    expect(periodRange('month', shiftPeriod('month', '2026-01-31', 1))).toEqual({
      start: '2026-02-01',
      end: '2026-02-28',
    });
  });

  it('steps across a year boundary', () => {
    expect(shiftPeriod('month', '2026-01-15', -1)).toBe('2025-12-01');
  });
});

describe('datesInRange', () => {
  it('is inclusive at both ends', () => {
    expect(datesInRange('2026-07-13', '2026-07-15')).toEqual([
      '2026-07-13',
      '2026-07-14',
      '2026-07-15',
    ]);
  });

  it('crosses a month boundary', () => {
    expect(datesInRange('2026-06-29', '2026-07-02')).toEqual([
      '2026-06-29',
      '2026-06-30',
      '2026-07-01',
      '2026-07-02',
    ]);
  });

  it('is a single day when start equals end', () => {
    expect(datesInRange('2026-07-15', '2026-07-15')).toEqual(['2026-07-15']);
  });
});

describe('summarizePeriod', () => {
  const now = new Date(2026, 6, 15, 10, 15); // Wed 15 Jul 2026, 10:15
  const pastDay = { start: '2026-07-01', end: '2026-07-01' };

  it('subtracts sleep from both sides of the waking percentage', () => {
    // A fully logged past day: 16 slots of sleep, 32 of work. Waking time is
    // 32 slots and all 32 are logged, so the headline is 100% — not 67%.
    const entries = [...fill('2026-07-01', 0, 16, SLEEP), ...fill('2026-07-01', 16, 48, WORK)];
    const s = summarizePeriod(entries, pastDay, SLEEP, now);

    expect(s.expectedSlots).toBe(48);
    expect(s.filledSlots).toBe(48);
    expect(s.sleepSlots).toBe(16);
    expect(s.untrackedSlots).toBe(0);
    expect(s.wakingExpectedSlots).toBe(32);
    expect(s.wakingFilledSlots).toBe(32);
    expect(s.wakingPercent).toBe(100);
    expect(s.wakingExpectedMinutes).toBe(32 * 30);
  });

  it('counts sleep by label id, not by which slots the sleep window covers', () => {
    // An irregular night: asleep 02:00-11:00 (slots 4-21), nothing like the
    // 23:00-07:00 window a user would have configured. It is still sleep,
    // because sleep is whatever carries sleep_label_id (C-3/C-24).
    const entries = [...fill('2026-07-01', 4, 22, SLEEP), ...fill('2026-07-01', 22, 48, WORK)];
    const s = summarizePeriod(entries, pastDay, SLEEP, now);

    expect(s.sleepSlots).toBe(18);
    expect(s.wakingExpectedSlots).toBe(48 - 18);
    expect(s.wakingFilledSlots).toBe(26); // the work slots
    // 26 of 30 waking slots logged; the 4 unlogged ones are 00:00-02:00.
    expect(s.wakingPercent).toBeCloseTo((26 / 30) * 100);
  });

  it('subtracts nothing when no sleep label is set', () => {
    const entries = fill('2026-07-01', 0, 24, WORK);
    const s = summarizePeriod(entries, pastDay, null, now);

    expect(s.sleepSlots).toBe(0);
    expect(s.wakingExpectedSlots).toBe(48);
    expect(s.wakingPercent).toBe(50);
  });

  it('does not treat a different label as sleep', () => {
    const entries = fill('2026-07-01', 0, 16, READING);
    const s = summarizePeriod(entries, pastDay, SLEEP, now);

    expect(s.sleepSlots).toBe(0);
    expect(s.byLabel).toEqual([{ labelId: READING, slots: 16, minutes: 480 }]);
  });

  it('ignores slots logged ahead of the clock on today', () => {
    // Pressing Fill sleep in the morning writes tonight's 23:00-24:00 slots.
    // Counting them would put filled above expected and the headline above
    // 100% for anyone who uses the button before bed.
    const entries = [
      ...fill('2026-07-15', 0, 21, WORK), // 00:00 through the current slot
      ...fill('2026-07-15', 46, 48, SLEEP), // 23:00-24:00, still in the future
    ];
    const s = summarizePeriod(entries, { start: '2026-07-15', end: '2026-07-15' }, SLEEP, now);

    expect(s.expectedSlots).toBe(21);
    expect(s.filledSlots).toBe(21);
    expect(s.sleepSlots).toBe(0);
    expect(s.wakingPercent).toBe(100);
    expect(s.byLabel).toEqual([{ labelId: WORK, slots: 21, minutes: 630 }]);
  });

  it('counts only the elapsed part of a week in progress', () => {
    // Mon-Wed 10:15 = 48 + 48 + 21 elapsed slots; Thu-Sun contribute nothing.
    const week = periodRange('week', '2026-07-15');
    const s = summarizePeriod([], week, SLEEP, now);

    expect(week).toEqual({ start: '2026-07-13', end: '2026-07-19' });
    expect(s.expectedSlots).toBe(48 + 48 + 21);
    expect(s.untrackedSlots).toBe(48 + 48 + 21);
  });

  it('ignores entries outside the period', () => {
    const entries = [...fill('2026-07-01', 0, 10, WORK), ...fill('2026-06-30', 0, 10, WORK)];
    const s = summarizePeriod(entries, pastDay, SLEEP, now);

    expect(s.filledSlots).toBe(10);
  });

  it('sorts byLabel by time logged, most first', () => {
    const entries = [
      ...fill('2026-07-01', 0, 4, READING),
      ...fill('2026-07-01', 4, 20, SLEEP),
      ...fill('2026-07-01', 20, 30, WORK),
    ];
    const s = summarizePeriod(entries, pastDay, SLEEP, now);

    expect(s.byLabel.map((l) => l.labelId)).toEqual([SLEEP, WORK, READING]);
  });

  it('reports an empty account as all untracked, not as an error', () => {
    const s = summarizePeriod([], pastDay, null, now);

    expect(s.filledSlots).toBe(0);
    expect(s.untrackedSlots).toBe(48);
    expect(s.wakingPercent).toBe(0);
    expect(s.byLabel).toEqual([]);
  });

  it('returns a null percentage rather than NaN when no time has elapsed', () => {
    // Next week, viewed today: nothing to divide by.
    const s = summarizePeriod([], periodRange('week', '2026-07-22'), SLEEP, now);

    expect(s.expectedSlots).toBe(0);
    expect(s.wakingPercent).toBeNull();
  });

  it('returns a null percentage when the whole period was spent asleep', () => {
    const entries = fill('2026-07-01', 0, 48, SLEEP);
    const s = summarizePeriod(entries, pastDay, SLEEP, now);

    expect(s.wakingExpectedSlots).toBe(0);
    expect(s.wakingPercent).toBeNull();
  });
});

describe('summarizePeriod byDate', () => {
  const now = new Date(2026, 6, 15, 10, 15); // Wed 15 Jul 2026, 10:15

  it('emits one row per calendar day, in order, including untouched days', () => {
    const week = periodRange('week', '2026-07-15');
    const s = summarizePeriod(fill('2026-07-13', 0, 10, WORK), week, SLEEP, now);

    expect(s.byDate.map((d) => d.date)).toEqual(datesInRange(week.start, week.end));
    expect(s.byDate[0]).toEqual({
      date: '2026-07-13',
      expectedSlots: 48,
      filledSlots: 10,
      sleepSlots: 0,
    });
    expect(s.byDate[1].filledSlots).toBe(0);
  });

  it('splits sleep out of each day, so a day can show what it lost to waking gaps', () => {
    const entries = [...fill('2026-07-13', 0, 16, SLEEP), ...fill('2026-07-13', 16, 40, WORK)];
    const day = summarizePeriod(entries, periodRange('week', '2026-07-15'), SLEEP, now).byDate[0];

    expect(day.filledSlots).toBe(40);
    expect(day.sleepSlots).toBe(16);
  });

  it('marks days after the clock as having no elapsed time', () => {
    const s = summarizePeriod([], periodRange('week', '2026-07-15'), SLEEP, now);

    expect(s.byDate.map((d) => d.expectedSlots)).toEqual([48, 48, 21, 0, 0, 0, 0]);
  });
});

describe('previousPeriodNow', () => {
  it('steps back one day, one week, or one month of wall-clock time', () => {
    const now = new Date(2026, 6, 15, 10, 15);
    expect(previousPeriodNow('day', now)).toEqual(new Date(2026, 6, 14, 10, 15));
    expect(previousPeriodNow('week', now)).toEqual(new Date(2026, 6, 8, 10, 15));
    expect(previousPeriodNow('month', now)).toEqual(new Date(2026, 5, 15, 10, 15));
  });

  it('steps a month across a year boundary', () => {
    expect(previousPeriodNow('month', new Date(2026, 0, 15, 9, 0))).toEqual(
      new Date(2025, 11, 15, 9, 0),
    );
  });

  it('leaves a short previous month fully elapsed when the 31st steps back', () => {
    // 31 Feb overflows to 3 Mar — which lands after February's end, so the
    // whole of February counts. That is the intended reading, not a bug.
    const stepped = previousPeriodNow('month', new Date(2026, 2, 31, 10, 0));
    const february = periodRange('month', shiftPeriod('month', '2026-03-31', -1));
    expect(summarizePeriod([], february, null, stepped).expectedSlots).toBe(28 * 48);
  });
});

describe('totalsByCategory', () => {
  const byLabel = [
    { labelId: SLEEP, slots: 48, minutes: 1440 },
    { labelId: WORK, slots: 30, minutes: 900 },
    { labelId: READING, slots: 6, minutes: 180 },
  ];
  const categoryOf = new Map<string, string | null>([
    [SLEEP, 'cat-health'],
    [WORK, 'cat-work'],
    [READING, null],
  ]);

  it('groups labels into their categories, largest first', () => {
    expect(totalsByCategory(byLabel, categoryOf)).toEqual([
      { categoryId: 'cat-health', slots: 48, minutes: 1440 },
      { categoryId: 'cat-work', slots: 30, minutes: 900 },
      { categoryId: null, slots: 6, minutes: 180 },
    ]);
  });

  it('keeps uncategorized labels as a real null bucket rather than dropping them', () => {
    const only = totalsByCategory([{ labelId: READING, slots: 6, minutes: 180 }], categoryOf);
    expect(only).toEqual([{ categoryId: null, slots: 6, minutes: 180 }]);
  });

  it('treats a label missing from the map as uncategorized', () => {
    const totals = totalsByCategory([{ labelId: 'unknown', slots: 2, minutes: 60 }], categoryOf);
    expect(totals).toEqual([{ categoryId: null, slots: 2, minutes: 60 }]);
  });

  it('drops the sleep label entirely in the exclude-sleep variant (C-24)', () => {
    // The whole point: the category holding sleep otherwise dwarfs the rest.
    expect(totalsByCategory(byLabel, categoryOf, SLEEP)).toEqual([
      { categoryId: 'cat-work', slots: 30, minutes: 900 },
      { categoryId: null, slots: 6, minutes: 180 },
    ]);
  });

  it('returns nothing for an empty period', () => {
    expect(totalsByCategory([], categoryOf)).toEqual([]);
  });
});
