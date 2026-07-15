import { offlineDB, type QueuedWrite } from './store';
import { classifyError } from '../db/errors';
import { MAX_FLUSH_ATTEMPTS, FLUSH_BATCH_SIZE } from '../constants';

export type FlushResult = 'complete' | 'network' | 'auth';

export interface FlushSession {
  userId: string;
}

export interface FlushDeps {
  getSession: () => Promise<FlushSession | null>;
  sendUpsertBatch: (userId: string, rows: QueuedWrite[]) => Promise<void>;
  sendDeleteBatch: (userId: string, date: string, slotIndices: number[]) => Promise<void>;
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

async function isolateBatch(userId: string, batch: QueuedWrite[], d: FlushDeps): Promise<void> {
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
      } else {
        await bumpAttempts(row, `${kind} failure during isolation`);
      }
    }
  }
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
    await isolateBatch(userId, batch, d); // batch classified permanent
    return 'ok';
  }
}

export async function flushOnce(userId: string): Promise<FlushResult> {
  const d = requireDeps();
  const session = await d.getSession();
  if (!session) return 'auth';

  const rows = await getUserRows(userId);
  for (let i = 0; i < rows.length; i += FLUSH_BATCH_SIZE) {
    const batch = rows.slice(i, i + FLUSH_BATCH_SIZE);
    const result = await sendBatch(userId, batch, d);
    if (result === 'network' || result === 'auth') return result;
  }
  return 'complete';
}
