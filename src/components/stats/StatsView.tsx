import { useState } from 'react';
import { useStats } from '../../hooks/useStats';
import { BreakdownTable, type BreakdownRow } from './BreakdownTable';
import { periodRange, shiftPeriod, type DayTotal, type PeriodKind } from '../../lib/stats';
import { CHUNK_MINUTES, SLOTS_PER_DAY } from '../../lib/constants';
import { formatDuration, localDateString, parseLocalDate } from '../../lib/time';

// The app's accent, matched to the "now" marker and the Today pill. Sleep uses
// the user's own sleep-label colour, so the two series are always named in the
// legend rather than left to be told apart by colour (DESIGN §10).
const WAKING_COLOR = '#0284c7';
const SLEEP_FALLBACK_COLOR = '#94a3b8';

const PERIODS: PeriodKind[] = ['day', 'week', 'month'];

const RESET_LABEL: Record<PeriodKind, string> = {
  day: 'Today',
  week: 'This week',
  month: 'This month',
};

function periodHeading(kind: PeriodKind, start: string, end: string): string {
  const day = parseLocalDate(start);
  if (kind === 'day') {
    return day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  if (kind === 'month') {
    return day.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  const short: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${day.toLocaleDateString(undefined, short)} – ${parseLocalDate(end).toLocaleDateString(undefined, short)}`;
}

function MetricCard({
  title,
  value,
  caption,
}: {
  title: string;
  value: string;
  caption: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {title}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{caption}</p>
    </div>
  );
}

function DayBarRow({ day, sleepColor }: { day: DayTotal; sleepColor: string }) {
  const elapsedPct = (day.expectedSlots / SLOTS_PER_DAY) * 100;
  const sleepPct = (day.sleepSlots / SLOTS_PER_DAY) * 100;
  const wakingPct = ((day.filledSlots - day.sleepSlots) / SLOTS_PER_DAY) * 100;
  const wakingExpected = day.expectedSlots - day.sleepSlots;
  const percent =
    wakingExpected > 0
      ? Math.round(((day.filledSlots - day.sleepSlots) / wakingExpected) * 100)
      : null;
  const date = parseLocalDate(day.date);

  return (
    <li className="flex items-center gap-3">
      <span className="w-14 shrink-0 text-xs text-slate-500 tabular-nums dark:text-slate-400">
        {/* Composed rather than asked of Intl: {weekday, day} with no month
            renders as "13 Mon" in en-US, which reads as a garbled date. */}
        {`${date.toLocaleDateString(undefined, { weekday: 'short' })} ${date.getDate()}`}
      </span>
      {/* Three layers: the whole 24h, the part of it that has elapsed, then the
          logged segments. Every day's bar is the same width, so a short bar
          means an unlogged day rather than a shorter one. */}
      <span
        aria-hidden="true"
        className="relative h-2 flex-1 rounded bg-slate-100 dark:bg-slate-800/60"
      >
        <span
          className="absolute inset-y-0 left-0 rounded bg-slate-200 dark:bg-slate-800"
          style={{ width: `${elapsedPct}%` }}
        />
        <span
          className="absolute inset-y-0 left-0 rounded-l"
          style={{ width: `${wakingPct}%`, backgroundColor: WAKING_COLOR }}
        />
        <span
          className="absolute inset-y-0"
          style={{ left: `${wakingPct}%`, width: `${sleepPct}%`, backgroundColor: sleepColor }}
        />
      </span>
      <span className="hidden w-16 shrink-0 text-right text-xs text-slate-500 tabular-nums dark:text-slate-400 sm:inline">
        {day.expectedSlots === 0 ? '' : formatDuration(day.filledSlots * CHUNK_MINUTES)}
      </span>
      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">
        {percent === null ? '—' : `${percent}%`}
      </span>
    </li>
  );
}

// Phase 1.5 stats: daily/weekly/monthly totals and % of waking day, computed
// client-side from the cached entries + the pending overlay (C-77). Plain CSS
// bars, no charting library — Recharts is Phase 2 stack and DESIGN §11 keeps
// it out of this bundle.
export function StatsView({
  userId,
  onOpenToday,
  onOpenSettings,
}: {
  userId: string;
  onOpenToday: () => void;
  onOpenSettings: () => void;
}) {
  const [kind, setKind] = useState<PeriodKind>('week');
  const [anchor, setAnchor] = useState<string>(() => localDateString());
  const [excludeSleep, setExcludeSleep] = useState(false);
  const {
    loading,
    start,
    end,
    summary,
    rows,
    categoryRows,
    hasCategories,
    sleepLabelName,
    sleepColor,
    trackedDays,
    previousTrackedDays,
    deltaPoints,
  } = useStats(userId, kind, anchor, excludeSleep);

  const labelRows: BreakdownRow[] = rows.map((row) => ({
    id: row.labelId,
    name: row.name,
    color: row.color,
    deleted: row.deleted,
    suffix: row.isSleep ? 'sleep' : undefined,
    minutes: row.minutes,
    minutesPerDay: row.minutesPerDay,
    percent: row.percent,
    change: row.change,
  }));

  const categoryBreakdownRows: BreakdownRow[] = categoryRows.map((row) => ({
    id: row.categoryId ?? 'uncategorized',
    name: row.name,
    color: row.color,
    minutes: row.minutes,
    minutesPerDay: row.minutesPerDay,
    percent: row.percent,
    change: null,
  }));

  // Stated because it moves between periods: a per-day average over five
  // tracked days is a different claim from one over seven, and a comparison
  // between two periods that tracked different numbers of days is only
  // readable if both divisors are on the page.
  const divisorCaption =
    kind === 'day'
      ? null
      : `averages across ${trackedDays} tracked ${trackedDays === 1 ? 'day' : 'days'}` +
        (previousTrackedDays > 0 ? ` · previous ${kind} ${previousTrackedDays}` : '');

  const isCurrent = start === periodRange(kind, localDateString()).start;
  const loggedPercent =
    summary.expectedMinutes > 0 ? (summary.filledMinutes / summary.expectedMinutes) * 100 : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-3 md:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setAnchor(shiftPeriod(kind, anchor, -1))}
            aria-label={`Previous ${kind}`}
            className="min-h-11 min-w-11 touch-manipulation rounded px-2 text-lg hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-offset-2 dark:hover:bg-slate-800"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setAnchor(shiftPeriod(kind, anchor, 1))}
            aria-label={`Next ${kind}`}
            className="min-h-11 min-w-11 touch-manipulation rounded px-2 text-lg hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-offset-2 dark:hover:bg-slate-800"
          >
            ›
          </button>
          <h1 className="ml-1 text-sm font-medium">{periodHeading(kind, start, end)}</h1>
          {!isCurrent && (
            <button
              type="button"
              onClick={() => setAnchor(localDateString())}
              className="ml-2 min-h-11 touch-manipulation rounded-full border border-sky-300 px-3 text-sm text-sky-600 hover:bg-sky-50 focus-visible:ring-2 focus-visible:ring-offset-2 dark:border-sky-800 dark:text-sky-400 dark:hover:bg-sky-950"
            >
              {RESET_LABEL[kind]}
            </button>
          )}
        </div>
        <div role="group" aria-label="Period" className="flex gap-1">
          {PERIODS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={`min-h-11 touch-manipulation rounded px-3 text-sm capitalize focus-visible:ring-2 focus-visible:ring-offset-2 ${
                kind === k
                  ? 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-50'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
      ) : summary.filledSlots === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Log a few days and your patterns will show up here.{' '}
          <button
            type="button"
            onClick={onOpenToday}
            className="rounded underline focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            Go to today
          </button>
          .
        </p>
      ) : (
        <>
          {/* DESIGN §8 ordering: headline metric first, then the cards, then
              the totals. */}
          <section>
            <h2 className="text-sm text-slate-500 dark:text-slate-400">Waking time logged</h2>
            <p className="text-4xl font-semibold tabular-nums">
              {summary.wakingPercent === null ? '—' : `${Math.round(summary.wakingPercent)}%`}
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {`${formatDuration(summary.wakingFilledMinutes)} of ${formatDuration(
                summary.wakingExpectedMinutes,
              )} waking time`}
              {summary.sleepMinutes > 0 &&
                ` · ${formatDuration(summary.sleepMinutes)} sleep excluded`}
            </p>
            {/* Compared against the same slice of the previous period, not the
                whole of it — a Wednesday is measured against a Wednesday. The
                sign carries the direction; nothing rides on colour alone. */}
            {deltaPoints !== null && (
              <p className="mt-0.5 text-sm text-slate-500 tabular-nums dark:text-slate-400">
                {deltaPoints === 0
                  ? `No change vs previous ${kind}`
                  : `${deltaPoints > 0 ? '+' : '−'}${Math.abs(deltaPoints)} pts vs previous ${kind}`}
              </p>
            )}
          </section>

          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricCard
              title="Logged"
              value={formatDuration(summary.filledMinutes)}
              caption={`${Math.round(loggedPercent)}% of elapsed time`}
            />
            <MetricCard
              title="Untracked"
              value={formatDuration(summary.untrackedMinutes)}
              caption="empty slots"
            />
            <MetricCard
              title="Sleep"
              value={sleepLabelName === null ? '—' : formatDuration(summary.sleepMinutes)}
              caption={
                sleepLabelName === null ? (
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="rounded underline focus-visible:ring-2 focus-visible:ring-offset-2"
                  >
                    Set a sleep label
                  </button>
                ) : (
                  `${sleepLabelName}, excluded below`
                )
              }
            />
            <MetricCard
              title="Waking day"
              value={formatDuration(summary.wakingExpectedMinutes)}
              caption="elapsed, minus sleep"
            />
          </section>

          {kind !== 'day' && (
            <section>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 className="text-sm font-medium">By day</h2>
                {/* The legend names both series next to their swatch, per
                    DESIGN §10 — the bars are aria-hidden, so this is what
                    makes them readable at all. */}
                <p className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 rounded-sm"
                      style={{ backgroundColor: WAKING_COLOR }}
                    />
                    Waking
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 rounded-sm"
                      style={{ backgroundColor: sleepColor ?? SLEEP_FALLBACK_COLOR }}
                    />
                    {sleepLabelName ?? 'Sleep'}
                  </span>
                </p>
              </div>
              <ul className="space-y-1.5">
                {summary.byDate.map((day) => (
                  <DayBarRow
                    key={day.date}
                    day={day}
                    sleepColor={sleepColor ?? SLEEP_FALLBACK_COLOR}
                  />
                ))}
              </ul>
            </section>
          )}

          <section>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="text-sm font-medium">Breakdown by label</h2>
              {/* C-24's exclude-sleep variant, promoted from the category
                  section to the page: sleep is normally the largest block of
                  any day and swamps everything it sits beside. */}
              <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={excludeSleep}
                  onChange={(e) => setExcludeSleep(e.target.checked)}
                  className="h-4 w-4 rounded focus-visible:ring-2 focus-visible:ring-offset-2"
                />
                Exclude sleep
              </label>
            </div>
            {divisorCaption && (
              <p className="mb-2 text-xs text-slate-500 tabular-nums dark:text-slate-400">
                {divisorCaption}
              </p>
            )}
            <BreakdownTable rows={labelRows} showPerDay={kind !== 'day'} />
          </section>

          {/* Hidden entirely for an account with no categories: every label
              would fall into one Uncategorized bar, which says nothing. */}
          {hasCategories && (
            <section>
              <h2 className="mb-2 text-sm font-medium">Breakdown by category</h2>
              <BreakdownTable rows={categoryBreakdownRows} showPerDay={kind !== 'day'} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
