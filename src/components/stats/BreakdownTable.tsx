import { formatDuration } from '../../lib/time';
import type { LabelChange } from '../../lib/stats';

export interface BreakdownRow {
  id: string;
  name: string;
  color: string;
  /** Appends " (deleted)" inline, in the same text node as the name. */
  deleted?: boolean;
  /** Muted text after the name — "sleep". */
  suffix?: string;
  minutes: number;
  minutesPerDay: number;
  /** Share of logged time, 0–100. */
  percent: number;
  change: LabelChange | null;
}

// The sign carries the direction, never colour alone (DESIGN §10), and
// formatDuration clamps negatives to "0m" — so the magnitude goes through it
// as an absolute value with the sign written by hand.
function changeText(change: LabelChange | null): string | null {
  if (change === null || change.kind === 'unmeasurable') return null;
  if (change.kind === 'new') return 'new this period';
  const minutes = Math.round(change.deltaMinutesPerDay);
  if (minutes === 0) return 'no change';
  return `${minutes > 0 ? '+' : '−'}${formatDuration(Math.abs(minutes))}/day`;
}

// One row shape serves labels and categories — the columns are identical and
// there is no reason to maintain two of these.
export function BreakdownTable({
  rows,
  showPerDay,
  highlightedId = null,
  onHighlight,
}: {
  rows: BreakdownRow[];
  /** False on the Day tab, where the divisor is 1 and the column repeats the total. */
  showPerDay: boolean;
  highlightedId?: string | null;
  onHighlight?: (id: string | null) => void;
}) {
  return (
    <ul className="space-y-3">
      {rows.map((row) => {
        const dimmed = highlightedId !== null && highlightedId !== row.id;
        const change = changeText(row.change);

        // Decorative: the name and the figures carry every fact this row
        // states, so nothing is encoded in colour alone (DESIGN §10).
        const name = (
          <>
            <span
              aria-hidden="true"
              style={{ backgroundColor: row.color }}
              className="h-3 w-3 shrink-0 rounded-sm"
            />
            <span className="truncate">
              {row.name}
              {row.deleted && ' (deleted)'}
              {row.suffix && (
                <span className="ml-1.5 text-xs text-slate-500 dark:text-slate-400">
                  {row.suffix}
                </span>
              )}
            </span>
          </>
        );

        return (
          <li
            key={row.id}
            className={`motion-safe:transition-opacity motion-safe:duration-150 ${
              dimmed ? 'opacity-40' : ''
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
              {/* A button, not a hover target: highlighting has to be reachable
                  by keyboard and by touch, or it is a mouse-only feature. */}
              {onHighlight ? (
                <button
                  type="button"
                  onMouseEnter={() => onHighlight(row.id)}
                  onMouseLeave={() => onHighlight(null)}
                  onFocus={() => onHighlight(row.id)}
                  onBlur={() => onHighlight(null)}
                  className="flex min-h-11 min-w-0 touch-manipulation items-center gap-2 rounded text-left focus-visible:ring-2 focus-visible:ring-offset-2"
                >
                  {name}
                </button>
              ) : (
                <span className="flex min-w-0 items-center gap-2">{name}</span>
              )}
              <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
                {showPerDay && `${formatDuration(row.minutesPerDay)}/day · `}
                {formatDuration(row.minutes)}
                {' · '}
                <span data-testid="breakdown-share">{Math.round(row.percent)}%</span>
              </span>
            </div>
            {change && (
              <p className="mt-0.5 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                {change}
              </p>
            )}
            <div aria-hidden="true" className="mt-1 h-2 rounded bg-slate-200 dark:bg-slate-800">
              <div
                className="h-2 rounded motion-safe:transition-[width] motion-safe:duration-200"
                style={{ width: `${row.percent}%`, backgroundColor: row.color }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
