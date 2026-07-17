import { offlineDB, type QueuedWrite } from './store';
import { classifyError } from '../db/errors';
import { MAX_FLUSH_ATTEMPTS, FLUSH_BATCH_SIZE } from '../constants';
import { useQueueStatusStore } from '../../store/queueStatus';

export type FlushResult = 'complete' | 'network' | 'auth';

export interface FlushSession {
  userId: string;
}

export interface FlushDeps {
  getSession: () => Promise<FlushSession | null>;
  sendUpsertBatch: (userId: string, rows: QueuedWrite[]) => Promise<void>;
  sendDeleteBatch: (userId: string, date: string, slotIndices: number[]) => Promise<void>;
  // SPEC §6 step 7: called once on the queue-empty transition after a flush
  // actually sent rows, so the app can invalidate the ['entries'] prefix and
  // swap the UI from overlay truth to confirmed server truth. Injected (like
  // the senders) to keep this file free of react-query.
  onQueueDrained?: () => void;
}

let deps: FlushDeps | null = null;

// Wires the real Supabase-backed senders in later sessions; kept injectable
// here so this file never imports @supabase/supabase-js.
export function configureFlush(d: FlushDeps): void {
  deps = d;
}

function requireDeps(): FlushDeps {
  if (!deps) throw new Error('flush: configureFlush() must be called before flushing');
  return deps;
}

async function getUserRows(userId: string): Promise<QueuedWrite[]> {
  const all = await offlineDB.writes.orderBy('enqueuedAt').toArray();
  return all.filter((r) => r.userId === userId);
}

// C-27: only delete a queue row if its rev is unchanged since the snapshot
// we sent — an edit made mid-flight keeps its fresh row and flushes next round.
async function conditionalDelete(rows: QueuedWrite[]): Promise<void> {
  await offlineDB.transaction('rw', offlineDB.writes, async () => {
    for (const row of rows) {
      const current = await offlineDB.writes.get([row.userId, row.date, row.slotIndex]);
      if (current && current.rev === row.rev) {
        await offlineDB.writes.delete([row.userId, row.date, row.slotIndex]);
      }
    }
  });
}

async function deadLetter(row: QueuedWrite, reason: string): Promise<void> {
  await offlineDB.transaction('rw', offlineDB.writes, offlineDB.dead, async () => {
    const current = await offlineDB.writes.get([row.userId, row.date, row.slotIndex]);
    // If the row was re-edited (rev changed) since this send was attempted, the
    // fresh row survives in `writes` untouched — but this stale snapshot is
    // still dead-lettered below. A future dead-letter UI should be aware a slot
    // can show both a live pending write and an unrelated dead-letter entry.
    if (current && current.rev === row.rev) {
      await offlineDB.writes.delete([row.userId, row.date, row.slotIndex]);
    }
    await offlineDB.dead.add({ ...row, failedAt: Date.now(), reason });
  });
}

// C-29: the only place `attempts` moves. Only reached from the row-by-row
// isolation path below, never from a global batch-level failure.
async function bumpAttempts(row: QueuedWrite, reason: string): Promise<void> {
  await offlineDB.transaction('rw', offlineDB.writes, offlineDB.dead, async () => {
    const current = await offlineDB.writes.get([row.userId, row.date, row.slotIndex]);
    if (!current || current.rev !== row.rev) return;
    const attempts = current.attempts + 1;
    if (attempts >= MAX_FLUSH_ATTEMPTS) {
      await offlineDB.writes.delete([row.userId, row.date, row.slotIndex]);
      await offlineDB.dead.add({ ...current, attempts, failedAt: Date.now(), reason });
    } else {
      await offlineDB.writes.put({ ...current, attempts });
    }
  });
}

function groupByDate(rows: QueuedWrite[]): Map<string, QueuedWrite[]> {
  const m = new Map<string, QueuedWrite[]>();
  for (const r of rows) {
    const list = m.get(r.date) ?? [];
    list.push(r);
    m.set(r.date, list);
  }
  return m;
}

// Returns 'ok' when the whole batch was isolated, or the classification that
// stopped it. A single-row network/auth failure bumps that row's attempts —
// the only guard against a row that fails retriably forever — and then stops
// the isolation pass and the whole flush, same as a batch-level failure
// (SPEC §6 step 6). Later rows keep their queue positions untouched, so a
// connectivity drop mid-isolation never burns attempts across the batch.
async function isolateBatch(
  userId: string,
  batch: QueuedWrite[],
  d: FlushDeps,
): Promise<'ok' | 'network' | 'auth'> {
  for (const row of batch) {
    try {
      if (row.op === 'upsert') {
        await d.sendUpsertBatch(userId, [row]);
      } else {
        await d.sendDeleteBatch(userId, row.date, [row.slotIndex]);
      }
      await conditionalDelete([row]);
    } catch (e) {
      const kind = classifyError(e);
      if (kind === 'permanent') {
        await deadLetter(row, 'permanent write failure');
        continue;
      }
      await bumpAttempts(row, `${kind} failure during isolation`);
      return kind;
    }
  }
  return 'ok';
}

async function sendBatch(userId: string, batch: QueuedWrite[], d: FlushDeps): Promise<'ok' | 'network' | 'auth'> {
  const upserts = batch.filter((r) => r.op === 'upsert');
  const deletes = batch.filter((r) => r.op === 'delete');
  try {
    if (upserts.length) await d.sendUpsertBatch(userId, upserts);
    if (deletes.length) {
      for (const [date, rows] of groupByDate(deletes)) {
        await d.sendDeleteBatch(userId, date, rows.map((r) => r.slotIndex));
      }
    }
    await conditionalDelete(batch);
    return 'ok';
  } catch (e) {
    const kind = classifyError(e);
    if (kind === 'network' || kind === 'auth') return kind; // stop the loop, bump nothing (C-29)
    return isolateBatch(userId, batch, d); // batch classified permanent
  }
}

// SPEC §6 step 7: publish flush state plus the dead-letter count to the
// queueStatus store for the pending chip and banners (DESIGN §7).
async function publishStatus(userId: string, result: FlushResult): Promise<void> {
  const store = useQueueStatusStore.getState();
  store.setStatus(result === 'complete' ? 'idle' : result === 'network' ? 'offline' : 'auth');
  // userId isn't indexed on `dead` (schema: '++id, failedAt'); a filter scan
  // is fine — dead-letters are rare by design.
  store.setDeadCount(await offlineDB.dead.filter((r) => r.userId === userId).count());
}

export async function flushOnce(userId: string): Promise<FlushResult> {
  const d = requireDeps();
  const session = await d.getSession();
  if (!session) {
    // Nothing touched, no attempts burned — but the banner still needs to know.
    useQueueStatusStore.getState().setStatus('auth');
    return 'auth';
  }

  useQueueStatusStore.getState().setStatus('flushing');
  const rows = await getUserRows(userId);
  let result: FlushResult = 'complete';
  for (let i = 0; i < rows.length; i += FLUSH_BATCH_SIZE) {
    const batch = rows.slice(i, i + FLUSH_BATCH_SIZE);
    const batchResult = await sendBatch(userId, batch, d);
    if (batchResult === 'network' || batchResult === 'auth') {
      result = batchResult;
      break;
    }
  }
  await publishStatus(userId, result);

  // Queue-empty transition: only after a flush that had rows to send and left
  // none behind (a row re-enqueued mid-flight survives conditional delete and
  // keeps the queue non-empty — it flushes next round, and drains then).
  if (result === 'complete' && rows.length > 0 && (await getUserRows(userId)).length === 0) {
    d.onQueueDrained?.();
  }
  return result;
}
