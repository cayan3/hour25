import { useEffect, useMemo, useState } from 'react';
import { useDayEntries } from '../../hooks/useDayEntries';
import { useActiveLabels, useAllLabels } from '../../hooks/useLabels';
import { useCategories } from '../../hooks/useCategories';
import { useSlotActions } from '../../hooks/useSlotActions';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import { useDayStore } from '../../store/day';
import { localDateString, parseLocalDate } from '../../lib/time';
import { CHUNK_MINUTES, SLOTS_PER_DAY } from '../../lib/constants';
import { loadMru } from '../../lib/mru';
import { DayGridDesktop } from './DayGridDesktop';
import { DayListMobile } from './DayListMobile';
import { LabelPicker } from './LabelPicker';
import { UndoSnackbar } from './UndoSnackbar';

const HINT_KEY_PREFIX = 'first-slot-hint-dismissed:';

function addDays(date: string, delta: number): string {
  const d = parseLocalDate(date);
  d.setDate(d.getDate() + delta);
  return localDateString(d);
}

// Ticks every 30s so the now marker tracks the clock while the app sits open.
function useNowSlot(date: string): number | null {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  if (date !== localDateString(now)) return null;
  return Math.floor((now.getHours() * 60 + now.getMinutes()) / CHUNK_MINUTES);
}

// Phase 1 day page: single day + prev/next/today navigation (DESIGN §2);
// week strip and month heatmap are Phase 2 read surfaces.
export function DayView({ userId }: { userId: string }) {
  const isDesktop = useIsDesktop();
  const activeDate = useDayStore((s) => s.activeDate);
  const setActiveDate = useDayStore((s) => s.setActiveDate);
  const openPicker = useDayStore((s) => s.openPicker);
  const showPicker = useDayStore((s) => s.showPicker);
  const closePicker = useDayStore((s) => s.closePicker);
  const writeError = useDayStore((s) => s.writeError);
  const setWriteError = useDayStore((s) => s.setWriteError);

  const merged = useDayEntries(userId, activeDate);
  const { data: activeLabels } = useActiveLabels(userId);
  const { data: allLabels } = useAllLabels(userId);
  const { data: categories } = useCategories(userId);

  const labelById = useMemo(() => new Map((allLabels ?? []).map((l) => [l.id, l])), [allLabels]);
  const labelNameById = useMemo(
    () => (labelId: string) => labelById.get(labelId)?.name ?? 'label',
    [labelById],
  );
  const { assign, clear } = useSlotActions(userId, activeDate, merged, labelNameById);

  const nowSlot = useNowSlot(activeDate);
  const today = localDateString();
  const isToday = activeDate === today;

  // One-time dismissible hint (DESIGN §5 step 3): banner + a highlight on the
  // first empty slot. Deliberately permanent per user once dismissed — and the
  // first successful log dismisses it too, since it has done its job then.
  const hintKey = `${HINT_KEY_PREFIX}${userId}`;
  const [hintDismissed, setHintDismissed] = useState(() => localStorage.getItem(hintKey) === '1');
  function dismissHint(): void {
    if (!hintDismissed) {
      localStorage.setItem(hintKey, '1');
      setHintDismissed(true);
    }
  }

  const entryBySlot = useMemo(() => new Set(merged.map((e) => e.slotIndex)), [merged]);
  const firstEmptySlot = useMemo(() => {
    for (let i = 0; i < SLOTS_PER_DAY; i++) if (!entryBySlot.has(i)) return i;
    return null;
  }, [entryBySlot]);
  const hintSlot = !hintDismissed && isToday ? firstEmptySlot : null;

  function assignAndClose(slotIndex: number, labelId: string): void {
    assign(slotIndex, labelId);
    dismissHint();
    closePicker();
  }

  // Shift+Enter re-applies the last-used label without opening the picker —
  // the MRU head, skipping ids that are no longer active labels.
  function assignLastUsed(slotIndex: number): void {
    const activeIds = new Set((activeLabels ?? []).map((l) => l.id));
    const lastUsed = loadMru(userId).find((id) => activeIds.has(id));
    if (lastUsed) {
      assign(slotIndex, lastUsed);
      dismissHint();
    }
  }

  function clearSlot(slotIndex: number): void {
    clear(slotIndex);
    closePicker();
  }

  const pickerEntry = openPicker ? (merged.find((e) => e.slotIndex === openPicker.slotIndex) ?? null) : null;

  const dateHeading = parseLocalDate(activeDate).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="mx-auto max-w-3xl md:p-4">
      {/* Sticky mini-header on mobile (DESIGN §3): date nav; Fill sleep joins
          it in Week 5. */}
      <div className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900 md:static md:border-0 md:px-0">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveDate(addDays(activeDate, -1))}
            aria-label="Previous day"
            className="min-h-11 min-w-11 touch-manipulation rounded px-2 text-lg focus-visible:ring-2 focus-visible:ring-offset-2 hover:bg-slate-200 dark:hover:bg-slate-800"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setActiveDate(addDays(activeDate, 1))}
            aria-label="Next day"
            className="min-h-11 min-w-11 touch-manipulation rounded px-2 text-lg focus-visible:ring-2 focus-visible:ring-offset-2 hover:bg-slate-200 dark:hover:bg-slate-800"
          >
            ›
          </button>
          <h1 className="ml-1 text-sm font-medium">
            {dateHeading}
            {isToday && <span className="ml-1.5 text-xs text-slate-500 dark:text-slate-400">Today</span>}
          </h1>
        </div>
        {!isToday && (
          <button
            type="button"
            onClick={() => setActiveDate(today)}
            className="min-h-11 touch-manipulation rounded px-3 text-sm text-sky-600 focus-visible:ring-2 focus-visible:ring-offset-2 dark:text-sky-400"
          >
            Today
          </button>
        )}
        {/* TODO (Week 5): Fill sleep button lives here — disabled with an
            inline hint when sleep_label_id is unset/soft-deleted. */}
      </div>

      {writeError && (
        <div
          role="alert"
          className="mx-3 mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300 md:mx-0"
        >
          <div className="flex items-start justify-between gap-3">
            <p>
              That change could not be saved — the browser refused the local write, so it was lost.
              Refresh the page and try again.
            </p>
            <button
              type="button"
              onClick={() => setWriteError(null)}
              aria-label="Dismiss error"
              className="rounded px-1 focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              ✕
            </button>
          </div>
          <p className="mt-1 break-all text-xs opacity-80">{writeError}</p>
        </div>
      )}

      {hintSlot !== null && (
        <div className="mx-3 mt-3 flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 md:mx-0">
          <p>Tap a slot to log your first half hour.</p>
          <button
            type="button"
            onClick={dismissHint}
            aria-label="Dismiss hint"
            className="rounded px-1 text-slate-400 focus-visible:ring-2 focus-visible:ring-offset-2 hover:text-slate-600 dark:hover:text-slate-200"
          >
            ✕
          </button>
        </div>
      )}

      <div className={isDesktop ? 'mt-2' : 'mt-1'}>
        {isDesktop ? (
          <DayGridDesktop
            date={activeDate}
            merged={merged}
            labelById={labelById}
            nowSlot={nowSlot}
            hintSlot={hintSlot}
            onOpenPicker={(slotIndex, anchor) => showPicker(slotIndex, anchor)}
            onAssignLast={assignLastUsed}
            onClear={clearSlot}
            openSlotIndex={openPicker?.slotIndex ?? null}
          />
        ) : (
          <DayListMobile
            date={activeDate}
            merged={merged}
            labelById={labelById}
            nowSlot={nowSlot}
            hintSlot={hintSlot}
            openSlotIndex={openPicker?.slotIndex ?? null}
            onOpenPicker={(slotIndex) => showPicker(slotIndex)}
            onAssignSame={(slotIndex, labelId) => {
              assign(slotIndex, labelId);
              dismissHint();
            }}
            onClear={clearSlot}
          />
        )}
      </div>

      <p className="mt-3 px-3 text-xs text-slate-400 dark:text-slate-500 md:px-0">
        Empty slots count as untracked time.
      </p>

      {openPicker && (
        <LabelPicker
          userId={userId}
          slotIndex={openPicker.slotIndex}
          hasEntry={pickerEntry !== null}
          mode={isDesktop ? 'popover' : 'sheet'}
          anchor={openPicker.anchor}
          labels={activeLabels ?? []}
          categories={categories ?? []}
          onSelect={(labelId) => assignAndClose(openPicker.slotIndex, labelId)}
          onClear={() => clearSlot(openPicker.slotIndex)}
          onClose={closePicker}
        />
      )}

      <UndoSnackbar userId={userId} />
    </div>
  );
}
