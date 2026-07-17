import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SetAsidePanel } from '../../src/components/sync/SetAsidePanel';
import { offlineDB } from '../../src/lib/offline/store';
import { useQueueStatusStore } from '../../src/store/queueStatus';

vi.mock('../../src/lib/supabase', () => ({ supabase: { auth: {} } }));
vi.mock('../../src/hooks/useLabels', () => ({
  useAllLabels: () => ({
    data: [
      {
        id: 'label-1',
        user_id: 'user-1',
        category_id: null,
        name: 'Deep work',
        color: '#334455',
        deleted_at: null,
        created_at: '',
      },
      {
        id: 'label-2',
        user_id: 'user-1',
        category_id: null,
        name: 'Old habit',
        color: '#556677',
        deleted_at: '2026-07-01T00:00:00Z',
        created_at: '',
      },
    ],
  }),
}));

const USER = 'user-1';

function deadRow(overrides: Partial<Parameters<typeof offlineDB.dead.add>[0]> = {}) {
  return {
    userId: USER,
    date: '2026-07-16',
    slotIndex: 18,
    op: 'upsert' as const,
    labelId: 'label-1',
    note: null,
    chunkMinutes: 30,
    enqueuedAt: Date.now(),
    rev: 'rev-dead',
    attempts: 8,
    failedAt: Date.now(),
    reason: 'permanent write failure',
    ...overrides,
  };
}

beforeEach(async () => {
  await offlineDB.writes.clear();
  await offlineDB.dead.clear();
  useQueueStatusStore.setState({ status: 'idle', deadCount: 0 });
});

describe('SetAsidePanel', () => {
  it('shows the empty state when nothing is set aside', async () => {
    render(<SetAsidePanel userId={USER} />);
    expect(await screen.findByText(/Nothing here/)).toBeTruthy();
  });

  it('lists a set-aside entry with date, time, label, and reason', async () => {
    await offlineDB.dead.add(deadRow());
    render(<SetAsidePanel userId={USER} />);
    expect(await screen.findByText('2026-07-16, 9:00 to 9:30 — Deep work')).toBeTruthy();
    expect(screen.getByText('permanent write failure')).toBeTruthy();
  });

  it('names soft-deleted labels and clear-slot writes', async () => {
    await offlineDB.dead.bulkAdd([
      deadRow({ labelId: 'label-2', slotIndex: 2 }),
      deadRow({ op: 'delete', labelId: null, slotIndex: 4 }),
    ]);
    render(<SetAsidePanel userId={USER} />);
    expect(await screen.findByText(/Old habit \(deleted\)/)).toBeTruthy();
    expect(screen.getByText(/Clear slot/)).toBeTruthy();
  });

  it('never shows another user’s dead letters', async () => {
    await offlineDB.dead.add(deadRow({ userId: 'someone-else' }));
    render(<SetAsidePanel userId={USER} />);
    expect(await screen.findByText(/Nothing here/)).toBeTruthy();
  });

  it('retry re-enqueues through the normal queue and removes the dead row', async () => {
    await offlineDB.dead.add(deadRow());
    render(<SetAsidePanel userId={USER} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));

    await waitFor(async () => {
      const queued = await offlineDB.writes.get([USER, '2026-07-16', 18]);
      expect(queued).toMatchObject({ op: 'upsert', labelId: 'label-1', attempts: 0 });
      expect(await offlineDB.dead.count()).toBe(0);
    });
    expect(await screen.findByText(/Nothing here/)).toBeTruthy();
  });

  it('discard drops the dead row without queueing anything', async () => {
    await offlineDB.dead.add(deadRow());
    render(<SetAsidePanel userId={USER} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));

    await waitFor(async () => {
      expect(await offlineDB.dead.count()).toBe(0);
    });
    expect(await offlineDB.writes.count()).toBe(0);
    expect(await screen.findByText(/Nothing here/)).toBeTruthy();
  });
});
