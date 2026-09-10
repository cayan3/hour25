import { formatDuration } from '../../lib/time';
import type { DaySubsetTotals, WeekdayWeekendSplit } from '../../lib/stats';

export interface PatternLabel {
  name: string;
  color: string;
}

// Three states, and they say different things. Null: no day of that kind has
// elapsed yet — a week viewed on Wednesday has no weekend to report, and
// showing 0 there would be a claim about behaviour rather than an absence of
// data. { days: 0 }: such days elapsed and none were tracked. Otherwise: an
// average over that side's own tracked days.
function sideText(side: DaySubsetTotals | null, labelId: string, kind: 'weekday' | 'weekend'): string {
  const where = kind === 'weekday' ? 'on weekdays' : 'at weekends';
  if (side === null) return kind === 'weekday' ? 'no weekdays yet' : 'no weekend yet';
  if (side.days === 0) return kind === 'weekday' ? 'no weekdays tracked' : 'no weekend tracked';
  const total = side.byLabel.find((t) => t.labelId === labelId);
  return `${formatDuration((total?.minutes ?? 0) / side.days)}/day ${where}`;
}

export function PatternSection({
  split,
  order,
  labelById,
}: {
  split: WeekdayWeekendSplit;
  /** The period's global label order, so rows match the breakdown above. */
  order: { labelId: string }[];
  labelById: Map<string, PatternLabel>;
}) {
  const rows = order.filter(
    (row) =>
      (split.weekday?.byLabel.some((t) => t.labelId === row.labelId) ?? false) ||
      (split.weekend?.byLabel.some((t) => t.labelId === row.labelId) ?? false),
  );

  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="pattern-heading">
      <h2 id="pattern-heading" className="mb-2 text-sm font-medium">
        Weekday vs weekend
      </h2>
      <ul className="space-y-2">
        {rows.map((row) => {
          const label = labelById.get(row.labelId);
          return (
            <li
              key={row.labelId}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  style={{ backgroundColor: label?.color ?? '#94a3b8' }}
                  className="h-3 w-3 shrink-0 rounded-sm"
                />
                <span className="truncate">{label?.name ?? 'Unknown label'}</span>
              </span>
              <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
                {`${sideText(split.weekday, row.labelId, 'weekday')} · ${sideText(
                  split.weekend,
                  row.labelId,
                  'weekend',
                )}`}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
