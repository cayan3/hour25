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
