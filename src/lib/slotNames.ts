import { CHUNK_MINUTES } from './constants';

// "9:00" — hour without a leading zero, for accessible names and mobile row
// time labels (DESIGN §10's examples use this form). Slot 48's boundary is
// rendered "24:00": unambiguous end-of-day, no locale APIs (C-45 spirit).
export function slotTimeShort(index: number, chunkMinutes = CHUNK_MINUTES): string {
  const total = index * chunkMinutes;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// "9:00 to 9:30"
export function slotRangeLabel(index: number, chunkMinutes = CHUNK_MINUTES): string {
  return `${slotTimeShort(index, chunkMinutes)} to ${slotTimeShort(index + 1, chunkMinutes)}`;
}

export interface SlotLabelInfo {
  name: string;
  deleted: boolean;
}

// DESIGN §10: cell accessible name = "9:00 to 9:30, Deep work, has note"
// (deleted labels append ", deleted label"; empty cells = "9:00 to 9:30,
// untracked"). The one place this string is assembled — desktop cells and
// mobile rows both call it.
export function slotAccessibleName(
  index: number,
  label: SlotLabelInfo | null,
  hasNote: boolean,
): string {
  const range = slotRangeLabel(index);
  if (!label) return `${range}, untracked`;
  let name = `${range}, ${label.name}`;
  if (label.deleted) name += ', deleted label';
  if (hasNote) name += ', has note';
  return name;
}
