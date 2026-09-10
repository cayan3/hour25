import { useState } from 'react';
import { useStats } from '../../hooks/useStats';
import { BreakdownTable, type BreakdownRow } from './BreakdownTable';
import { CoverageDetails } from './CoverageDetails';
import { DayBars } from './DayBars';
import { PatternSection } from './PatternSection';
import { DayStrip } from './DayStrip';
import { periodRange, shiftPeriod, type PeriodKind } from '../../lib/stats';
import { localDateString, parseLocalDate } from '../../lib/time';

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
  // Transient view state belonging to this surface alone, so local useState —
  // Zustand is app-wide UI state only (CLAUDE.md).
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const {
    loading,
    start,
    end,
    summary,
    entries,
    rows,
    categoryRows,
    hasCategories,
    sleepLabelName,
    trackedDays,
    previousTrackedDays,
    split,
    extremes,
    deltaPoints,
  } = useStats(userId, kind, anchor, excludeSleep);

  const barLabels = new Map(rows.map((row) => [row.labelId, { name: row.name, color: row.color }]));

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
          <section data-testid="label-breakdown">
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
            <BreakdownTable
              rows={labelRows}
              showPerDay={kind !== 'day'}
              highlightedId={kind === 'day' ? highlightedId : null}
              onHighlight={kind === 'day' ? setHighlightedId : undefined}
            />
          </section>

          {/* Hidden entirely for an account with no categories: every label
              would fall into one Uncategorized bar, which says nothing. */}
          {hasCategories && (
            <section>
              <h2 className="mb-2 text-sm font-medium">Breakdown by category</h2>
              <BreakdownTable rows={categoryBreakdownRows} showPerDay={kind !== 'day'} />
            </section>
          )}

          {kind !== 'day' && (
            <DayBars
              byDate={summary.byDate}
              order={rows}
              labelById={barLabels}
              extremes={extremes}
            />
          )}

          {kind !== 'day' && (
            <PatternSection split={split} order={rows} labelById={barLabels} />
          )}

          {kind === 'day' && (
            <DayStrip
              entries={entries}
              expectedSlots={summary.byDate[0]?.expectedSlots ?? 0}
              labelById={barLabels}
              highlightedId={highlightedId}
              onHighlight={setHighlightedId}
            />
          )}

          <CoverageDetails
            kind={kind}
            summary={summary}
            sleepLabelName={sleepLabelName}
            deltaPoints={deltaPoints}
            onOpenSettings={onOpenSettings}
          />
        </>
      )}
    </div>
  );
}
