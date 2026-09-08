import { useState } from 'react';
import { useStats, type StatsLabelRow } from '../../hooks/useStats';
import { periodRange, shiftPeriod, type PeriodKind } from '../../lib/stats';
import { formatDuration, localDateString, parseLocalDate } from '../../lib/time';

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

function LabelTotalRow({ row }: { row: StatsLabelRow }) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          {/* Decorative: the name and the figures carry every fact this row
              states, so nothing is encoded in color alone (DESIGN §10). */}
          <span
            aria-hidden="true"
            style={{ backgroundColor: row.color }}
            className="h-3 w-3 shrink-0 rounded-sm"
          />
          <span className="truncate">
            {row.name}
            {row.deleted && ' (deleted)'}
            {row.isSleep && (
              <span className="ml-1.5 text-xs text-slate-500 dark:text-slate-400">sleep</span>
            )}
          </span>
        </span>
        <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
          {`${formatDuration(row.minutes)} · ${Math.round(row.percent)}%`}
        </span>
      </div>
      <div aria-hidden="true" className="mt-1 h-2 rounded bg-slate-200 dark:bg-slate-800">
        <div
          className="h-2 rounded motion-safe:transition-[width] motion-safe:duration-200"
          style={{ width: `${row.percent}%`, backgroundColor: row.color }}
        />
      </div>
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
  const { loading, start, end, summary, rows, sleepLabelName } = useStats(userId, kind, anchor);

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

          <section>
            <h2 className="mb-2 text-sm font-medium">Totals by label</h2>
            <ul className="space-y-3">
              {rows.map((row) => (
                <LabelTotalRow key={row.labelId} row={row} />
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
