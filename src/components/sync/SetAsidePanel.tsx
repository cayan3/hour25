import { useState } from 'react';
import { useSetAside } from '../../hooks/useSync';
import { useAllLabels } from '../../hooks/useLabels';
import { slotRangeLabel } from '../../lib/slotNames';
import { toFriendlyErrorMessage } from '../../lib/errorMessage';
import type { DeadWrite } from '../../lib/offline/store';

// Settings → Set-aside entries (DESIGN §7): the dead-letter view — date,
// time, label, reason — with retry-once (re-enqueue through the normal
// queue) and discard. Labels resolve against labels-all so a soft-deleted
// label still names its row.
export function SetAsidePanel({ userId }: { userId: string }) {
  const { deadRows, retry, discard } = useSetAside(userId);
  const { data: allLabels } = useAllLabels(userId);
  const [error, setError] = useState<string | null>(null);

  if (deadRows.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Nothing here. Entries that repeatedly fail to sync are set aside for review.
      </p>
    );
  }

  const labelById = new Map((allLabels ?? []).map((l) => [l.id, l]));

  function describe(row: DeadWrite): string {
    if (row.op === 'delete') return 'Clear slot';
    const label = row.labelId ? labelById.get(row.labelId) : undefined;
    if (!label) return 'Unknown label';
    return label.deleted_at !== null ? `${label.name} (deleted)` : label.name;
  }

  async function run(action: Promise<void>): Promise<void> {
    setError(null);
    try {
      await action;
    } catch (e) {
      setError(toFriendlyErrorMessage(e));
    }
  }

  return (
    <div>
      {error && (
        <p role="alert" className="mb-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <ul className="space-y-2">
        {deadRows.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 p-3 text-sm dark:border-slate-700"
          >
            <div className="min-w-0">
              <p className="font-medium">
                {row.date}, {slotRangeLabel(row.slotIndex)} — {describe(row)}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{row.reason}</p>
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => run(retry(row))}
                className="min-h-11 touch-manipulation rounded px-3 text-sm text-sky-600 focus-visible:ring-2 focus-visible:ring-offset-2 hover:bg-slate-100 dark:text-sky-400 dark:hover:bg-slate-800"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => run(discard(row))}
                className="min-h-11 touch-manipulation rounded px-3 text-sm text-slate-600 focus-visible:ring-2 focus-visible:ring-offset-2 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Discard
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
