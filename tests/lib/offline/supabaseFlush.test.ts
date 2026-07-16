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
import type { QueuedWrite } from '../../../src/lib/offline/store';

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
  configureSupabaseFlush();
});

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
