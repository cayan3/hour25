import { useState } from 'react';

const HINT_KEY_PREFIX = 'first-slot-hint-dismissed:';

// Placeholder for the Week 4 day grid. Carries the one-time dismissible
// "tap a slot" hint (DESIGN.md §5) so it survives once the real grid lands —
// only the target changes from this banner to the first empty gridcell.
export function TodayPlaceholder({ userId }: { userId: string }) {
  const storageKey = `${HINT_KEY_PREFIX}${userId}`;
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(storageKey) === '1');

  function dismiss() {
    localStorage.setItem(storageKey, '1');
    setDismissed(true);
  }

  return (
    <div className="mx-auto max-w-2xl p-4">
      {!dismissed && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          <p>Tap a slot to log your first half hour.</p>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss hint"
            className="rounded px-1 text-slate-400 focus-visible:ring-2 focus-visible:ring-offset-2 hover:text-slate-600 dark:hover:text-slate-200"
          >
            ✕
          </button>
        </div>
      )}
      <div className="rounded-lg border border-dashed border-slate-300 p-10 text-center text-sm text-slate-400 dark:border-slate-600">
        Today's grid is coming in Week 4.
      </div>
    </div>
  );
}
