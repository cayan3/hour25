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
  it('reads the current week and keeps the coverage figures, demoted', async () => {
    renderView();

    await screen.findByTestId('label-breakdown');
    expect(getEntriesForRange).toHaveBeenCalledWith(USER, '2026-07-13', '2026-07-19');

    const disclosure = screen.getByRole('group', { name: /coverage/i }) as HTMLDetailsElement;
    // Closed by default: the page leads with what the time went on, not with
    // how much of it was logged.
    expect(disclosure.open).toBe(false);
    // The figures stay readable without opening it — on a Day, "still
    // unlogged" is something the reader can act on right now.
    expect(disclosure.textContent).toContain('88%');
    expect(disclosure.textContent).toContain('untracked');
  });

  it('still reconciles sleep out of both sides once the coverage detail is opened', async () => {
    renderView();
    await screen.findByTestId('label-breakdown');

    fireEvent.click(screen.getByText(/Coverage & data quality/));

    // Sleep excluded from both sides: 30h 30m of waking work out of 34h 30m.
    expect(screen.getByText(/30h 30m of 34h 30m waking time/)).toBeTruthy();
    expect(screen.getByText(/24h sleep excluded/)).toBeTruthy();
  });

  it('states each label as a per-day average and a total, in text not only in the bar', async () => {
    renderView();

    await screen.findByTestId('label-breakdown');
    // Three tracked days (Mon, Tue, Wed-so-far): 30h 30m of work averages
    // 10h 10m a day, and the divisor is stated because it moves.
    const workRow = screen.getAllByTestId('breakdown-share')[0].closest('li')!;
    expect(workRow.textContent).toContain('10h 10m/day');
    expect(workRow.textContent).toContain('30h 30m');
    expect(screen.getByText(/3 tracked days/)).toBeTruthy();
  });

  it('divides shares by logged time, so the rows account for all of it', async () => {
    renderView();
    await screen.findByTestId('label-breakdown');

    const shares = screen
      .getAllByTestId('breakdown-share')
      .map((el) => Number(el.textContent!.replace('%', '')));
    // Integer rounding can land on 99 or 101; what must never happen is a page
    // whose shares sum to well under 100 because untracked time ate the rest.
    expect(shares.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(99);
    expect(shares.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(101);
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

    const section = await screen.findByTestId('label-breakdown');
    await waitFor(() => expect(within(section).getByText('Deep work')).toBeTruthy());
    expect(within(section).getByText('Deep work').closest('li')!.textContent).toContain('2h');
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
    await screen.findByTestId('label-breakdown');

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
    await screen.findByTestId('label-breakdown');
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
    expect(await screen.findByTestId('label-breakdown')).toBeTruthy();
  });
});

describe('StatsView by-day bars', () => {
  it('renders one row per day of the period with its logged time', async () => {
    renderView();
    await screen.findByTestId('label-breakdown');

    expect(screen.getByText('Mon 13')).toBeTruthy();
    expect(screen.getByText('Sun 19')).toBeTruthy();
    const list = screen.getByText('Mon 13').closest('ul')!;
    expect(list.querySelectorAll('li')).toHaveLength(7);
  });

  it('describes each day’s composition in text, not only in the stack', async () => {
    renderView();
    await screen.findByTestId('label-breakdown');

    // The bars are aria-hidden, so this sr-only line is the only route by
    // which the stack reaches a screen reader.
    const row = screen.getByText('Mon 13').closest('li')!;
    expect(row.textContent).toContain('Deep work');
    expect(row.textContent).toContain('Sleep');
  });

  it('says a day the clock has not reached logged nothing, rather than showing a gap', async () => {
    renderView();
    await screen.findByTestId('label-breakdown');

    const row = screen.getByText('Sun 19').closest('li')!;
    expect(row.textContent).toContain('nothing logged');
  });

  it('names the best and the quietest tracked day', async () => {
    renderView();
    await screen.findByTestId('label-breakdown');

    // Mon logged 16h awake, Wed only 2h 30m of an elapsed morning.
    expect(screen.getByText(/best Mon 13/)).toBeTruthy();
    expect(screen.getByText(/quietest Wed 15/)).toBeTruthy();
  });

  it('is hidden for a single-day period, where a per-day breakdown says nothing', async () => {
    renderView();
    await screen.findByTestId('label-breakdown');

    fireEvent.click(screen.getByRole('button', { name: 'day' }));
    await waitFor(() => expect(screen.queryByText('By day')).toBeNull());
  });
});

describe('StatsView period comparison', () => {
  it('states each label as a change in minutes per tracked day', async () => {
    renderView();

    await screen.findByTestId('label-breakdown');
    expect(getEntriesForRange).toHaveBeenCalledWith(USER, '2026-07-06', '2026-07-12');
    // Work: 10h 10m a day now against 7h 30m a day over the same slice of the
    // previous week, both across three tracked days.
    expect(screen.getByText('+2h 40m/day')).toBeTruthy();
  });

  it('says so plainly when a label did not move', async () => {
    renderView();

    // Sleep is 8h a day in both weeks, so its row must say nothing changed
    // rather than quietly omitting the comparison.
    expect(await screen.findByText('no change')).toBeTruthy();
  });

  it('claims nothing when the previous period tracked no days at all', async () => {
    // Renamed from "omits the comparison when the previous period has no
    // waking time", whose body asserted the opposite of its name. Dividing by
    // zero tracked days would read as a rise from zero — a claim about
    // behaviour, where the truth is an absence of data.
    getEntriesForRange.mockImplementation(async (_userId: string, start: string) =>
      start === '2026-07-13' ? WEEK_ROWS : [],
    );
    renderView();

    await screen.findByTestId('label-breakdown');
    expect(screen.queryByText(/\/day$/)).toBeNull();
    expect(screen.queryByText('no change')).toBeNull();
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
    await screen.findByTestId('label-breakdown');

    expect(screen.queryByText('Breakdown by category')).toBeNull();
  });

  it('groups labels into their categories', async () => {
    withCategories();
    renderView();
    await screen.findByTestId('label-breakdown');

    // Scoped: Health holds only the sleep label, so its figure is identical to
    // the Sleep row's in the by-label section above.
    const section = screen.getByText('Breakdown by category').closest('section')!;
    expect(within(section).getByText('Health')).toBeTruthy();
    expect(within(section).getByText('Work')).toBeTruthy();
    // Health holds only sleep: 24h of the week's logged time.
    expect(within(section).getByText('Health').closest('li')!.textContent).toContain('24h');
  });

  it('drops sleep from every section at once in the exclude-sleep variant', async () => {
    withCategories();
    renderView();
    await screen.findByTestId('label-breakdown');

    fireEvent.click(screen.getByRole('checkbox', { name: /exclude sleep/i }));

    // Health held only the sleep label, so it disappears — and with sleep gone
    // from the denominator too, the remaining shares still account for all of
    // what is left rather than summing to some fraction of the elapsed week.
    await waitFor(() => expect(screen.queryByText('Health')).toBeNull());
    const shares = screen
      .getAllByTestId('breakdown-share')
      .map((el) => Number(el.textContent!.replace('%', '')));
    expect(shares.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(99);
  });
});

describe('StatsView weekday and weekend', () => {
  it('splits each label into a weekday and a weekend average', async () => {
    renderView();
    await screen.findByTestId('label-breakdown');

    const section = screen.getByRole('region', { name: /weekday/i });
    expect(within(section).getByText('Deep work')).toBeTruthy();
    expect(section.textContent).toMatch(/on weekdays/);
  });

  it('says a weekend has not happened yet rather than reporting it as zero', async () => {
    // The fixture week is anchored on Wednesday, so Sat and Sun have not
    // elapsed — an absence of data, not a week spent doing nothing.
    renderView();
    await screen.findByTestId('label-breakdown');

    expect(screen.getByRole('region', { name: /weekday/i }).textContent).toMatch(/no weekend yet/);
  });

  it('is hidden for a single-day period, which has no split to make', async () => {
    renderView();
    await screen.findByTestId('label-breakdown');

    fireEvent.click(screen.getByRole('button', { name: 'day' }));
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: /weekday/i })).toBeNull(),
    );
  });
});

describe('StatsView day strip', () => {
  const openDay = async () => {
    // The shared mock only answers the week ranges; a Day period reads a
    // single date, so serve Wednesday's slice of the same fixture.
    getEntriesForRange.mockImplementation(async (_userId: string, start: string) => {
      if (start === '2026-07-13') return WEEK_ROWS;
      if (start === '2026-07-06') return PREV_WEEK_ROWS;
      return WEEK_ROWS.filter((r) => r.date === start);
    });
    renderView();
    await screen.findByTestId('label-breakdown');
    fireEvent.click(screen.getByRole('button', { name: 'day' }));
    return await screen.findByTestId('day-strip');
  };

  it('renders all 48 slots of the day', async () => {
    const strip = await openDay();

    expect(strip.querySelectorAll('[data-slot]')).toHaveLength(48);
  });

  it('distinguishes not-yet-elapsed slots from elapsed empty ones', async () => {
    // Wed 10:15 is slot 20, and the fixture logs 0-21, so 21-47 are future.
    const strip = await openDay();

    expect(strip.querySelectorAll('[data-state="future"]').length).toBeGreaterThan(0);
    expect(strip.querySelectorAll('[data-state="logged"]').length).toBe(21);
  });

  it('describes the day as runs in text, since the squares are decorative', async () => {
    await openDay();

    // 00:00-08:00 Sleep, then work through the current slot.
    const summary = screen.getByTestId('day-strip-summary').textContent!;
    expect(summary).toContain('0:00–8:00 Sleep');
    expect(summary).toContain('Deep work');
  });

  it('highlights a label’s slots on keyboard focus, not only on hover', async () => {
    // Hover-only would make this a desktop-mouse feature.
    const strip = await openDay();
    expect(strip.querySelector('[data-highlighted="true"]')).toBeNull();

    const section = screen.getByTestId('label-breakdown');
    fireEvent.focus(within(section).getAllByRole('button')[0]);

    await waitFor(() =>
      expect(
        screen.getByTestId('day-strip').querySelector('[data-highlighted="true"]'),
      ).toBeTruthy(),
    );
  });

  it('is hidden for a multi-day period', async () => {
    renderView();
    await screen.findByTestId('label-breakdown');

    expect(screen.queryByTestId('day-strip')).toBeNull();
  });
});
