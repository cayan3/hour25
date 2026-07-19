import { supabase } from '../supabase';
import { classifyError } from './errors';
import { enqueueMany, type EntryWrite } from '../offline/queue';
import type { ServerEntryRow } from '../merge';
import { CHUNK_MINUTES, IMPORT_BATCH_SIZE } from '../constants';

export type { EntryWrite };

// Postgres rejects one INSERT..ON CONFLICT touching the same key twice — always
// dedupe, last wins. (Also collapses redundant taps.)
function dedupe(ws: EntryWrite[]): EntryWrite[] {
  const m = new Map<string, EntryWrite>();
  for (const w of ws) m.set(`${w.date}:${w.slotIndex}`, w);
  return [...m.values()];
}

// The entire write path. No network. No branches. Durable before it returns.
export async function upsertEntries(userId: string, raw: EntryWrite[]): Promise<void> {
  const ws = dedupe(raw).map((w) => ({
    ...w,
    note: w.note ?? null,
    chunkMinutes: w.chunkMinutes ?? CHUNK_MINUTES,
  }));
  if (ws.length) await enqueueMany(userId, ws);
}

export const upsertEntry = (userId: string, w: EntryWrite): Promise<void> => upsertEntries(userId, [w]);

export const deleteEntry = (userId: string, date: string, slotIndex: number): Promise<void> =>
  upsertEntries(userId, [{ date, slotIndex, op: 'delete', labelId: null }]);

// PostgREST caps every response at the project's max-rows setting (Supabase
// default: 1000), silently — no error, just a short result. A single day is
// never near the cap, but whole-account ranges (export/backup, import
// preview) blow straight past it, so every read pages. Must not exceed the
// server-side cap, or a "full" page would be indistinguishable from a capped
// one and the loop would stop early.
const ENTRY_PAGE_SIZE = 1000;

// Bare entries — no label embed (C-34). Labels resolve client-side from ['labels-all'].
export async function getEntriesForRange(
  userId: string,
  start: string,
  end: string,
): Promise<ServerEntryRow[]> {
  const rows: ServerEntryRow[] = [];
  for (let offset = 0; ; offset += ENTRY_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('time_entries')
      .select('date, slot_index, label_id, note, chunk_minutes')
      .eq('user_id', userId)
      .gte('date', start)
      .lte('date', end)
      .order('date')
      .order('slot_index')
      .range(offset, offset + ENTRY_PAGE_SIZE - 1);
    if (error) throw Object.assign(error, { kind: classifyError(error) });
    rows.push(...data);
    if (data.length < ENTRY_PAGE_SIZE) return rows;
  }
}

export async function getEarliestEntryDate(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('time_entries')
    .select('date')
    .eq('user_id', userId)
    .order('date', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw Object.assign(error, { kind: classifyError(error) });
  return data?.date ?? null;
}

// Pairs with getEarliestEntryDate to bound a whole-account read (export /
// backup) without assuming today is the last day — future slots are loggable.
export async function getLatestEntryDate(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('time_entries')
    .select('date')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw Object.assign(error, { kind: classifyError(error) });
  return data?.date ?? null;
}

export interface DirectEntryRow {
  date: string;
  slotIndex: number;
  labelId: string;
  note?: string | null;
  chunkMinutes?: number;
}

// The single sanctioned exception to the write-ahead invariant (C-36): online-only
// direct writes for CSV/JSON import, batched at IMPORT_BATCH_SIZE. Never called
// from the logging UI — enqueueMany/upsertEntries is the only path there.
export async function bulkUpsertDirect(userId: string, rows: DirectEntryRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += IMPORT_BATCH_SIZE) {
    const batch = rows.slice(i, i + IMPORT_BATCH_SIZE).map((r) => ({
      user_id: userId,
      date: r.date,
      slot_index: r.slotIndex,
      label_id: r.labelId,
      note: r.note ?? null,
      chunk_minutes: r.chunkMinutes ?? CHUNK_MINUTES,
    }));
    const { error } = await supabase
      .from('time_entries')
      .upsert(batch, { onConflict: 'user_id,date,slot_index' });
    if (error) throw Object.assign(error, { kind: classifyError(error) });
  }
}
