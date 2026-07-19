import type { QueuedWrite } from './offline/store';

export interface ServerEntryRow {
  date: string;
  slot_index: number;
  label_id: string;
  note: string | null;
  chunk_minutes: number;
}

export interface MergedEntry {
  slotIndex: number;
  labelId: string;
  note: string | null;
  chunkMinutes: number;
}

// Pure function: index server rows by slotIndex, then let pending rows
// override ('upsert') or remove ('delete') the merged view. Unit-tested
// exhaustively per SPEC.md §13 — this is the only place the overlay merges.
export function mergePending(serverRows: ServerEntryRow[], pendingRows: QueuedWrite[]): MergedEntry[] {
  const bySlot = new Map<number, MergedEntry>();

  for (const row of serverRows) {
    bySlot.set(row.slot_index, {
      slotIndex: row.slot_index,
      labelId: row.label_id,
      note: row.note,
      chunkMinutes: row.chunk_minutes,
    });
  }

  for (const row of pendingRows) {
    if (row.op === 'delete') {
      bySlot.delete(row.slotIndex);
    } else {
      bySlot.set(row.slotIndex, {
        slotIndex: row.slotIndex,
        labelId: row.labelId as string,
        note: row.note,
        chunkMinutes: row.chunkMinutes,
      });
    }
  }

  return [...bySlot.values()].sort((a, b) => a.slotIndex - b.slotIndex);
}

export interface DatedEntry extends MergedEntry {
  date: string;
}

// The same overlay across many days at once, for whole-account reads (export
// and backup). Grouping by date and delegating keeps mergePending the single
// definition of what an overlay means; a pending write for a date the server
// has never seen still contributes its day.
export function mergePendingAllDates(
  serverRows: ServerEntryRow[],
  pendingRows: QueuedWrite[],
): DatedEntry[] {
  const dates = new Set<string>();
  const serverByDate = new Map<string, ServerEntryRow[]>();
  const pendingByDate = new Map<string, QueuedWrite[]>();

  for (const row of serverRows) {
    dates.add(row.date);
    (serverByDate.get(row.date) ?? serverByDate.set(row.date, []).get(row.date)!).push(row);
  }
  for (const row of pendingRows) {
    dates.add(row.date);
    (pendingByDate.get(row.date) ?? pendingByDate.set(row.date, []).get(row.date)!).push(row);
  }

  return [...dates]
    .sort()
    .flatMap((date) =>
      mergePending(serverByDate.get(date) ?? [], pendingByDate.get(date) ?? []).map((e) => ({
        ...e,
        date,
      })),
    );
}
