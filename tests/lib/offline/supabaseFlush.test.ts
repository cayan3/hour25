import { describe, it, expect, vi, beforeEach } from 'vitest';

const upsertSpy = vi.fn(async () => ({ error: null }));
const deleteEqSpy = vi.fn();
const getSessionSpy = vi.fn();

// A hand-rolled chainable stand-in for the exact `.from('time_entries')`
// shapes supabaseFlush.ts uses: `.upsert(payload, opts)` and
// `.delete().eq(a).eq(b).in(c)`. fakeSupabase.ts's FakeTable doesn't model
// upsert or chained delete filters, so this stays local to this test.
function makeDeleteChain() {
  const chain = {
    eq: vi.fn(() => chain),
    in: vi.fn((col: string, vals: unknown[]) => {
      deleteEqSpy(col, vals);
      return Promise.resolve({ error: null });
    }),
  };
  return chain;
}

vi.mock('../../../src/lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => getSessionSpy() },
    from: () => ({
      upsert: upsertSpy,
      delete: () => makeDeleteChain(),
    }),
  },
}));

import { configureSupabaseFlush } from '../../../src/lib/offline/supabaseFlush';
import { configureFlush } from '../../../src/lib/offline/flush';
import { queryClient } from '../../../src/lib/queryClient';
import type { QueuedWrite } from '../../../src/lib/offline/store';
import type { ServerEntryRow } from '../../../src/lib/merge';

// configureSupabaseFlush() only calls configureFlush() with real senders; grab
// them back out via a spy on configureFlush so we can call them directly.
vi.mock('../../../src/lib/offline/flush', async () => {
  const actual = await vi.importActual<typeof import('../../../src/lib/offline/flush')>(
    '../../../src/lib/offline/flush',
  );
  return { ...actual, configureFlush: vi.fn(actual.configureFlush) };
});

const USER = 'user-1';

function row(overrides: Partial<QueuedWrite> = {}): QueuedWrite {
  return {
    userId: USER,
    date: '2026-07-15',
    slotIndex: 3,
    op: 'upsert',
    labelId: 'label-1',
    note: null,
    chunkMinutes: 30,
    enqueuedAt: 1,
    rev: 'rev-1',
    attempts: 0,
    ...overrides,
  };
}

beforeEach(() => {
  upsertSpy.mockClear();
  deleteEqSpy.mockClear();
  getSessionSpy.mockReset();
  queryClient.clear();
  configureSupabaseFlush();
});

function serverRow(slotIndex: number, labelId = 'label-x'): ServerEntryRow {
  return { date: '2026-07-15', slot_index: slotIndex, label_id: labelId, note: null, chunk_minutes: 30 };
}

describe('configureSupabaseFlush — getSession', () => {
  it('maps a real session to { userId }', async () => {
    getSessionSpy.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } }, error: null });
    const deps = vi.mocked(configureFlush).mock.calls.at(-1)![0];
    await expect(deps.getSession()).resolves.toEqual({ userId: 'user-1' });
  });

  it('maps no session to null', async () => {
    getSessionSpy.mockResolvedValue({ data: { session: null }, error: null });
    const deps = vi.mocked(configureFlush).mock.calls.at(-1)![0];
    await expect(deps.getSession()).resolves.toBeNull();
  });
});

describe('configureSupabaseFlush — sendUpsertBatch', () => {
  it('upserts rows against time_entries with the (user,date,slot) conflict target', async () => {
    const deps = vi.mocked(configureFlush).mock.calls.at(-1)![0];
    await deps.sendUpsertBatch(USER, [row({ slotIndex: 3, labelId: 'label-1', note: 'hi' })]);

    expect(upsertSpy).toHaveBeenCalledWith(
      [
        {
          user_id: USER,
          date: '2026-07-15',
          slot_index: 3,
          label_id: 'label-1',
          note: 'hi',
          chunk_minutes: 30,
        },
      ],
      { onConflict: 'user_id,date,slot_index' },
    );
  });
});

describe('configureSupabaseFlush — sendDeleteBatch', () => {
  it('deletes by user/date/slot_index list', async () => {
    const deps = vi.mocked(configureFlush).mock.calls.at(-1)![0];
    await deps.sendDeleteBatch(USER, '2026-07-15', [1, 2]);

    expect(deleteEqSpy).toHaveBeenCalledWith('slot_index', [1, 2]);
  });
});

describe('configureSupabaseFlush — C-62 confirmed-row cache patching', () => {
  it('folds a confirmed upsert into the cached day so the drain never flickers', async () => {
    queryClient.setQueryData<ServerEntryRow[]>(['entries', '2026-07-15'], [serverRow(1)]);
    const deps = vi.mocked(configureFlush).mock.calls.at(-1)![0];

    await deps.sendUpsertBatch(USER, [row({ slotIndex: 3, labelId: 'label-new', note: 'hi' })]);

    expect(queryClient.getQueryData(['entries', '2026-07-15'])).toEqual([
      serverRow(1),
      { date: '2026-07-15', slot_index: 3, label_id: 'label-new', note: 'hi', chunk_minutes: 30 },
    ]);
  });

  it('replaces an existing cached slot instead of duplicating it, keeping slot order', async () => {
    queryClient.setQueryData<ServerEntryRow[]>(['entries', '2026-07-15'], [serverRow(1), serverRow(5)]);
    const deps = vi.mocked(configureFlush).mock.calls.at(-1)![0];

    await deps.sendUpsertBatch(USER, [row({ slotIndex: 1, labelId: 'label-replaced' })]);

    expect(queryClient.getQueryData(['entries', '2026-07-15'])).toEqual([
      { date: '2026-07-15', slot_index: 1, label_id: 'label-replaced', note: null, chunk_minutes: 30 },
      serverRow(5),
    ]);
  });

  it('does not create a cache entry for a day that was never fetched', async () => {
    const deps = vi.mocked(configureFlush).mock.calls.at(-1)![0];

    await deps.sendUpsertBatch(USER, [row({ slotIndex: 3, date: '2026-07-14' })]);

    expect(queryClient.getQueryData(['entries', '2026-07-14'])).toBeUndefined();
  });

  it('removes confirmed deletes from the cached day', async () => {
    queryClient.setQueryData<ServerEntryRow[]>(['entries', '2026-07-15'], [serverRow(1), serverRow(2), serverRow(5)]);
    const deps = vi.mocked(configureFlush).mock.calls.at(-1)![0];

    await deps.sendDeleteBatch(USER, '2026-07-15', [1, 2]);

    expect(queryClient.getQueryData(['entries', '2026-07-15'])).toEqual([serverRow(5)]);
  });

  it('does not patch the cache when the send fails', async () => {
    queryClient.setQueryData<ServerEntryRow[]>(['entries', '2026-07-15'], [serverRow(1)]);
    upsertSpy.mockResolvedValueOnce({ error: { code: '23505' } } as never);
    const deps = vi.mocked(configureFlush).mock.calls.at(-1)![0];

    await expect(deps.sendUpsertBatch(USER, [row({ slotIndex: 3 })])).rejects.toBeTruthy();

    expect(queryClient.getQueryData(['entries', '2026-07-15'])).toEqual([serverRow(1)]);
  });
});
