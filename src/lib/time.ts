import { CHUNK_MINUTES, SLOTS_PER_DAY } from './constants';

export function slotIndexToLocalTime(index: number, chunkMinutes = CHUNK_MINUTES): string {
  const total = index * chunkMinutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function localTimeToSlotIndex(time: string, chunkMinutes = CHUNK_MINUTES): number {
  const [h, m] = time.split(':').map(Number);
  return Math.floor((h * 60 + m) / chunkMinutes);
}

export function wakingMinutes(sleepStart: number, sleepEnd: number, chunkMinutes = CHUNK_MINUTES): number {
  const sleepSlots =
    sleepStart > sleepEnd ? SLOTS_PER_DAY - sleepStart + sleepEnd : sleepEnd - sleepStart;
  return (SLOTS_PER_DAY - sleepSlots) * chunkMinutes;
}

// Manual formatting — no locale-data dependence (C-45).
export function localDateString(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// The ONLY sanctioned way to turn a stored date string back into a Date.
// `new Date('2026-07-11')` parses as UTC midnight and shows the wrong day
// west of UTC. Never pass a YYYY-MM-DD string to the Date constructor.
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Day arithmetic on YYYY-MM-DD strings, via the sanctioned parse. Local
// midnight ± n days lands on the intended calendar day even across a DST
// boundary, since setDate works in calendar terms, not milliseconds.
export function addDays(dateStr: string, delta: number): string {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + delta);
  return localDateString(d);
}

// "16h 30m" / "45m" / "0m" — durations for the stats surfaces. Manual, like
// localDateString: no Intl.DurationFormat (uneven browser support, and C-45's
// reason for avoiding locale data applies to anything that must read the same
// on every device).
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
