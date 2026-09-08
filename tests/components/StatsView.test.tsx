import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatsView } from '../../src/components/stats/StatsView';
import { offlineDB } from '../../src/lib/offline/store';

vi.mock('../../src/lib/supabase', () => ({ supabase: { auth: {} } }));

const getEntriesForRange = vi.fn();
vi.mock('../../src/lib/db/entries', () => ({
  getEntriesForRange: (...args: unknown[]) => getEntriesForRange(...args),
}));

const listAllLabels = vi.fn();
vi.mock('../../src/lib/db/labels', () => ({
  listAllLabels: (...args: unknown[]) => listAllLabels(...args),
  listActiveLabels: vi.fn(),
  createLabel: vi.fn(),
  softDeleteLabel: vi.fn(),
  restoreLabel: vi.fn(),
  updateLabel: vi.fn(),
}));

const getSettings = vi.fn();
vi.mock('../../src/lib/db/settings', () => ({
  getSettings: (...args: unknown[]) => getSettings(...args),
  updateSettings: vi.fn(),
}));

const USER = 'user-1';
const SLEEP = 'label-sleep';
const WORK = 'label-work';

// Wed 15 Jul 2026, 10:15 — slot 20, so 21 of today's slots have elapsed and
// the current week runs Mon 13 → Sun 19.
const NOW = new Date(2026, 6, 15, 10, 15);

const LABELS = [
  { id: SLEEP, name: 'Sleep', color: '#334155', deleted_at: null },
  { id: WORK, name: 'Deep work', color: '#0284c7', deleted_at: null },
];

function settings(sleepLabelId: string | null) {
  return {
    id: 'settings-1',
    user_id: USER,
    sleep_label_id: sleepLabelId,
    sleep_start: 46,
    sleep_end: 14,
    onboarded_at: '2026-01-01T00:00:00Z',
  };
}

function serverRows(date: string, from: number, to: number, labelId: string) {
  return Array.from({ length: to - from }, (_, i) => ({
    date,
    slot_index: from + i,
    label_id: labelId,
    note: null,
    chunk_minutes: 30,
  }));
}

// Mon + Tue + Wed-so-far, with 8 slots left untracked on the Tuesday evening.
// Elapsed 117 slots, 109 filled, 48 of them sleep → 61 of 69 waking = 88%.
const WEEK_ROWS = [
  ...serverRows('2026-07-13', 0, 16, SLEEP),
  ...serverRows('2026-07-13', 16, 48, WORK),
  ...serverRows('2026-07-14', 0, 16, SLEEP),
  ...serverRows('2026-07-14', 16, 40, WORK),
  ...serverRows('2026-07-15', 0, 16, SLEEP),
  ...serverRows('2026-07-15', 16, 21, WORK),
];

const onOpenToday = vi.fn();
const onOpenSettings = vi.fn();

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <StatsView userId={USER} onOpenToday={onOpenToday} onOpenSettings={onOpenSettings} />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  await offlineDB.writes.clear();
  getEntriesForRange.mockResolvedValue(WEEK_ROWS);
  listAllLabels.mockResolvedValue(LABELS);
  getSettings.mockResolvedValue(settings(SLEEP));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('StatsView', () => {
  it('reads the current week and subtracts sleep from the headline metric', async () => {
    renderView();

    expect(await screen.findByText('88%')).toBeTruthy();
    expect(getEntriesForRange).toHaveBeenCalledWith(USER, '2026-07-13', '2026-07-19');
    // Sleep excluded from both sides: 30h 30m of waking work out of 34h 30m.
    expect(screen.getByText(/30h 30m of 34h 30m waking time/)).toBeTruthy();
    expect(screen.getByText(/24h sleep excluded/)).toBeTruthy();
  });

  it('lists per-label totals with the duration stated in text, not only in the bar', async () => {
    renderView();

    await screen.findByText('88%');
    expect(screen.getByText('Deep work')).toBeTruthy();
    expect(screen.getByText('30h 30m · 52%')).toBeTruthy();
    expect(screen.getByText('24h · 41%')).toBeTruthy();
  });

  it('counts the pending queue, so an unflushed entry is not missing from the totals', async () => {
    // The overlay is the whole reason stats are derived client-side (C-77):
    // a slot logged offline must show up here as soon as it is queued.
    getEntriesForRange.mockResolvedValue([]);
    await offlineDB.writes.bulkPut(
      Array.from({ length: 4 }, (_, i) => ({
        userId: USER,
        date: '2026-07-14',
        slotIndex: i,
        op: 'upsert' as const,
        labelId: WORK,
        note: null,
        chunkMinutes: 30,
        enqueuedAt: 1,
        rev: `rev-${i}`,
        attempts: 0,
      })),
    );

    renderView();

    await waitFor(() => expect(screen.getByText('Deep work')).toBeTruthy());
    expect(screen.getByText('2h · 3%')).toBeTruthy();
  });

  it('shows the empty state with a link to today when nothing is logged', async () => {
    getEntriesForRange.mockResolvedValue([]);
    renderView();

    expect(
      await screen.findByText(/Log a few days and your patterns will show up here/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /go to today/i }));
    expect(onOpenToday).toHaveBeenCalled();
  });

  it('points at Settings when no sleep label is set, and subtracts nothing', async () => {
    getSettings.mockResolvedValue(settings(null));
    renderView();

    // Without a sleep label nothing is excluded: 109 of 117 elapsed slots.
    expect(await screen.findByText('93%')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /set a sleep label/i }));
    expect(onOpenSettings).toHaveBeenCalled();
  });

  it('keeps a soft-deleted label in history and marks it as deleted', async () => {
    listAllLabels.mockResolvedValue([
      LABELS[0],
      { ...LABELS[1], deleted_at: '2026-07-01T00:00:00Z' },
    ]);
    renderView();

    expect(await screen.findByText(/Deep work \(deleted\)/)).toBeTruthy();
  });

  it('switches the range it reads when the period changes', async () => {
    renderView();
    await screen.findByText('88%');

    fireEvent.click(screen.getByRole('button', { name: 'month' }));
    await waitFor(() =>
      expect(getEntriesForRange).toHaveBeenCalledWith(USER, '2026-07-01', '2026-07-31'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'day' }));
    await waitFor(() =>
      expect(getEntriesForRange).toHaveBeenCalledWith(USER, '2026-07-15', '2026-07-15'),
    );
  });

  it('steps to the previous period and offers a way back to the current one', async () => {
    renderView();
    await screen.findByText('88%');
    expect(screen.queryByRole('button', { name: /this week/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /previous week/i }));
    await waitFor(() =>
      expect(getEntriesForRange).toHaveBeenCalledWith(USER, '2026-07-06', '2026-07-12'),
    );

    // Back to the current week: the reset button retires itself. Asserting on
    // the fetch would be wrong — the current week is already cached and inside
    // its staleTime, so returning to it correctly issues no new read.
    fireEvent.click(screen.getByRole('button', { name: /this week/i }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /this week/i })).toBeNull());
    expect(await screen.findByText('88%')).toBeTruthy();
  });
});
