import { create } from 'zustand';
import { localDateString } from '../lib/time';

// UI state only (CLAUDE.md): the day being viewed, which slot's picker is
// open, the single-level undo action (C-30), and the transient "same as
// previous" chip target. Entry data itself never lives here — it's rendered
// from the server cache + pending overlay (useDayEntries).

export interface SlotSnapshot {
  labelId: string;
  note: string | null;
  chunkMinutes: number;
}

// Single level, latest action only (C-30). Undo re-applies `prev` through the
// normal write path (upsert when prev exists, delete when it doesn't).
export interface LastAction {
  id: number; // monotonic nonce so the snackbar timer resets per action
  date: string;
  slotIndex: number;
  prev: SlotSnapshot | null;
  description: string; // e.g. 'Logged Deep work', 'Cleared slot'
}

// Where the desktop popover anchors — a plain snapshot of the clicked cell's
// rect (null on mobile; the sheet is viewport-anchored).
export interface PickerAnchor {
  top: number;
  left: number;
  bottom: number;
  width: number;
}

interface OpenPicker {
  slotIndex: number;
  anchor: PickerAnchor | null;
  // `n` on a filled cell opens the picker with focus in the note field
  // (DESIGN §2) — same component, different landing spot.
  focusNote: boolean;
}

interface DayState {
  activeDate: string;
  openPicker: OpenPicker | null;
  lastAction: LastAction | null;
  // SPEC §7.1: the write path's one genuine failure mode is IndexedDB itself
  // refusing the write (quota, private mode, iOS dropping the connection).
  // When that happens the user MUST be told — the write was silently lost.
  writeError: string | null;
  setActiveDate: (date: string) => void;
  showPicker: (slotIndex: number, anchor?: PickerAnchor | null, focusNote?: boolean) => void;
  closePicker: () => void;
  recordAction: (action: Omit<LastAction, 'id'>) => void;
  clearLastAction: () => void;
  setWriteError: (writeError: string | null) => void;
}

let actionNonce = 0;

export const useDayStore = create<DayState>((set) => ({
  activeDate: localDateString(),
  openPicker: null,
  lastAction: null,
  writeError: null,
  setActiveDate: (activeDate) => set({ activeDate, openPicker: null }),
  showPicker: (slotIndex, anchor = null, focusNote = false) =>
    set({ openPicker: { slotIndex, anchor, focusNote } }),
  closePicker: () => set({ openPicker: null }),
  recordAction: (action) => set({ lastAction: { ...action, id: ++actionNonce } }),
  clearLastAction: () => set({ lastAction: null }),
  setWriteError: (writeError) => set({ writeError }),
}));
