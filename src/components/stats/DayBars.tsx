import { CHUNK_MINUTES, SLOTS_PER_DAY } from '../../lib/constants';
import { formatDuration, parseLocalDate } from '../../lib/time';
import type { DayExtremes, DayTotal } from '../../lib/stats';

export interface DayBarsLabel {
  name: string;
  color: string;
}

// Composed rather than asked of Intl: {weekday, day} with no month renders as
// "13 Mon" in en-US, which reads as a garbled date.
function shortDay(date: string): string {
  const d = parseLocalDate(date);
  return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${d.getDate()}`;
}

function longDay(date: string): string {
  return parseLocalDate(date).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function DayBarRow({
  day,
  order,
  labelById,
}: {
  day: DayTotal;
  /** The period's global label order — never the day's own. */
  order: { labelId: string }[];
  labelById: Map<string, DayBarsLabel>;
}) {
  const segments: { labelId: string; width: number; left: number; slots: number }[] = [];
  let left = 0;
  for (const total of order) {
    const slots = day.slotsByLabel.get(total.labelId) ?? 0;
    if (slots === 0) continue;
    const width = (slots / SLOTS_PER_DAY) * 100;
    segments.push({ labelId: total.labelId, width, left, slots });
    left += width;
  }

  const composition = segments
    .map(
      (s) =>
        `${labelById.get(s.labelId)?.name ?? 'Unknown label'} ${formatDuration(
          s.slots * CHUNK_MINUTES,
        )}`,
    )
    .join(', ');

  return (
    <li className="flex items-center gap-3">
      <span className="w-14 shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400">
        {shortDay(day.date)}
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
          style={{ width: `${(day.expectedSlots / SLOTS_PER_DAY) * 100}%` }}
        />
        {segments.map((s) => (
          <span
            key={s.labelId}
            className="absolute inset-y-0"
            style={{
              left: `${s.left}%`,
              width: `${s.width}%`,
              backgroundColor: labelById.get(s.labelId)?.color ?? '#94a3b8',
            }}
          />
        ))}
      </span>
      <span className="w-16 shrink-0 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">
        {day.expectedSlots === 0 ? '' : formatDuration(day.filledSlots * CHUNK_MINUTES)}
      </span>
      {/* The stack is a gestalt and is aria-hidden, so this is the only route
          by which a day's composition reaches a screen reader. */}
      <span className="sr-only">
        {`${longDay(day.date)}: ${
          composition === '' ? 'nothing logged' : `${composition}`
        }`}
      </span>
    </li>
  );
}

export function DayBars({
  byDate,
  order,
  labelById,
  extremes,
}: {
  byDate: DayTotal[];
  order: { labelId: string }[];
  labelById: Map<string, DayBarsLabel>;
  extremes: DayExtremes;
}) {
  const { peak, lowest } = extremes;
  const extremeText =
    peak === null || lowest === null
      ? null
      : // The two coincide when one day was tracked *or* when every tracked day
        // came out equal, and the clause cannot tell those apart — so it states
        // the day it knows about and claims nothing about how many there were.
        peak.date === lowest.date
        ? `best ${shortDay(peak.date)}, ${formatDuration(peak.wakingMinutes)}`
        : `best ${shortDay(peak.date)}, ${formatDuration(peak.wakingMinutes)} · quietest ${shortDay(
            lowest.date,
          )}, ${formatDuration(lowest.wakingMinutes)}`;

  return (
    <section>
      <h2 className="mb-2 text-sm font-medium">By day</h2>
      <ul className="space-y-1.5">
        {byDate.map((day) => (
          <DayBarRow key={day.date} day={day} order={order} labelById={labelById} />
        ))}
      </ul>
      {extremeText && (
        <p className="mt-2 text-xs tabular-nums text-slate-500 dark:text-slate-400">
          {extremeText}
        </p>
      )}
    </section>
  );
}
