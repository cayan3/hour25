import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuthBanner } from '../../src/components/sync/AuthBanner';
import { offlineDB } from '../../src/lib/offline/store';
import { useQueueStatusStore } from '../../src/store/queueStatus';
import { signInWithGoogle } from '../../src/lib/db/auth';

vi.mock('../../src/lib/supabase', () => ({ supabase: { auth: {} } }));
vi.mock('../../src/lib/db/auth', () => ({ signInWithGoogle: vi.fn().mockResolvedValue(undefined) }));

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
  vi.mocked(signInWithGoogle).mockClear();
  await offlineDB.writes.clear();
  useQueueStatusStore.setState({ status: 'idle', deadCount: 0 });
});

describe('AuthBanner', () => {
  it('stays hidden while flushing works, even with queued writes', async () => {
    await offlineDB.writes.put(queuedRow(1));
    render(<AuthBanner userId={USER} />);
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('appears on auth status with queued writes, counting them', async () => {
    await offlineDB.writes.bulkPut([queuedRow(1), queuedRow(2), queuedRow(3)]);
    useQueueStatusStore.setState({ status: 'auth' });
    render(<AuthBanner userId={USER} />);
    const banner = await screen.findByRole('alert');
    expect(banner.textContent).toContain('Sign in again to sync 3 saved entries.');
  });

  it('stays hidden on auth status when nothing is queued', async () => {
    useQueueStatusStore.setState({ status: 'auth' });
    render(<AuthBanner userId={USER} />);
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('triggers the sign-in flow from its action', async () => {
    await offlineDB.writes.put(queuedRow(1));
    useQueueStatusStore.setState({ status: 'auth' });
    render(<AuthBanner userId={USER} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(signInWithGoogle).toHaveBeenCalledOnce();
  });

  it('can be dismissed, and returns on the next auth episode', async () => {
    await offlineDB.writes.put(queuedRow(1));
    useQueueStatusStore.setState({ status: 'auth' });
    render(<AuthBanner userId={USER} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).toBeNull();

    // A fresh auth failure after a working stretch is a new episode — the
    // two transitions arrive in separate ticks, so flush each separately.
    act(() => useQueueStatusStore.setState({ status: 'idle' }));
    act(() => useQueueStatusStore.setState({ status: 'auth' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('stays dismissed across the retry loop’s flushing blips within one episode', async () => {
    await offlineDB.writes.put(queuedRow(1));
    useQueueStatusStore.setState({ status: 'auth' });
    render(<AuthBanner userId={USER} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).toBeNull();

    // The revoked-token case: every ~30s retry sets 'flushing' then lands back
    // on 'auth'. That is the SAME episode — the banner must not re-arm.
    act(() => useQueueStatusStore.setState({ status: 'flushing' }));
    act(() => useQueueStatusStore.setState({ status: 'auth' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});
