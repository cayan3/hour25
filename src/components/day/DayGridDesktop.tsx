import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import type { MergedEntry } from '../../lib/merge';
import type { LabelRow } from '../../lib/db/labels';
import type { PickerAnchor } from '../../store/day';
import { computeRuns, clipRunsToRows, type RunSegment } from '../../lib/runs';
import { slotAccessibleName } from '../../lib/slotNames';
import { contrastText } from '../../lib/color';
import { SLOTS_PER_DAY } from '../../lib/constants';

const SLOTS_PER_ROW = 12;
const ROWS = SLOTS_PER_DAY / SLOTS_PER_ROW;
const GAP_PX = 2; // gap-0.5 — the segment overlay spans across these gaps

// DESIGN §2: four rows of twelve slots, each row six hours. Run merging is
// visual, not structural (C-41): every slot keeps its own role="gridcell"
// button and exact hit target; a contiguous same-label run renders as one
// apparent block via a pointer-events-none overlay (background + label name
// painted once per row-clipped segment) UNDER the transparent cell buttons.
// Runs clip at row boundaries — a 23:00–07:00 sleep run rendering as two
// blocks is correct, not a bug.

interface DayGridDesktopProps {
  date: string;
  merged: MergedEntry[];
  labelById: Map<string, LabelRow>;
  nowSlot: number | null; // today's current slot, else null
  hintSlot: number | null; // first empty slot, highlighted while the hint is up
  onOpenPicker: (slotIndex: number, anchor: PickerAnchor, focusNote?: boolean) => void;
  onAssignLast: (slotIndex: number) => void; // Shift+Enter (DESIGN §2)
  onClear: (slotIndex: number) => void; // Delete/Backspace (C-30)
  openSlotIndex: number | null; // which cell's picker is open — gets a visible ring
}

export function DayGridDesktop({
  date,
  merged,
  labelById,
  nowSlot,
  hintSlot,
  onOpenPicker,
  onAssignLast,
  onClear,
  openSlotIndex,
}: DayGridDesktopProps) {
  const [focusedSlot, setFocusedSlot] = useState(0);
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const wasPickerOpen = useRef(false);

  const entryBySlot = useMemo(() => new Map(merged.map((e) => [e.slotIndex, e])), [merged]);
  const segmentsByRow = useMemo(() => {
    const map = new Map<number, RunSegment[]>();
    for (const seg of clipRunsToRows(computeRuns(merged), SLOTS_PER_ROW)) {
      const row = Math.floor(seg.start / SLOTS_PER_ROW);
      map.set(row, [...(map.get(row) ?? []), seg]);
    }
    return map;
  }, [merged]);

  // Return focus to the grid when the picker closes (it stole it on open).
  const pickerOpen = openSlotIndex !== null;
  useEffect(() => {
    if (wasPickerOpen.current && !pickerOpen) cellRefs.current[focusedSlot]?.focus();
    wasPickerOpen.current = pickerOpen;
  }, [pickerOpen, focusedSlot]);

  function moveFocus(next: number): void {
    const clamped = Math.max(0, Math.min(SLOTS_PER_DAY - 1, next));
    setFocusedSlot(clamped);
    cellRefs.current[clamped]?.focus();
  }

  function openPickerAt(slotIndex: number, focusNote = false): void {
    const rect = cellRefs.current[slotIndex]?.getBoundingClientRect();
    onOpenPicker(
      slotIndex,
      {
        top: rect?.top ?? 0,
        left: rect?.left ?? 0,
        bottom: rect?.bottom ?? 0,
        width: rect?.width ?? 0,
      },
      focusNote,
    );
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    // While the picker is open it owns the keyboard — grid keys reaching here
    // (e.g. after tabbing out of the popover) moved the focus ring while the
    // open picker stayed bound to the clicked slot, which read as edits
    // landing on the wrong cell (Week 5 feedback).
    if (pickerOpen) return;
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        moveFocus(focusedSlot + 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        moveFocus(focusedSlot - 1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        moveFocus(focusedSlot + SLOTS_PER_ROW);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveFocus(focusedSlot - SLOTS_PER_ROW);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        // Shift+Enter re-applies the last-used label without opening the picker.
        if (e.key === 'Enter' && e.shiftKey) onAssignLast(focusedSlot);
        else openPickerAt(focusedSlot);
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        onClear(focusedSlot);
        break;
      case 'n':
        // Note popover (DESIGN §2): the picker with focus landing in the note
        // field. Filled slots only — a note cannot exist without an entry.
        if (entryBySlot.has(focusedSlot)) {
          e.preventDefault();
          openPickerAt(focusedSlot, true);
        }
        break;
      default:
        break;
    }
  }

  return (
    <div role="grid" aria-label={`Day grid for ${date}`} onKeyDown={handleKeyDown} className="select-none">
      {Array.from({ length: ROWS }, (_, row) => (
        <div key={row}>
          {/* Hour markers above each row at every second column. */}
          <div role="presentation" aria-hidden="true" className="mt-2 grid grid-cols-12 gap-0.5">
            {Array.from({ length: SLOTS_PER_ROW / 2 }, (_, h) => (
              <div key={h} className="col-span-2 text-[10px] leading-4 text-slate-400 dark:text-slate-500">
                {String(row * 6 + h).padStart(2, '0')}:00
              </div>
            ))}
          </div>
          <div role="row" className="relative grid grid-cols-12 gap-0.5">
            {/* Segment overlays live at ROW level, before (= painted under)
                the positioned cell buttons — inside a cell they covered the
                right wall of that cell's own focus ring, since a child paints
                over its parent's ring shadow. */}
            {(segmentsByRow.get(row) ?? []).map((seg) => (
              <SegmentOverlay
                key={seg.start}
                segment={seg}
                label={labelById.get(seg.labelId) ?? null}
              />
            ))}
            {Array.from({ length: SLOTS_PER_ROW }, (_, col) => {
              const slotIndex = row * SLOTS_PER_ROW + col;
              return (
                <SlotCell
                  key={slotIndex}
                  ref={(el) => {
                    cellRefs.current[slotIndex] = el;
                  }}
                  slotIndex={slotIndex}
                  entry={entryBySlot.get(slotIndex) ?? null}
                  label={labelFor(entryBySlot.get(slotIndex) ?? null, labelById)}
                  isNow={slotIndex === nowSlot}
                  isHint={slotIndex === hintSlot}
                  isOpen={slotIndex === openSlotIndex}
                  tabIndex={slotIndex === focusedSlot ? 0 : -1}
                  onFocus={() => setFocusedSlot(slotIndex)}
                  onClick={() => openPickerAt(slotIndex)}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function labelFor(entry: MergedEntry | null, labelById: Map<string, LabelRow>): LabelRow | null {
  return entry ? (labelById.get(entry.labelId) ?? null) : null;
}

interface SlotCellProps {
  slotIndex: number;
  entry: MergedEntry | null;
  label: LabelRow | null;
  isNow: boolean;
  isHint: boolean;
  isOpen: boolean; // this cell's picker is open
  tabIndex: number;
  onFocus: () => void;
  onClick: () => void;
}

const SlotCell = forwardRef<HTMLButtonElement, SlotCellProps>(function SlotCell(
  { slotIndex, entry, label, isNow, isHint, isOpen, tabIndex, onFocus, onClick },
  ref,
) {
  const filled = entry !== null;
  const accessibleName = slotAccessibleName(
    slotIndex,
    label ? { name: label.name, deleted: label.deleted_at !== null } : null,
    Boolean(entry?.note),
  );

  // Ring offsets are pinned to the page background per theme so rings read as
  // a single clean sky line instead of a white halo (repass feedback).
  return (
    <button
      ref={ref}
      type="button"
      role="gridcell"
      aria-label={accessibleName}
      title={
        label
          ? `${label.name}${label.deleted_at !== null ? ' (deleted)' : ''}${
              entry?.note ? ` — ${entry.note}` : ''
            }`
          : undefined
      }
      tabIndex={tabIndex}
      onFocus={onFocus}
      onClick={onClick}
      className={`relative h-10 touch-manipulation rounded ring-offset-slate-50 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-offset-2 motion-safe:transition-[background-color] motion-safe:duration-100 dark:ring-offset-slate-900 ${
        isOpen ? 'z-10 ring-2 ring-sky-500 ring-offset-1' : ''
      } ${
        filled
          ? ''
          : `border border-dashed border-slate-300 dark:border-slate-600 ${
              isHint && !isOpen ? 'ring-2 ring-sky-500 ring-offset-1' : ''
            }`
      }`}
    >
      {entry?.note && label && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-1 top-1 z-[1] h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: contrastText(label.color) }}
        />
      )}
      {isNow && (
        // The visible bar sits flush with the cell's bottom edge; the wrapper
        // is a taller invisible hover target so the "Now" tooltip is easy to
        // reach even on a filled cell.
        <span title="Now" className="absolute inset-x-0 bottom-0 z-[1] h-2">
          <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 rounded bg-sky-500" />
        </span>
      )}
    </button>
  );
});

// The visual body of a merged run segment: background + the label name painted
// once, spanning the segment's cells (and the 2px gaps between them). A row-
// level element painted under the transparent cell buttons; never intercepts
// a click — the slot element is what you click (C-41). The name shows as many
// characters as the segment's width fits (CSS truncation).
function SegmentOverlay({ segment, label }: { segment: RunSegment; label: LabelRow | null }) {
  if (!label) return null;
  const col = segment.start % SLOTS_PER_ROW;
  const len = segment.end - segment.start + 1;
  // One cell = (100% − 11 gaps) / 12 of the row; offsets step by cell + gap.
  const cellWidth = `(100% - ${(SLOTS_PER_ROW - 1) * GAP_PX}px) / ${SLOTS_PER_ROW}`;
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 flex items-center overflow-hidden rounded px-1 text-xs font-medium"
      style={{
        left: `calc(${col} * (${cellWidth} + ${GAP_PX}px))`,
        width: `calc(${len} * (${cellWidth}) + ${(len - 1) * GAP_PX}px)`,
        backgroundColor: label.color,
        color: contrastText(label.color),
      }}
    >
      {/* Strikethrough for soft-deleted labels — the mobile row and its
          tooltip already did this; the overlay path had missed it. */}
      <span className={`truncate ${label.deleted_at !== null ? 'line-through' : ''}`}>
        {label.name}
      </span>
    </span>
  );
}
