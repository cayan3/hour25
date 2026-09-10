import { SLOTS_PER_DAY } from '../../lib/constants';
import { computeRuns } from '../../lib/runs';
import { slotTimeShort } from '../../lib/slotNames';
import type { MergedEntry } from '../../lib/merge';

export interface DayStripLabel {
  name: string;
  color: string;
}

// The day's shape, beside its numbers. Deliberately not the Today grid: that
// one edits (role="gridcell", arrow-key navigation, DESIGN §2), this one only
// shows, so it takes no interactive-grid semantics and no cell focus.
export function DayStrip({
  entries,
  expectedSlots,
  labelById,
  highlightedId,
  onHighlight,
}: {
  entries: MergedEntry[];
  expectedSlots: number;
  labelById: Map<string, DayStripLabel>;
  highlightedId: string | null;
  onHighlight: (id: string | null) => void;
}) {
  const labelBySlot = new Map(entries.map((e) => [e.slotIndex, e.labelId]));

  // computeRuns collapses contiguous same-label slots and is already used by
  // both day views; it requires input sorted by slotIndex, which the overlay
  // guarantees (mergePending sorts). No second run-collapsing loop.
  const summary = computeRuns(entries)
    .map(
      (run) =>
        `${slotTimeShort(run.start)}–${slotTimeShort(run.end + 1)} ${
          labelById.get(run.labelId)?.name ?? 'Unknown label'
        }`,
    )
    .join(', ');

  return (
    <section>
      <h2 className="mb-2 text-sm font-medium">Across the day</h2>
      <div
        aria-hidden="true"
        data-testid="day-strip"
        className="flex gap-px overflow-hidden rounded"
      >
        {Array.from({ length: SLOTS_PER_DAY }, (_, index) => {
          const labelId = labelBySlot.get(index);
          // Three states, not two: without a distinct "not yet elapsed" the
          // rest of today reads as a wall of untracked time.
          const state = labelId !== undefined ? 'logged' : index >= expectedSlots ? 'future' : 'empty';
          const dimmed = highlightedId !== null && labelId !== highlightedId;

          return (
            <span
              key={index}
              data-slot={index}
              data-state={state}
              data-highlighted={labelId !== undefined && labelId === highlightedId}
              onMouseEnter={() => onHighlight(labelId ?? null)}
              onMouseLeave={() => onHighlight(null)}
              style={
                state === 'logged'
                  ? { backgroundColor: labelById.get(labelId!)?.color ?? '#94a3b8' }
                  : undefined
              }
              className={`h-8 flex-1 motion-safe:transition-opacity motion-safe:duration-150 ${
                state === 'empty'
                  ? 'bg-slate-200 dark:bg-slate-800'
                  : state === 'future'
                    ? 'bg-slate-100 dark:bg-slate-900'
                    : ''
              } ${dimmed ? 'opacity-30' : ''}`}
            />
          );
        })}
      </div>
      {/* The squares are decorative, so this is the only route by which the
          day's shape reaches a screen reader. One line of runs beats 48
          individual names duplicating the Today grid without its navigation. */}
      <p data-testid="day-strip-summary" className="sr-only">
        {summary === '' ? 'Nothing logged today.' : summary}
      </p>
    </section>
  );
}
