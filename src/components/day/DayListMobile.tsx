import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import type { MergedEntry } from '../../lib/merge';
import type { LabelRow } from '../../lib/db/labels';
import { slotAccessibleName, slotTimeShort } from '../../lib/slotNames';
import { contrastText } from '../../lib/color';
import { SLOTS_PER_DAY } from '../../lib/constants';

// DESIGN §3 (revised per C-60, Week 4 live feedback): the vertical list shows
// all 48 slot rows at all times — no run collapsing. Collapsed runs shifted
// rows around as labels were applied, which read as edits landing on the
// wrong slot. A filled row is shaded in its label's color from the end of an
// uncolored time gutter to the right edge; an empty row stays transparent
// with a dashed placeholder. Every empty row directly after a filled row
// offers a one-tap "same as previous" chip carrying that previous slot's
// label (C-61 — stateless, survives reload).

interface DayListMobileProps {
  date: string;
  merged: MergedEntry[];
  labelById: Map<string, LabelRow>;
  nowSlot: number | null;
  hintSlot: number | null;
  openSlotIndex: number | null; // which row's picker is open — gets a visible ring
  onOpenPicker: (slotIndex: number) => void;
  onAssignSame: (slotIndex: number, labelId: string) => void;
  onClear: (slotIndex: number) => void; // Delete/Backspace (C-30)
}

export function DayListMobile({
  date,
  merged,
  labelById,
  nowSlot,
  hintSlot,
  openSlotIndex,
  onOpenPicker,
  onAssignSame,
  onClear,
}: DayListMobileProps) {
  const [focusedSlot, setFocusedSlot] = useState(0);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const nowRowRef = useRef<HTMLDivElement | null>(null);
  const wasPickerOpen = useRef(false);

  const entryBySlot = useMemo(() => new Map(merged.map((e) => [e.slotIndex, e])), [merged]);

  // Auto-scroll to "now" on load (DESIGN §3) — instant, not animated.
  useEffect(() => {
    nowRowRef.current?.scrollIntoView({ block: 'center' });
  }, [date]);

  // Return focus to the list when the picker closes (it stole it on open).
  const pickerOpen = openSlotIndex !== null;
  useEffect(() => {
    if (wasPickerOpen.current && !pickerOpen) rowRefs.current[focusedSlot]?.focus();
    wasPickerOpen.current = pickerOpen;
  }, [pickerOpen, focusedSlot]);

  function moveFocus(next: number): void {
    const clamped = Math.max(0, Math.min(SLOTS_PER_DAY - 1, next));
    setFocusedSlot(clamped);
    rowRefs.current[clamped]?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        moveFocus(focusedSlot + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveFocus(focusedSlot - 1);
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        onClear(focusedSlot);
        break;
      // Enter/Space activate the focused row button natively (opens the picker).
      default:
        break;
    }
  }

  return (
    <div onKeyDown={handleKeyDown}>
      {Array.from({ length: SLOTS_PER_DAY }, (_, slotIndex) => {
        const entry = entryBySlot.get(slotIndex) ?? null;
        const prevEntry = slotIndex > 0 ? (entryBySlot.get(slotIndex - 1) ?? null) : null;
        const chip = !entry && prevEntry ? (labelById.get(prevEntry.labelId) ?? null) : null;
        return (
          <SlotRow
            key={slotIndex}
            ref={(el) => {
              rowRefs.current[slotIndex] = el;
            }}
            slotIndex={slotIndex}
            entry={entry}
            label={entry ? (labelById.get(entry.labelId) ?? null) : null}
            isNow={slotIndex === nowSlot}
            isHint={slotIndex === hintSlot}
            isOpen={slotIndex === openSlotIndex}
            nowRowRef={slotIndex === nowSlot ? nowRowRef : null}
            chip={chip}
            tabIndex={slotIndex === focusedSlot ? 0 : -1}
            onFocus={() => setFocusedSlot(slotIndex)}
            onOpen={() => onOpenPicker(slotIndex)}
            onAssignSame={(labelId) => onAssignSame(slotIndex, labelId)}
          />
        );
      })}
    </div>
  );
}

function Swatch({ color }: { color: string }) {
  return <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: color }} />;
}

interface SlotRowProps {
  slotIndex: number;
  entry: MergedEntry | null;
  label: LabelRow | null;
  isNow: boolean;
  isHint: boolean;
  isOpen: boolean; // this row's picker is open
  nowRowRef: React.RefObject<HTMLDivElement> | null;
  chip: LabelRow | null; // "same as previous" label, when this row carries the chip
  tabIndex: number;
  onFocus: () => void;
  onOpen: () => void;
  onAssignSame: (labelId: string) => void;
}

const SlotRow = forwardRef<HTMLButtonElement, SlotRowProps>(function SlotRow(
  { slotIndex, entry, label, isNow, isHint, isOpen, nowRowRef, chip, tabIndex, onFocus, onOpen, onAssignSame },
  ref,
) {
  const accessibleName = slotAccessibleName(
    slotIndex,
    label ? { name: label.name, deleted: label.deleted_at !== null } : null,
    Boolean(entry?.note),
  );
  const fg = label ? contrastText(label.color) : undefined;

  // The time gutter stays uncolored so times form a clean scannable rail; the
  // label color fills the rest of the row edge-to-edge (repass feedback). The
  // chip overlays the row's right side so the row (and its focus/open ring)
  // keeps a constant width whether or not a chip is present.
  return (
    <div ref={nowRowRef} className="relative flex items-stretch">
      {isNow && (
        <span title="Now" className="absolute inset-y-0 left-0 z-[1] w-2">
          <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 rounded-r bg-sky-500" />
        </span>
      )}
      <button
        ref={ref}
        type="button"
        aria-label={accessibleName}
        title={label ? `${label.name}${label.deleted_at !== null ? ' (deleted)' : ''}` : undefined}
        tabIndex={tabIndex}
        onFocus={onFocus}
        onClick={onOpen}
        className={`flex min-h-11 w-full touch-manipulation items-stretch text-left text-sm ring-offset-slate-50 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-offset-2 motion-safe:transition-colors motion-safe:duration-100 dark:ring-offset-slate-900 ${
          isOpen ? 'z-10 ring-2 ring-inset ring-sky-500' : ''
        } ${label ? '' : 'border-b border-slate-100 dark:border-slate-800'}`}
      >
        <span
          className={`flex w-14 shrink-0 items-center pl-3 tabular-nums ${
            isNow
              ? 'font-semibold text-sky-600 dark:text-sky-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {slotTimeShort(slotIndex)}
        </span>
        {entry ? (
          <span
            className="my-0.5 flex min-w-0 flex-1 items-center justify-end gap-2 rounded-l px-3"
            style={label ? { backgroundColor: label.color, color: fg } : undefined}
          >
            {entry.note && fg && (
              <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: fg }} />
            )}
            <span className={`truncate font-medium ${label?.deleted_at ? 'line-through' : ''}`}>
              {label?.name ?? 'Unknown label'}
            </span>
          </span>
        ) : (
          <span className={`flex flex-1 items-center py-1.5 ${chip ? 'mr-36' : 'mr-3'}`}>
            <span
              className={`h-5 w-full rounded border border-dashed border-slate-300 dark:border-slate-600 ${
                isHint && !isOpen ? 'ring-2 ring-sky-500' : ''
              }`}
            />
          </span>
        )}
      </button>
      {!entry && chip && (
        <button
          type="button"
          onClick={() => onAssignSame(chip.id)}
          className="absolute inset-y-0 right-2 z-[1] flex touch-manipulation items-center gap-1.5 rounded-full border border-slate-300 bg-slate-50 px-3 text-xs text-slate-600 focus-visible:ring-2 focus-visible:ring-offset-2 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
        >
          <Swatch color={chip.color} />
          Same as previous
        </button>
      )}
    </div>
  );
});
