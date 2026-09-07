import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { YourDataPanel } from '../../src/components/settings/YourDataPanel';
import { offlineDB } from '../../src/lib/offline/store';
import { useDayStore } from '../../src/store/day';

vi.mock('../../src/lib/supabase', () => ({ supabase: { auth: {} } }));

// The queue's flush trigger, not the queue itself: the panel's purge runs for
// real against fake-indexeddb so the "does a reset leave writes behind?"
// question is answered by the actual Dexie tables.
vi.mock('../../src/lib/offline/sync', () => ({ requestFlush: vi.fn() }));

const resetMyData = vi.fn();
const deleteMyAccount = vi.fn();
vi.mock('../../src/lib/db/account', () => ({
  resetMyData: (...args: unknown[]) => resetMyData(...args),
  deleteMyAccount: (...args: unknown[]) => deleteMyAccount(...args),
}));

const signOut = vi.fn();
vi.mock('../../src/lib/db/auth', () => ({
  signOut: (...args: unknown[]) => signOut(...args),
}));

const USER = 'user-1';

function setOnline(online: boolean) {
  return vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(online);
}

let onLineSpy: ReturnType<typeof setOnline> | null = null;

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <YourDataPanel userId={USER} />
    </QueryClientProvider>,
  );
  return { ...utils, invalidate };
}

function invalidatedKeys(invalidate: { mock: { calls: unknown[][] } }): unknown[] {
  return invalidate.mock.calls.map((call) => (call[0] as { queryKey?: unknown } | undefined)?.queryKey);
}

async function queueWrite(userId: string, slotIndex: number) {
  await offlineDB.writes.put({
    userId,
    date: '2026-09-07',
    slotIndex,
    op: 'upsert',
    labelId: 'label-1',
    note: null,
    chunkMinutes: 30,
    enqueuedAt: Date.now(),
    rev: `rev-${userId}-${slotIndex}`,
    attempts: 0,
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  resetMyData.mockResolvedValue(undefined);
  deleteMyAccount.mockResolvedValue(undefined);
  signOut.mockResolvedValue(undefined);
  await offlineDB.writes.clear();
  await offlineDB.dead.clear();
  onLineSpy = setOnline(true);
});

afterEach(() => {
  onLineSpy?.mockRestore();
  onLineSpy = null;
});

describe('YourDataPanel — confirmation gate', () => {
  it('does not run a reset until the confirmation word is typed exactly', () => {
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Reset my data' }));

    const confirm = screen.getByRole('button', { name: 'Reset everything' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    const input = screen.getByLabelText(/type reset to confirm/i);
    fireEvent.change(input, { target: { value: 'reset' } });
    expect(confirm.disabled).toBe(true);

    fireEvent.click(confirm);
    expect(resetMyData).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'RESET' } });
    expect(confirm.disabled).toBe(false);
  });

  it('keeps the two actions independent: arming reset never arms deletion', async () => {
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Reset my data' }));
    fireEvent.change(screen.getByLabelText(/type reset to confirm/i), {
      target: { value: 'RESET' },
    });
    expect(screen.queryByLabelText(/type delete to confirm/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    fireEvent.change(screen.getByLabelText(/type delete to confirm/i), {
      target: { value: 'DELETE' },
    });
    fireEvent.click(screen.getByRole('button', { name: /delete everything and sign out/i }));

    await waitFor(() => expect(deleteMyAccount).toHaveBeenCalledTimes(1));
    expect(resetMyData).not.toHaveBeenCalled();
  });

  it('cancelling closes the confirmation and forgets what was typed', () => {
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Reset my data' }));
    fireEvent.change(screen.getByLabelText(/type reset to confirm/i), {
      target: { value: 'RESET' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByLabelText(/type reset to confirm/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Reset my data' }));
    expect((screen.getByLabelText(/type reset to confirm/i) as HTMLInputElement).value).toBe('');
    expect((screen.getByRole('button', { name: 'Reset everything' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('disables both actions while offline, with a hint (C-36)', () => {
    onLineSpy?.mockReturnValue(false);
    renderPanel();

    expect((screen.getByRole('button', { name: 'Reset my data' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(
      (screen.getByRole('button', { name: 'Delete my account' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getAllByText(/you’re offline/i)).toHaveLength(2);
  });
});

describe('YourDataPanel — after the action', () => {
  it('a reset drops this account’s queued writes and refreshes the cached queries', async () => {
    await queueWrite(USER, 4);
    await queueWrite('user-2', 4);
    await offlineDB.dead.add({
      userId: USER,
      date: '2026-09-06',
      slotIndex: 9,
      op: 'upsert',
      labelId: 'label-1',
      note: null,
      chunkMinutes: 30,
      enqueuedAt: 1,
      rev: 'rev-dead',
      attempts: 8,
      failedAt: Date.now(),
      reason: 'permanent write failure',
    });
    useDayStore.getState().recordAction({
      date: '2026-09-07',
      slotIndex: 4,
      prev: null,
      description: 'Logged Deep work',
    });

    const { invalidate } = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Reset my data' }));
    fireEvent.change(screen.getByLabelText(/type reset to confirm/i), {
      target: { value: 'RESET' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reset everything' }));

    await waitFor(() => expect(resetMyData).toHaveBeenCalledTimes(1));
    await screen.findByText(/your data has been reset/i);

    // Queued writes referencing labels the reset just deleted would flush into
    // foreign-key failures and reappear as set-aside rows.
    const remaining = await offlineDB.writes.toArray();
    expect(remaining.map((r) => r.userId)).toEqual(['user-2']);
    expect(await offlineDB.dead.count()).toBe(0);
    expect(useDayStore.getState().lastAction).toBeNull();

    const keys = invalidatedKeys(invalidate);
    expect(keys).toContainEqual(['settings', USER]);
    expect(keys).toContainEqual(['entries']);
    expect(keys).toContainEqual(['labels-all', USER]);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('a deletion signs the user out once the account is gone', async () => {
    await queueWrite(USER, 4);
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    fireEvent.change(screen.getByLabelText(/type delete to confirm/i), {
      target: { value: 'DELETE' },
    });
    fireEvent.click(screen.getByRole('button', { name: /delete everything and sign out/i }));

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(deleteMyAccount).toHaveBeenCalledTimes(1);
    expect(await offlineDB.writes.count()).toBe(0);
    expect(deleteMyAccount.mock.invocationCallOrder[0]).toBeLessThan(
      signOut.mock.invocationCallOrder[0],
    );
  });

  it('a failed reset says so and leaves the queue intact', async () => {
    resetMyData.mockRejectedValue(Object.assign(new Error('down'), { kind: 'network' }));
    await queueWrite(USER, 4);
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Reset my data' }));
    fireEvent.change(screen.getByLabelText(/type reset to confirm/i), {
      target: { value: 'RESET' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reset everything' }));

    // The alert element is always mounted (empty:hidden), so wait on its text
    // rather than on the element appearing.
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/offline/i));
    expect(await offlineDB.writes.count()).toBe(1);
    expect(screen.queryByText(/your data has been reset/i)).toBeNull();
  });
});
