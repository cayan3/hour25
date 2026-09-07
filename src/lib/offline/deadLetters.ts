import { offlineDB, type DeadWrite } from './store';
import { enqueueMany } from './queue';
import { useQueueStatusStore } from '../../store/queueStatus';

// Set-aside (dead-letter) management for DESIGN §7's Settings view. Lives in
// src/lib/offline/ with the rest of the queue machinery; the UI reaches it
// through the useSetAside hook, never directly.

async function refreshDeadCount(userId: string): Promise<void> {
  // No userId index on `dead` (schema: '++id, failedAt') — a filter scan is
  // fine, dead-letters are rare by design. Flush republishes this count too;
  // updating it here keeps the toast/chip honest between flushes.
  useQueueStatusStore
    .getState()
    .setDeadCount(await offlineDB.dead.filter((r) => r.userId === userId).count());
}

// Retry-once: re-enqueue through the normal queue (fresh rev, attempts reset —
// the user explicitly asked for another try) and remove the dead row. Enqueue
// first: if the dead-row delete then failed, the worst case is a duplicate
// retry, which the queue's put-based dedup makes harmless — the reverse order
// could lose the write entirely.
//
// A slot can hold BOTH a live pending write and an old dead letter (the flush
// dead-letter path warns about exactly this). The pending row is strictly
// newer user intent, and re-enqueueing would bulkPut the stale dead content
// over it — losing the newer write before it ever reached the server. In that
// case the retry reduces to dropping the dead row and letting the live write
// win.
export async function retryDeadWrite(userId: string, dead: DeadWrite): Promise<void> {
  const pending = await offlineDB.writes.get([userId, dead.date, dead.slotIndex]);
  if (!pending) {
    await enqueueMany(userId, [
      {
        date: dead.date,
        slotIndex: dead.slotIndex,
        op: dead.op,
        labelId: dead.labelId,
        note: dead.note,
        chunkMinutes: dead.chunkMinutes,
      },
    ]);
  }
  if (dead.id !== undefined) await offlineDB.dead.delete(dead.id);
  await refreshDeadCount(userId);
}

export async function discardDeadWrite(userId: string, dead: DeadWrite): Promise<void> {
  if (dead.id !== undefined) await offlineDB.dead.delete(dead.id);
  await refreshDeadCount(userId);
}

// The "Your data" actions' half of the purge (see clearPendingWrites): a
// set-aside row is a write that never landed, so it is this account's data
// too, and after a reset its label no longer exists for a retry to succeed
// against. Scoped to one user, like every other function here.
export async function clearDeadWrites(userId: string): Promise<number> {
  const removed = await offlineDB.dead.filter((r) => r.userId === userId).delete();
  await refreshDeadCount(userId);
  return removed;
}
