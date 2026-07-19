import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FakeTable, fakeSupabaseClient } from '../../helpers/fakeSupabase';

let entriesTable: FakeTable;

vi.mock('../../../src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => fakeSupabaseClient({ time_entries: entriesTable }).from(table),
  },
}));

import { getEntriesForRange } from '../../../src/lib/db/entries';

const USER = 'user-1';

function seedDays(days: number, slotsPerDay: number): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (let d = 0; d < days; d++) {
    // 28-day "months" keep the generated YYYY-MM-DD strings valid and ordered.
    const month = Math.floor(d / 28) + 3;
    const date = `2026-${String(month).padStart(2, '0')}-${String((d % 28) + 1).padStart(2, '0')}`;
    for (let s = 0; s < slotsPerDay; s++) {
      rows.push({
        user_id: USER,
        date,
        slot_index: s,
        label_id: 'label-1',
        note: null,
        chunk_minutes: 30,
      });
    }
  }
  return rows;
}

describe('getEntriesForRange — pagination past the PostgREST max-rows cap', () => {
  beforeEach(() => {
    // 60 days × 40 slots = 2,400 rows: far past the 1,000-row response cap
    // the fake mirrors from Supabase's default PostgREST configuration.
    entriesTable = new FakeTable(seedDays(60, 40));
  });

  it('returns every row of a whole-account range, not just the first response page', async () => {
    const rows = await getEntriesForRange(USER, '2026-03-01', '2026-05-28');
    expect(rows).toHaveLength(2400);
  });

  it('keeps (date, slot_index) ordering across page boundaries', async () => {
    const rows = await getEntriesForRange(USER, '2026-03-01', '2026-05-28');
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      const cur = rows[i];
      const ordered =
        prev.date < cur.date || (prev.date === cur.date && prev.slot_index < cur.slot_index);
      expect(ordered).toBe(true);
    }
  });

  it('still honours the date bounds while paginating', async () => {
    const rows = await getEntriesForRange(USER, '2026-03-02', '2026-03-03');
    expect(rows).toHaveLength(80);
    expect(rows.every((r) => r.date === '2026-03-02' || r.date === '2026-03-03')).toBe(true);
  });
});
