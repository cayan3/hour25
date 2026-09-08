import { describe, it, expect, afterAll } from 'vitest';

const originalTZ = process.env.TZ;
process.env.TZ = 'America/Los_Angeles';

import {
  slotIndexToLocalTime,
  localTimeToSlotIndex,
  wakingMinutes,
  localDateString,
  parseLocalDate,
  addDays,
  formatDuration,
} from '../../src/lib/time';

afterAll(() => {
  process.env.TZ = originalTZ;
});

describe('slotIndexToLocalTime / localTimeToSlotIndex', () => {
  it('converts slot 0 to 00:00 and back', () => {
    expect(slotIndexToLocalTime(0)).toBe('00:00');
    expect(localTimeToSlotIndex('00:00')).toBe(0);
  });

  it('converts slot 47 to 23:30 and back', () => {
    expect(slotIndexToLocalTime(47)).toBe('23:30');
    expect(localTimeToSlotIndex('23:30')).toBe(47);
  });
});

describe('wakingMinutes', () => {
  it('handles a non-wraparound sleep window', () => {
    expect(wakingMinutes(10, 20)).toBe((48 - 10) * 30);
  });

  it('handles a wraparound sleep window (default 23:00-07:00)', () => {
    expect(wakingMinutes(46, 14)).toBe(16 * 60);
  });
});

describe('localDateString', () => {
  it('formats with zero-padded month and day', () => {
    expect(localDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('does not roll over at midnight boundaries', () => {
    expect(localDateString(new Date(2026, 6, 15, 23, 59))).toBe('2026-07-15');
    expect(localDateString(new Date(2026, 6, 16, 0, 0))).toBe('2026-07-16');
  });
});

describe('parseLocalDate vs new Date() divergence', () => {
  it('parses a YYYY-MM-DD string as local midnight, not UTC midnight', () => {
    const parsed = parseLocalDate('2026-07-15');
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(6);
    expect(parsed.getDate()).toBe(15);

    // West of UTC, new Date('2026-07-15') parses as UTC midnight, which is
    // the previous calendar day in local time — the exact bug parseLocalDate exists to avoid.
    const naive = new Date('2026-07-15');
    expect(naive.getDate()).not.toBe(parsed.getDate());
  });
});

describe('DST transition dates (C-17): still 48 slots, no special-casing', () => {
  it('round-trips a DST spring-forward date without shifting days', () => {
    // 2026-03-08 is a US DST spring-forward date (2am -> 3am). Local date
    // math must not skip or duplicate this calendar day.
    const dstDate = parseLocalDate('2026-03-08');
    expect(localDateString(dstDate)).toBe('2026-03-08');
  });

  it('round-trips a DST fall-back date without shifting days', () => {
    // 2026-11-01 is a US DST fall-back date (2am -> 1am).
    const dstDate = parseLocalDate('2026-11-01');
    expect(localDateString(dstDate)).toBe('2026-11-01');
  });

  it('slot arithmetic is unaffected by DST — SLOTS_PER_DAY is a fixed constant, never date-derived', () => {
    expect(wakingMinutes(46, 14)).toBe(16 * 60);
    expect(slotIndexToLocalTime(47)).toBe('23:30');
  });
});

describe('addDays', () => {
  it('moves forward and backward across month boundaries', () => {
    expect(addDays('2026-07-31', 1)).toBe('2026-08-01');
    expect(addDays('2026-08-01', -1)).toBe('2026-07-31');
  });

  it('crosses a year boundary', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('lands on the intended calendar day across a DST spring-forward', () => {
    // 2026-03-08 is the US spring-forward: that day is only 23 hours long, so
    // millisecond arithmetic would land back on the 8th.
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
  });

  it('returns the same date for a zero delta', () => {
    expect(addDays('2026-07-15', 0)).toBe('2026-07-15');
  });
});

describe('formatDuration', () => {
  it('renders hours and minutes together', () => {
    expect(formatDuration(16 * 60 + 30)).toBe('16h 30m');
  });

  it('drops the hours below an hour and the minutes on the hour', () => {
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(120)).toBe('2h');
  });

  it('renders zero as 0m rather than an empty string', () => {
    expect(formatDuration(0)).toBe('0m');
  });

  it('floors a negative duration at zero', () => {
    expect(formatDuration(-30)).toBe('0m');
  });
});
