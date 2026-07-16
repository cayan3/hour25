import { useState } from 'react';
import type { LabelRow } from '../../lib/db/labels';
import { useRestoreLabel } from '../../hooks/useLabels';

interface DeletedLabelsPanelProps {
  userId: string;
  allLabels: LabelRow[];
}

// Settings → Deleted labels (DESIGN.md §6): restore keeps history; restoring
// into a live name collision inline-prompts a rename, same as C-32 elsewhere.
export function DeletedLabelsPanel({ userId, allLabels }: DeletedLabelsPanelProps) {
  const deleted = allLabels.filter((l) => l.deleted_at !== null);

  if (deleted.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">No deleted labels.</p>;
  }

  return (
    <ul className="space-y-2">
      {deleted.map((label) => (
        <DeletedLabelRow key={label.id} userId={userId} label={label} />
      ))}
    </ul>
  );
}

function DeletedLabelRow({ userId, label }: { userId: string; label: LabelRow }) {
  const restoreLabel = useRestoreLabel(userId);
  const [renamePrompt, setRenamePrompt] = useState<{ conflictName: string } | null>(null);
  const [renameValue, setRenameValue] = useState(label.name);

  async function handleRestore(renameTo?: string) {
    const result = await restoreLabel.mutateAsync({ id: label.id, renameTo });
    if (result.kind === 'active-name-collision') {
      setRenamePrompt({ conflictName: result.conflictingLabel.name });
      setRenameValue(renameTo ?? label.name);
    } else {
      setRenamePrompt(null);
    }
  }

  return (
    <li className="rounded border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-5 w-5 rounded-full opacity-50"
            style={{ backgroundColor: label.color }}
          />
          <span className="text-sm text-slate-500 line-through dark:text-slate-400">{label.name}</span>
          <span className="text-xs text-slate-400 dark:text-slate-500">deleted</span>
        </div>
        {!renamePrompt && (
          <button
            type="button"
            onClick={() => handleRestore()}
            className="rounded px-2 py-1 text-sm text-slate-900 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-offset-2 dark:text-slate-50 dark:hover:bg-slate-700"
          >
            Restore
          </button>
        )}
      </div>
      {renamePrompt && (
        <form
          className="mt-2 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            handleRestore(renameValue);
          }}
        >
          <p className="text-sm text-red-600 dark:text-red-400">
            "{renamePrompt.conflictName}" is already active — restore under a different name.
          </p>
          <input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 dark:border-slate-600 dark:bg-slate-800"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white focus-visible:ring-2 focus-visible:ring-offset-2 dark:bg-slate-50 dark:text-slate-900"
            >
              Restore
            </button>
            <button
              type="button"
              onClick={() => setRenamePrompt(null)}
              className="px-3 py-1.5 text-sm text-slate-500 focus-visible:ring-2 focus-visible:ring-offset-2 dark:text-slate-400"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </li>
  );
}
