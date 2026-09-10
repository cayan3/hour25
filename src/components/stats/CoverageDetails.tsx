import { formatDuration } from '../../lib/time';
import type { PeriodKind, PeriodSummary } from '../../lib/stats';

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

// How much of the period was logged, rather than what it was spent on. A
// data-quality reading, so it sits below the breakdown rather than heading the
// page — but the summary line carries the figures so they stay legible while
// closed. That matters most on the Day tab, where "3h 30m still unlogged" is
// something the reader can act on immediately; on a month it never is.
export function CoverageDetails({
  kind,
  summary,
  sleepLabelName,
  deltaPoints,
  onOpenSettings,
}: {
  kind: PeriodKind;
  summary: PeriodSummary;
  sleepLabelName: string | null;
  deltaPoints: number | null;
  onOpenSettings: () => void;
}) {
  const loggedPercent =
    summary.expectedMinutes > 0 ? (summary.filledMinutes / summary.expectedMinutes) * 100 : 0;
  const wakingPercent =
    summary.wakingPercent === null ? '—' : `${Math.round(summary.wakingPercent)}%`;

  return (
    <details role="group" aria-label="Coverage and data quality" className="group">
      <summary className="flex min-h-11 cursor-pointer touch-manipulation list-none items-center gap-2 rounded text-sm text-slate-500 focus-visible:ring-2 focus-visible:ring-offset-2 dark:text-slate-400">
        <span aria-hidden="true" className="motion-safe:transition-transform group-open:rotate-90">
          ›
        </span>
        <span>
          {`Coverage & data quality — ${wakingPercent} of waking time logged · ${formatDuration(
            summary.untrackedMinutes,
          )} untracked`}
        </span>
      </summary>

      <div className="mt-3 space-y-4">
        <section>
          <h3 className="text-sm text-slate-500 dark:text-slate-400">Waking time logged</h3>
          <p className="text-3xl font-semibold tabular-nums">{wakingPercent}</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {`${formatDuration(summary.wakingFilledMinutes)} of ${formatDuration(
              summary.wakingExpectedMinutes,
            )} waking time`}
            {summary.sleepMinutes > 0 && ` · ${formatDuration(summary.sleepMinutes)} sleep excluded`}
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
                `${sleepLabelName}, excluded above`
              )
            }
          />
          <MetricCard
            title="Waking day"
            value={formatDuration(summary.wakingExpectedMinutes)}
            // "elapsed" alone reads as the whole period: on the 10th, a month's
            // figure covers the 1st to now, and nothing said so.
            caption="elapsed so far, minus sleep"
          />
        </section>
      </div>
    </details>
  );
}
