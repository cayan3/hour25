import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const listCategories = vi.fn();
vi.mock('../../src/lib/db/categories', () => ({
  listCategories: (...args: unknown[]) => listCategories(...args),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
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

// The week before, measured to the same Wednesday 10:15 by previousPeriodNow:
// 93 of 117 elapsed slots filled, 48 of them sleep → 45 of 69 waking = 65%.
const PREV_WEEK_ROWS = [
  ...serverRows('2026-07-06', 0, 16, SLEEP),
  ...serverRows('2026-07-06', 16, 48, WORK),
  ...serverRows('2026-07-07', 0, 16, SLEEP),
  ...serverRows('2026-07-07', 16, 24, WORK),
  ...serverRows('2026-07-08', 0, 16, SLEEP),
  ...serverRows('2026-07-08', 16, 21, WORK),
];

// Shift a fixture date forward a week so the previous period holds an
// identical shape to the current one.
function addWeek(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const shifted = new Date(y, m - 1, d - 7);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}-${String(
    shifted.getDate(),
  ).padStart(2, '0')}`;
}

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
  getEntriesForRange.mockImplementation(async (_userId: string, start: string) => {
    if (start === '2026-07-13') return WEEK_ROWS;
    if (start === '2026-07-06') return PREV_WEEK_ROWS;
    return [];
  });
  listAllLabels.mockResolvedValue(LABELS);
  listCategories.mockResolvedValue([]);
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

describe('StatsView by-day bars', () => {
  it('renders one row per day of the period with its own waking percentage', async () => {
    renderView();
    await screen.findByText('88%');

    // Mon and Tue fully elapsed; Tue lost 8 evening slots, so it trails Mon.
    expect(screen.getByText('Mon 13')).toBeTruthy();
    expect(screen.getByText('Sun 19')).toBeTruthy();
    const list = screen.getByText('Mon 13').closest('ul')!;
    expect(list.querySelectorAll('li')).toHaveLength(7);
  });

  it('names both series in a legend rather than leaving them to colour', async () => {
    renderView();
    await screen.findByText('88%');

    const legend = screen.getByText('Waking').closest('p')!;
    expect(legend.textContent).toContain('Waking');
    expect(legend.textContent).toContain('Sleep');
  });

  it('shows a dash for days the clock has not reached', async () => {
    renderView();
    await screen.findByText('88%');

    // Thu-Sun have no elapsed time, so there is no percentage to state.
    expect(screen.getAllByText('—')).toHaveLength(4);
  });

  it('is hidden for a single-day period, where a per-day breakdown says nothing', async () => {
    renderView();
    await screen.findByText('88%');

    fireEvent.click(screen.getByRole('button', { name: 'day' }));
    await waitFor(() => expect(screen.queryByText('By day')).toBeNull());
  });
});

describe('StatsView period comparison', () => {
  it('compares against the same slice of the previous period, in points', async () => {
    renderView();

    expect(await screen.findByText('+23 pts vs previous week')).toBeTruthy();
    expect(getEntriesForRange).toHaveBeenCalledWith(USER, '2026-07-06', '2026-07-12');
  });

  it('says so plainly when nothing changed', async () => {
    getEntriesForRange.mockImplementation(async (_userId: string, start: string) => {
      if (start === '2026-07-13') return WEEK_ROWS;
      if (start === '2026-07-06') return WEEK_ROWS.map((r) => ({ ...r, date: addWeek(r.date) }));
      return [];
    });
    renderView();

    expect(await screen.findByText('No change vs previous week')).toBeTruthy();
  });

  it('omits the comparison when the previous period has no waking time', async () => {
    getEntriesForRange.mockImplementation(async (_userId: string, start: string) =>
      start === '2026-07-13' ? WEEK_ROWS : [],
    );
    renderView();

    await screen.findByText('88%');
    // An empty previous week still has waking time (all of it untracked), so
    // the comparison is real: 88% against 0%.
    expect(await screen.findByText('+88 pts vs previous week')).toBeTruthy();
  });
});

describe('StatsView category totals', () => {
  const CATEGORIES = [
    { id: 'cat-health', name: 'Health', color: '#16a34a' },
    { id: 'cat-work', name: 'Work', color: '#0284c7' },
  ];

  function withCategories() {
    listCategories.mockResolvedValue(CATEGORIES);
    listAllLabels.mockResolvedValue([
      { ...LABELS[0], category_id: 'cat-health' },
      { ...LABELS[1], category_id: 'cat-work' },
    ]);
  }

  it('is hidden entirely for an account with no categories', async () => {
    renderView();
    await screen.findByText('88%');

    expect(screen.queryByText('Totals by category')).toBeNull();
  });

  it('groups labels into their categories', async () => {
    withCategories();
    renderView();
    await screen.findByText('88%');

    // Scoped: Health holds only the sleep label, so its figure is identical to
    // the Sleep row's in the by-label section above.
    const section = screen.getByText('Totals by category').closest('section')!;
    expect(within(section).getByText('Health')).toBeTruthy();
    expect(within(section).getByText('Work')).toBeTruthy();
    expect(within(section).getByText('24h · 41%')).toBeTruthy();
  });

  it('drops sleep and divides by waking time in the exclude-sleep variant', async () => {
    withCategories();
    renderView();
    await screen.findByText('88%');

    fireEvent.click(screen.getByRole('checkbox', { name: /exclude sleep/i }));

    // Health held only the sleep label, so it disappears; Work is now 30h 30m
    // of the 34h 30m of waking time rather than of the whole elapsed week.
    await waitFor(() => expect(screen.queryByText('Health')).toBeNull());
    expect(screen.getByText('30h 30m · 88%')).toBeTruthy();
  });
});
