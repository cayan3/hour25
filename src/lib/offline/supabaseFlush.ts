import { supabase } from '../supabase';
import { queryClient } from '../queryClient';
import { configureFlush, type FlushSession } from './flush';
import type { QueuedWrite } from './store';
import type { ServerEntryRow } from '../merge';

// The real Supabase-backed senders (§6, §12). Kept out of flush.ts itself so
// that file stays free of @supabase/supabase-js and testable with plain
// injected deps — call configureSupabaseFlush() once from app bootstrap.

async function getSession(): Promise<FlushSession | null> {
  const { data } = await supabase.auth.getSession();
  return data.session ? { userId: data.session.user.id } : null;
}

// C-62: once Postgres confirms a batch, fold it into the cached day(s) BEFORE
// flush deletes the queue rows. Without this there's a visible gap — the
// overlay row is gone but the server cache is still pre-flush until the drain
// refetch lands — so every logged slot flickered off/on (and a cleared slot
// flickered back to its old label) on every sync. This is confirmed server
// truth written after a 2xx, not optimistic state: there is nothing to roll
// back. Days with no cached query are skipped — the drain invalidation
// refetches them. The updater form never creates a query that doesn't exist.
function patchEntriesCache(rows: QueuedWrite[]): void {
  const byDate = new Map<string, QueuedWrite[]>();
  for (const r of rows) {
    const list = byDate.get(r.date) ?? [];
    list.push(r);
    byDate.set(r.date, list);
  }
  for (const [date, dateRows] of byDate) {
    queryClient.setQueryData<ServerEntryRow[]>(['entries', date], (old) => {
      if (!old) return old;
      const bySlot = new Map(old.map((e) => [e.slot_index, e]));
      for (const r of dateRows) {
        bySlot.set(r.slotIndex, {
          date: r.date,
          slot_index: r.slotIndex,
          label_id: r.labelId as string,
          note: r.note,
          chunk_minutes: r.chunkMinutes,
        });
      }
      return [...bySlot.values()].sort((a, b) => a.slot_index - b.slot_index);
    });
  }
}

function removeEntriesFromCache(date: string, slotIndices: number[]): void {
  queryClient.setQueryData<ServerEntryRow[]>(['entries', date], (old) =>
    old ? old.filter((e) => !slotIndices.includes(e.slot_index)) : old,
  );
}

async function sendUpsertBatch(userId: string, rows: QueuedWrite[]): Promise<void> {
  const payload = rows.map((r) => ({
    user_id: userId,
    date: r.date,
    slot_index: r.slotIndex,
    label_id: r.labelId as string, // op === 'upsert' rows always carry a labelId
    note: r.note,
    chunk_minutes: r.chunkMinutes,
  }));
  const { error } = await supabase.from('time_entries').upsert(payload, { onConflict: 'user_id,date,slot_index' });
  if (error) throw error;
  patchEntriesCache(rows);
}

async function sendDeleteBatch(userId: string, date: string, slotIndices: number[]): Promise<void> {
  const { error } = await supabase
    .from('time_entries')
    .delete()
    .eq('user_id', userId)
    .eq('date', date)
    .in('slot_index', slotIndices);
  if (error) throw error;
  removeEntriesFromCache(date, slotIndices);
}

// §7.5: invalidate the ['entries'] prefix — never a specific key. Fired once
// per queue-empty transition; the visual result should be a no-op (the overlay
// already showed these writes), it just swaps overlay truth for server truth.
function onQueueDrained(): void {
  queryClient.invalidateQueries({ queryKey: ['entries'] });
}

export function configureSupabaseFlush(): void {
  configureFlush({ getSession, sendUpsertBatch, sendDeleteBatch, onQueueDrained });
}
