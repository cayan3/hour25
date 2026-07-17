import { useMemo } from 'react';
import { upsertEntry, deleteEntry } from '../lib/db/entries';
import { recordLabelUse } from '../lib/mru';
import { useDayStore, type SlotSnapshot } from '../store/day';
import type { MergedEntry } from '../lib/merge';

// Every single-slot change the day views can make, in one place: assign,
// clear, and undo. All of them go through the normal write path (upsertEntry/
// deleteEntry → Dexie queue) — the overlay makes them visible instantly, so
// there is nothing to await for UI purposes. Each change records the slot's
// previous state as the single-level undo action (C-30) and assignment pushes
// the label onto the persisted MRU (C-42).
export function useSlotActions(
  userId: string,
  date: string,
  merged: MergedEntry[],
  labelNameById: (labelId: string) => string,
) {
  const recordAction = useDayStore((s) => s.recordAction);
  const setLastAssign = useDayStore((s) => s.setLastAssign);

  return useMemo(() => {
    const snapshotOf = (slotIndex: number): SlotSnapshot | null => {
      const entry = merged.find((e) => e.slotIndex === slotIndex);
      return entry
        ? { labelId: entry.labelId, note: entry.note, chunkMinutes: entry.chunkMinutes }
        : null;
    };

    // note: undefined = keep the slot's existing note (a note rides the entry;
    // re-labeling a slot must not silently drop it).
    const assign = (slotIndex: number, labelId: string, note?: string | null): void => {
      const prev = snapshotOf(slotIndex);
      void upsertEntry(userId, {
        date,
        slotIndex,
        op: 'upsert',
        labelId,
        note: note !== undefined ? note : (prev?.note ?? null),
        chunkMinutes: prev?.chunkMinutes,
      });
      recordLabelUse(userId, labelId);
      setLastAssign(slotIndex, labelId);
      recordAction({ date, slotIndex, prev, description: `Logged ${labelNameById(labelId)}` });
    };

    const clear = (slotIndex: number): void => {
      const prev = snapshotOf(slotIndex);
      if (!prev) return; // clearing an empty slot is a no-op, not an action
      void deleteEntry(userId, date, slotIndex);
      recordAction({ date, slotIndex, prev, description: 'Cleared slot' });
    };

    return { assign, clear };
  }, [userId, date, merged, labelNameById, recordAction, setLastAssign]);
}

// Undo lives outside useSlotActions because it must apply to lastAction's own
// date/slot, which may no longer be the active view.
export function useUndo(userId: string) {
  const lastAction = useDayStore((s) => s.lastAction);
  const clearLastAction = useDayStore((s) => s.clearLastAction);

  return {
    lastAction,
    dismiss: clearLastAction,
    undo: (): void => {
      if (!lastAction) return;
      const { date, slotIndex, prev } = lastAction;
      if (prev) {
        void upsertEntry(userId, {
          date,
          slotIndex,
          op: 'upsert',
          labelId: prev.labelId,
          note: prev.note,
          chunkMinutes: prev.chunkMinutes,
        });
      } else {
        void deleteEntry(userId, date, slotIndex);
      }
      clearLastAction(); // single level: undoing an undo is not a thing
    },
  };
}
