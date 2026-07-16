import { supabase } from '../supabase';
import { configureFlush, type FlushSession } from './flush';
import type { QueuedWrite } from './store';

// The real Supabase-backed senders (§6, §12). Kept out of flush.ts itself so
// that file stays free of @supabase/supabase-js and testable with plain
// injected deps — call configureSupabaseFlush() once from app bootstrap.

async function getSession(): Promise<FlushSession | null> {
  const { data } = await supabase.auth.getSession();
  return data.session ? { userId: data.session.user.id } : null;
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
}

async function sendDeleteBatch(userId: string, date: string, slotIndices: number[]): Promise<void> {
  const { error } = await supabase
    .from('time_entries')
    .delete()
    .eq('user_id', userId)
    .eq('date', date)
    .in('slot_index', slotIndices);
  if (error) throw error;
}

export function configureSupabaseFlush(): void {
  configureFlush({ getSession, sendUpsertBatch, sendDeleteBatch });
}
