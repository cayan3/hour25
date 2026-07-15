import { CHUNK_MINUTES, SLOTS_PER_DAY } from './constants';
import { localDateString } from './time';

function currentSlotIndex(now: Date): number {
  return Math.floor((now.getHours() * 60 + now.getMinutes()) / CHUNK_MINUTES);
}

export function expectedSlots(date: string, now: Date = new Date()): number {
  return date === localDateString(now) ? currentSlotIndex(now) + 1 : SLOTS_PER_DAY;
}

// The only definition of "untracked" anywhere in the app (C-31): an empty
// slot IS untracked time. There is no stored Untracked row.
export function untrackedSlots(date: string, filledCount: number, now: Date = new Date()): number {
  return Math.max(0, expectedSlots(date, now) - filledCount);
}
