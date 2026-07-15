import Dexie, { type Table } from 'dexie';

export type WriteOp = 'upsert' | 'delete'; // tombstones: slots can be cleared (C-30)

export interface QueuedWrite {
  userId: string;
  date: string; // 'YYYY-MM-DD'
  slotIndex: number;
  op: WriteOp;
  labelId: string | null; // null only when op === 'delete'
  note: string | null;
  chunkMinutes: number;
  enqueuedAt: number; // flush ordering
  rev: string; // random UUID, regenerated on every put (C-27)
  attempts: number; // bumped ONLY in the poison-isolation path (C-29)
}

export interface DeadWrite extends QueuedWrite {
  id?: number;
  failedAt: number;
  reason: string;
}

class OfflineDB extends Dexie {
  writes!: Table<QueuedWrite, [string, string, number]>;
  dead!: Table<DeadWrite, number>;

  constructor() {
    super('time-tracker-offline');
    // Compound PRIMARY key = natural dedup: put() upserts; last edit to a slot
    // simply replaces the pending row (with a fresh rev).
    this.version(1).stores({
      writes: '[userId+date+slotIndex], enqueuedAt',
      dead: '++id, failedAt',
    });
  }
}

export const offlineDB = new OfflineDB();
