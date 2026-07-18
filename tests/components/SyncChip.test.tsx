import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { SyncChip, usePendingDisplay } from '../../src/components/sync/SyncChip';
import { offlineDB } from '../../src/lib/offline/store';
import { useQueueStatusStore } from '../../src/store/queueStatus';

// Keep the import chain (useSync → queue → sync) off the real client.
vi.mock('../../src/lib/supabase', () => ({ supabase: { auth: {} } }));

const USER = 'user-1';

function queuedRow(slotIndex: number) {
  return {
    userId: USER,
    date: '2026-07-17',
    slotIndex,
    op: 'upsert' as const,
    labelId: 'label-1',
    note: null,
    chunkMinutes: 30,
    enqueuedAt: Date.now(),
    rev: `rev-${slotIndex}`,
    attempts: 0,
  };
}

beforeEach(async () => {
  localStorage.clear();
  await offlineDB.writes.clear();
  await offlineDB.dead.clear();
  useQueueStatusStore.setState({ status: 'idle', deadCount: 0, lastSyncedAt: null });
});

describe('SyncChip', () => {
  it('shows the quiet synced state while the queue is empty', async () => {
    render(<SyncChip userId={USER} />);
    // Always visible (no popping in/out); no last-sync known yet, no count.
    expect(await screen.findByTitle('All entries synced')).toBeTruthy();
    expect(screen.queryByTitle(/pending sync/)).toBeNull();
    expect(screen.getByRole('status')).toHaveProperty('textContent', '');
  });

  it('shows the last-synced time once one is known', async () => {
    useQueueStatusStore.setState({ lastSyncedAt: Date.now() });
    render(<SyncChip userId={USER} />);
    expect(await screen.findByTitle(/All entries synced — last sync /)).toBeTruthy();
  });

  it('shows the pending count and announces entering the pending state', async () => {
    await offlineDB.writes.bulkPut([queuedRow(1), queuedRow(2)]);
    render(<SyncChip userId={USER} />);
    const chip = await screen.findByTitle('2 entries pending sync (waiting to sync)');
    expect(chip.textContent).toContain('2');
    expect(screen.getByRole('status').textContent).toBe('2 entries pending sync');
  });

  it('ignores other users’ queued rows', async () => {
    await offlineDB.writes.put({ ...queuedRow(1), userId: 'someone-else' });
    render(<SyncChip userId={USER} />);
    await screen.findByTitle('All entries synced');
    expect(screen.queryByTitle(/pending sync/)).toBeNull();
  });

  it('returns to the synced state and announces it when the queue drains', async () => {
    await offlineDB.writes.put(queuedRow(1));
    render(<SyncChip userId={USER} />);
    await screen.findByTitle('1 entry pending sync (waiting to sync)');

    await offlineDB.writes.clear();
    await waitFor(() => expect(screen.queryByTitle(/pending sync/)).toBeNull());
    expect(screen.getByTitle(/All entries synced/)).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('All entries synced');
  });

  it('reflects the flushing and auth states from queueStatus', async () => {
    await offlineDB.writes.put(queuedRow(1));
    useQueueStatusStore.setState({ status: 'flushing' });
    render(<SyncChip userId={USER} />);
    await screen.findByTitle('1 entry pending sync (syncing)');

    useQueueStatusStore.setState({ status: 'auth' });
    await screen.findByTitle('1 entry pending sync (sign-in needed)');
  });

  it('prefers the newer of the in-memory and persisted last-sync times (another tab may have flushed since)', async () => {
    const older = new Date('2026-07-17T08:05:00').getTime();
    const newer = new Date('2026-07-17T11:30:00').getTime();
    useQueueStatusStore.setState({ lastSyncedAt: older });
    localStorage.setItem(`last-sync:${USER}`, String(newer));

    render(<SyncChip userId={USER} />);

    const expected = new Date(newer).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    const chip = await screen.findByTitle(/All entries synced — last sync /);
    expect(chip.textContent).toContain(expected);
  });

  it('does not announce "All entries synced" when the queue drained by dead-lettering', async () => {
    await offlineDB.writes.put(queuedRow(1));
    render(<SyncChip userId={USER} />);
    await screen.findByTitle('1 entry pending sync (waiting to sync)');

    // The row leaves the queue because it was set aside, not synced.
    useQueueStatusStore.setState({ deadCount: 1 });
    await offlineDB.writes.clear();

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        'Sync finished — some entries could not sync and were set aside',
      ),
    );
  });
});

describe('usePendingDisplay — debounce timing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a count change while hidden does not restart the show delay — continuous pending is what counts', () => {
    const { result, rerender } = renderHook(({ pending }) => usePendingDisplay(pending), {
      initialProps: { pending: 1 },
    });
    act(() => vi.advanceTimersByTime(200));
    rerender({ pending: 2 }); // rapid offline tap mid-delay
    act(() => vi.advanceTimersByTime(250)); // 450ms continuously non-empty
    expect(result.current).toBe(true);
  });

  it('a pending blip shorter than the show delay never shows the chip', () => {
    const { result, rerender } = renderHook(({ pending }) => usePendingDisplay(pending), {
      initialProps: { pending: 1 },
    });
    act(() => vi.advanceTimersByTime(200));
    rerender({ pending: 0 }); // fast online sync drained it
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(false);
  });

  it('once shown, the chip holds for the minimum visible window after the queue drains', () => {
    const { result, rerender } = renderHook(({ pending }) => usePendingDisplay(pending), {
      initialProps: { pending: 1 },
    });
    act(() => vi.advanceTimersByTime(400));
    expect(result.current).toBe(true);

    rerender({ pending: 0 });
    act(() => vi.advanceTimersByTime(400)); // inside the 600ms hold
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(250)); // past it
    expect(result.current).toBe(false);
  });
});
