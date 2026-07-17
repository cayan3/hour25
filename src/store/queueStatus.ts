import { create } from 'zustand';

// SPEC §6 step 7 / DESIGN §7: flush writes its state plus the dead-letter
// count here; the pending chip and banners read from this store and the live
// pending count (via useLiveQuery) — no component invents its own sync logic.
export type QueueFlushState = 'idle' | 'flushing' | 'offline' | 'auth';

interface QueueStatusState {
  status: QueueFlushState;
  deadCount: number;
  // Set when a flush confirms sends (rows actually reached Postgres); null
  // until then — the chip falls back to the per-user persisted value.
  lastSyncedAt: number | null;
  setStatus: (status: QueueFlushState) => void;
  setDeadCount: (deadCount: number) => void;
  setLastSyncedAt: (lastSyncedAt: number) => void;
}

export const useQueueStatusStore = create<QueueStatusState>((set) => ({
  status: 'idle',
  deadCount: 0,
  lastSyncedAt: null,
  setStatus: (status) => set({ status }),
  setDeadCount: (deadCount) => set({ deadCount }),
  setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
}));
