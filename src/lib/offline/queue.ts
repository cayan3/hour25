import { offlineDB } from './store';
import { requestFlush } from './sync';
import { CHUNK_MINUTES } from '../constants';
import { randomUUID } from '../uuid';

export interface EntryWrite {
  date: string;
  slotIndex: number;
  op: 'upsert' | 'delete';
  labelId: string | null; // required for upsert; null for delete
  note?: string | null;
  chunkMinutes?: number;
}

export async function enqueueMany(userId: string, ws: EntryWrite[]): Promise<void> {
  const now = Date.now();
  await offlineDB.writes.bulkPut(
    ws.map((w) => ({
      userId,
      date: w.date,
      slotIndex: w.slotIndex,
      op: w.op,
      labelId: w.labelId,
      note: w.note ?? null,
      chunkMinutes: w.chunkMinutes ?? CHUNK_MINUTES,
      enqueuedAt: now,
      rev: randomUUID(), // not crypto.randomUUID — absent on insecure origins (LAN phone testing)
      attempts: 0,
    })),
  );
  requestFlush(userId); // fire-and-forget; requestFlush never rejects
}
