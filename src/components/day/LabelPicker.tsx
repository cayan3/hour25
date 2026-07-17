import { useEffect, useMemo, useRef, useState } from 'react';
import type { LabelRow } from '../../lib/db/labels';
import type { CategoryRow } from '../../lib/db/categories';
import type { PickerAnchor } from '../../store/day';
import { slotRangeLabel } from '../../lib/slotNames';
import { loadMru, MRU_DISPLAY_LIMIT } from '../../lib/mru';

// One combobox component, rendered as an anchored popover (desktop) or a
// bottom sheet (mobile) — DESIGN §4. Structure: search input → Recent (≤9,
// number keys) → divider → full active list alphabetical grouped by category
// → Clear slot pinned last (only when the slot has an entry).
//
// TODO (Week 5, notes): the note textarea lives below this list — saved with
// the label choice or as an update to the slot's existing entry. Not built
// yet; nothing can write notes until then.

interface LabelPickerProps {
  userId: string;
  slotIndex: number;
  hasEntry: boolean;
  mode: 'popover' | 'sheet';
  anchor: PickerAnchor | null;
  labels: LabelRow[]; // active only — soft-deleted labels never appear here
  categories: CategoryRow[];
  onSelect: (labelId: string) => void;
  onClear: () => void;
  onClose: () => void;
}

type PickerOption =
  | { kind: 'label'; label: LabelRow; shortcut: number | null }
  | { kind: 'clear' };

interface OptionGroup {
  heading: string | null;
  options: PickerOption[];
}

const POPOVER_WIDTH = 320;
const POPOVER_MAX_HEIGHT = 384; // matches max-h-96

export function LabelPicker({
  userId,
  slotIndex,
  hasEntry,
  mode,
  anchor,
  labels,
  categories,
  onSelect,
  onClear,
  onClose,
}: LabelPickerProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // C-42: the Recent list is snapshotted when the picker opens (empty deps =
  // once per mount; the picker mounts fresh on every open). It never reorders
  // while open, so number keys don't shift under your fingers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const recents = useMemo(() => {
    const byId = new Map(labels.map((l) => [l.id, l]));
    return loadMru(userId)
      .map((id) => byId.get(id))
      .filter((l): l is LabelRow => l !== undefined)
      .slice(0, MRU_DISPLAY_LIMIT);
  }, []);

  const groups = useMemo<OptionGroup[]>(() => {
    const trimmed = query.trim().toLowerCase();
    const result: OptionGroup[] = [];

    if (trimmed) {
      // Type-to-filter: one flat list of matches; Enter selects the top one.
      const matches = labels.filter((l) => l.name.toLowerCase().includes(trimmed));
      result.push({
        heading: null,
        options: matches.map((label) => ({ kind: 'label' as const, label, shortcut: null })),
      });
    } else {
      if (recents.length) {
        result.push({
          heading: 'Recent',
          options: recents.map((label, i) => ({ kind: 'label' as const, label, shortcut: i + 1 })),
        });
      }
      // Full active list, alphabetical (already sorted by the db helper),
      // grouped by category; uncategorized labels last.
      const sortedCategories = [...categories].sort((a, b) => a.name.localeCompare(b.name));
      for (const category of sortedCategories) {
        const inCategory = labels.filter((l) => l.category_id === category.id);
        if (inCategory.length) {
          result.push({
            heading: category.name,
            options: inCategory.map((label) => ({ kind: 'label' as const, label, shortcut: null })),
          });
        }
      }
      const uncategorized = labels.filter(
        (l) => !l.category_id || !categories.some((c) => c.id === l.category_id),
      );
      if (uncategorized.length) {
        result.push({
          heading: categories.length ? 'No category' : null,
          options: uncategorized.map((label) => ({ kind: 'label' as const, label, shortcut: null })),
        });
      }
    }

    if (hasEntry) {
      result.push({ heading: null, options: [{ kind: 'clear' }] });
    }
    return result;
  }, [query, labels, categories, recents, hasEntry]);

  const flatOptions = useMemo(() => groups.flatMap((g) => g.options), [groups]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keep the active option scrolled into view during arrow navigation.
  useEffect(() => {
    listRef.current
      ?.querySelector(`#${optionId(slotIndex, activeIndex)}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, slotIndex]);

  function choose(option: PickerOption | undefined): void {
    if (!option) return;
    if (option.kind === 'clear') onClear();
    else onSelect(option.label.id);
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!flatOptions.length) return;
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((i) => (i + delta + flatOptions.length) % flatOptions.length);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      choose(flatOptions[activeIndex]);
      return;
    }
    // Delete clears the slot while the search is empty — matches the grid's
    // Delete-to-clear so the key works whether or not the picker is open.
    // (Backspace stays a text-editing key; an accidental clear from emptying
    // the search box would be too surprising.)
    if (e.key === 'Delete' && query === '' && hasEntry) {
      e.preventDefault();
      onClear();
      return;
    }
    // Number keys 1–9 select the corresponding Recent label — only while the
    // search is empty (digits are ordinary characters once you're filtering).
    if (query === '' && /^[1-9]$/.test(e.key)) {
      const recent = recents[Number(e.key) - 1];
      if (recent) {
        e.preventDefault();
        onSelect(recent.id);
      }
    }
  }

  const listboxId = `slot-picker-listbox-${slotIndex}`;

  const popoverStyle = useMemo<React.CSSProperties>(() => {
    if (mode !== 'popover' || !anchor) return {};
    const left = Math.max(8, Math.min(anchor.left, window.innerWidth - POPOVER_WIDTH - 8));
    // Flip above the cell when there isn't room below it.
    if (anchor.bottom + POPOVER_MAX_HEIGHT + 8 > window.innerHeight && anchor.top > POPOVER_MAX_HEIGHT) {
      return { left, bottom: window.innerHeight - anchor.top + 4, width: POPOVER_WIDTH };
    }
    return { left, top: anchor.bottom + 4, width: POPOVER_WIDTH };
  }, [mode, anchor]);

  let optionIndex = -1;

  return (
    <>
      <div
        className={`fixed inset-0 z-40 ${mode === 'sheet' ? 'bg-black/40' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-label={`Label for ${slotRangeLabel(slotIndex)}`}
        style={popoverStyle}
        className={
          mode === 'sheet'
            ? 'fixed inset-x-0 bottom-0 z-50 flex max-h-[70vh] flex-col rounded-t-xl bg-white p-3 shadow-xl motion-safe:animate-sheet-in dark:bg-slate-800'
            : 'fixed z-50 flex max-h-96 flex-col rounded-lg border border-slate-200 bg-white p-2 shadow-xl motion-safe:animate-picker-in dark:border-slate-700 dark:bg-slate-800'
        }
        onKeyDown={handleKeyDown}
      >
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={listboxId}
          aria-activedescendant={flatOptions.length ? optionId(slotIndex, activeIndex) : undefined}
          aria-autocomplete="list"
          aria-label="Search labels"
          placeholder="Search labels…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mb-2 min-h-11 rounded border border-slate-300 px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 dark:border-slate-600 dark:bg-slate-900"
        />
        <ul id={listboxId} ref={listRef} role="listbox" className="overflow-y-auto overscroll-contain">
          {flatOptions.length === 0 && (
            <li role="presentation" className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
              {labels.length === 0 ? 'No labels yet — create some in Settings.' : 'No matches.'}
            </li>
          )}
          {groups.map((group, gi) => (
            <li role="presentation" key={gi}>
              {group.heading && (
                <div className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {group.heading}
                </div>
              )}
              {gi > 0 && !group.heading && (
                <div role="presentation" className="my-1 border-t border-slate-200 dark:border-slate-700" />
              )}
              <ul role="presentation">
                {group.options.map((option) => {
                  optionIndex += 1;
                  const index = optionIndex;
                  const active = index === activeIndex;
                  const base = `flex min-h-11 w-full cursor-pointer touch-manipulation items-center gap-2 rounded px-3 py-2 text-left text-sm ${
                    active ? 'bg-slate-100 dark:bg-slate-700' : ''
                  }`;
                  if (option.kind === 'clear') {
                    return (
                      <li
                        key="clear"
                        id={optionId(slotIndex, index)}
                        role="option"
                        aria-selected={active}
                        className={`${base} border-t border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300`}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={onClear}
                      >
                        Clear slot
                      </li>
                    );
                  }
                  return (
                    <li
                      key={option.label.id}
                      id={optionId(slotIndex, index)}
                      role="option"
                      aria-selected={active}
                      className={base}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => onSelect(option.label.id)}
                    >
                      <span
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0 rounded-full"
                        style={{ backgroundColor: option.label.color }}
                      />
                      <span className="min-w-0 flex-1 truncate">{option.label.name}</span>
                      {option.shortcut !== null && (
                        <span aria-hidden="true" className="text-xs text-slate-400 dark:text-slate-500">
                          {option.shortcut}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function optionId(slotIndex: number, index: number): string {
  return `slot-picker-${slotIndex}-opt-${index}`;
}
