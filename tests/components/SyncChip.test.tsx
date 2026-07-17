import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SyncChip } from '../../src/components/sync/SyncChip';
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
  await offlineDB.writes.clear();
  await offlineDB.dead.clear();
  useQueueStatusStore.setState({ status: 'idle', deadCount: 0 });
});

describe('SyncChip', () => {
  it('is hidden while the queue is empty', async () => {
    render(<SyncChip userId={USER} />);
    // The polite live region is always mounted; the visible chip is not.
    expect(await screen.findByRole('status')).toHaveProperty('textContent', '');
    expect(screen.queryByTitle(/pending sync/)).toBeNull();
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
    await waitFor(() => expect(screen.queryByTitle(/pending sync/)).toBeNull());
  });

  it('hides and announces "All entries synced" when the queue drains', async () => {
    await offlineDB.writes.put(queuedRow(1));
    render(<SyncChip userId={USER} />);
    await screen.findByTitle('1 entry pending sync (waiting to sync)');

    await offlineDB.writes.clear();
    await waitFor(() => expect(screen.queryByTitle(/pending sync/)).toBeNull());
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
});
