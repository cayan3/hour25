import { useEffect, useMemo, useRef, useState } from 'react';
import type { MergedEntry } from '../../lib/merge';
import type { LabelRow } from '../../lib/db/labels';
import { computeRuns, type LabelRun } from '../../lib/runs';
import { slotAccessibleName, slotTimeShort } from '../../lib/slotNames';
import { SLOTS_PER_DAY } from '../../lib/constants';

// DESIGN §3: the canonical mobile logging surface. 48 logical rows; contiguous
// same-label runs collapse to one row (time range + aggregate note-dot count).
// Tapping a collapsed run expands it in place into its constituent slot rows
// (C-41); tapping an individual slot row opens the picker. Runs re-collapse on
// navigation or after an edit.

interface DayListMobileProps {
  date: string;
  merged: MergedEntry[];
  labelById: Map<string, LabelRow>;
  nowSlot: number | null;
  hintSlot: number | null;
  lastAssign: { slotIndex: number; labelId: string } | null;
  onOpenPicker: (slotIndex: number) => void;
  onAssignSame: (slotIndex: number, labelId: string) => void;
}

export function DayListMobile({
  date,
  merged,
  labelById,
  nowSlot,
  hintSlot,
  lastAssign,
  onOpenPicker,
  onAssignSame,
}: DayListMobileProps) {
  const [expandedRuns, setExpandedRuns] = useState<ReadonlySet<number>>(new Set());
  const nowRowRef = useRef<HTMLDivElement>(null);

  const entryBySlot = useMemo(() => new Map(merged.map((e) => [e.slotIndex, e])), [merged]);
  const runByStart = useMemo(() => {
    const map = new Map<number, LabelRun>();
    for (const run of computeRuns(merged)) map.set(run.start, run);
    return map;
  }, [merged]);

  // Re-collapse on navigation or after an edit — keyed on the day's content,
  // not array identity, so a refetch that changes nothing doesn't collapse an
  // expansion in progress.
  const contentSignature = useMemo(
    () => merged.map((e) => `${e.slotIndex}:${e.labelId}:${e.note ? 1 : 0}`).join('|'),
    [merged],
  );
  useEffect(() => {
    setExpandedRuns(new Set());
  }, [date, contentSignature]);

  // Auto-scroll to "now" on load (DESIGN §3) — instant, not animated.
  useEffect(() => {
    nowRowRef.current?.scrollIntoView({ block: 'center' });
  }, [date]);

  // After assigning, a one-tap "same as previous" chip appears on the next
  // empty row.
  const chipSlot = useMemo(() => {
    if (!lastAssign) return null;
    for (let i = lastAssign.slotIndex + 1; i < SLOTS_PER_DAY; i++) {
      if (!entryBySlot.has(i)) return i;
    }
    return null;
  }, [lastAssign, entryBySlot]);
  const chipLabel = lastAssign ? (labelById.get(lastAssign.labelId) ?? null) : null;

  const rows: React.ReactNode[] = [];
  for (let slotIndex = 0; slotIndex < SLOTS_PER_DAY; ) {
    const run = runByStart.get(slotIndex);
    if (run && run.end > run.start && !expandedRuns.has(run.start)) {
      rows.push(
        <CollapsedRunRow
          key={`run-${run.start}`}
          run={run}
          label={labelById.get(run.labelId) ?? null}
          noteCount={countNotes(run, entryBySlot)}
          isNow={nowSlot !== null && nowSlot >= run.start && nowSlot <= run.end}
          nowRowRef={nowSlot !== null && nowSlot >= run.start && nowSlot <= run.end ? nowRowRef : null}
          onExpand={() => setExpandedRuns((prev) => new Set(prev).add(run.start))}
        />,
      );
      slotIndex = run.end + 1;
      continue;
    }
    rows.push(
      <SlotRow
        key={slotIndex}
        slotIndex={slotIndex}
        entry={entryBySlot.get(slotIndex) ?? null}
        label={entryBySlot.has(slotIndex) ? (labelById.get(entryBySlot.get(slotIndex)!.labelId) ?? null) : null}
        isNow={slotIndex === nowSlot}
        isHint={slotIndex === hintSlot}
        nowRowRef={slotIndex === nowSlot ? nowRowRef : null}
        chip={slotIndex === chipSlot && chipLabel ? chipLabel : null}
        onOpen={() => onOpenPicker(slotIndex)}
        onAssignSame={(labelId) => onAssignSame(slotIndex, labelId)}
      />,
    );
    slotIndex += 1;
  }

  return <div>{rows}</div>;
}

function countNotes(run: LabelRun, entryBySlot: Map<number, MergedEntry>): number {
  let count = 0;
  for (let i = run.start; i <= run.end; i++) if (entryBySlot.get(i)?.note) count += 1;
  return count;
}

function NoteDot({ color }: { color: string }) {
  return <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />;
}

function Swatch({ color }: { color: string }) {
  return <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: color }} />;
}

const rowBase =
  'flex min-h-11 w-full touch-manipulation items-center gap-3 border-b border-slate-100 px-3 py-1.5 text-left text-sm focus-visible:ring-2 focus-visible:ring-offset-2 dark:border-slate-800';

interface CollapsedRunRowProps {
  run: LabelRun;
  label: LabelRow | null;
  noteCount: number;
  isNow: boolean;
  nowRowRef: React.RefObject<HTMLDivElement> | null;
  onExpand: () => void;
}

function CollapsedRunRow({ run, label, noteCount, isNow, nowRowRef, onExpand }: CollapsedRunRowProps) {
  const range = `${slotTimeShort(run.start)} to ${slotTimeShort(run.end + 1)}`;
  const slots = run.end - run.start + 1;
  const name = label?.name ?? 'Unknown label';
  const deleted = label?.deleted_at != null;
  return (
    <div ref={nowRowRef} className={isNow ? 'border-l-2 border-sky-500' : ''}>
      <button
        type="button"
        aria-expanded={false}
        aria-label={`${range}, ${name}${deleted ? ', deleted label' : ''}, ${slots} slots${
          noteCount ? `, ${noteCount} ${noteCount === 1 ? 'note' : 'notes'}` : ''
        }. Expand to edit individual slots`}
        onClick={onExpand}
        className={rowBase}
      >
        <span className="w-24 shrink-0 tabular-nums text-slate-500 dark:text-slate-400">{range}</span>
        <span className="flex min-w-0 flex-1 items-center justify-end gap-2">
          {noteCount > 0 && label && (
            <span className="flex items-center gap-1">
              {Array.from({ length: Math.min(noteCount, 3) }, (_, i) => (
                <NoteDot key={i} color={label.color} />
              ))}
              {noteCount > 3 && <span className="text-xs text-slate-400">+{noteCount - 3}</span>}
            </span>
          )}
          <span className={`truncate ${deleted ? 'line-through' : ''}`}>{name}</span>
          {label && <Swatch color={label.color} />}
        </span>
      </button>
    </div>
  );
}

interface SlotRowProps {
  slotIndex: number;
  entry: MergedEntry | null;
  label: LabelRow | null;
  isNow: boolean;
  isHint: boolean;
  nowRowRef: React.RefObject<HTMLDivElement> | null;
  chip: LabelRow | null; // "same as previous" target label, when this row carries the chip
  onOpen: () => void;
  onAssignSame: (labelId: string) => void;
}

function SlotRow({ slotIndex, entry, label, isNow, isHint, nowRowRef, chip, onOpen, onAssignSame }: SlotRowProps) {
  const accessibleName = slotAccessibleName(
    slotIndex,
    label ? { name: label.name, deleted: label.deleted_at !== null } : null,
    Boolean(entry?.note),
  );
  return (
    <div ref={nowRowRef} className={`flex items-center ${isNow ? 'border-l-2 border-sky-500' : ''}`}>
      <button type="button" aria-label={accessibleName} onClick={onOpen} className={`${rowBase} min-w-0 flex-1`}>
        <span className="w-24 shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
          {slotTimeShort(slotIndex)}
        </span>
        {entry ? (
          <span className="flex min-w-0 flex-1 items-center justify-end gap-2">
            {entry.note && label && <NoteDot color={label.color} />}
            <span className={`truncate ${label?.deleted_at ? 'line-through' : ''}`}>
              {label?.name ?? 'Unknown label'}
            </span>
            {label && <Swatch color={label.color} />}
          </span>
        ) : (
          <span
            className={`h-5 flex-1 rounded border border-dashed border-slate-300 dark:border-slate-600 ${
              isHint ? 'ring-2 ring-sky-500' : ''
            }`}
          />
        )}
      </button>
      {!entry && chip && (
        <button
          type="button"
          onClick={() => onAssignSame(chip.id)}
          className="mr-2 flex min-h-11 shrink-0 touch-manipulation items-center gap-1.5 rounded-full border border-slate-300 px-3 text-xs text-slate-600 focus-visible:ring-2 focus-visible:ring-offset-2 dark:border-slate-600 dark:text-slate-300"
        >
          <Swatch color={chip.color} />
          Same as previous
        </button>
      )}
    </div>
  );
}
