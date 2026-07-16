import { useState } from 'react';
import type { LabelRow } from '../../lib/db/labels';
import { nameSchema } from '../../lib/schemas';

interface RestoreOutcome {
  kind: 'restored' | 'active-name-collision';
  conflictingLabel?: LabelRow;
}

interface RestoreOrCreateDialogProps {
  deletedLabel: LabelRow;
  onRestore: (renameTo?: string) => Promise<RestoreOutcome | undefined>;
  onCreateDistinct: (newName: string) => Promise<boolean>;
  onCancel: () => void;
}

// C-32: creating a name that matches a soft-deleted label offers Restore
// (keeps history) or Create new (requires a distinct name); restoring into
// a live name collision forces a rename in the same dialog (DESIGN.md §6).
export function RestoreOrCreateDialog({
  deletedLabel,
  onRestore,
  onCreateDistinct,
  onCancel,
}: RestoreOrCreateDialogProps) {
  const [mode, setMode] = useState<'choice' | 'rename-restore' | 'create-new'>('choice');
  const [renameValue, setRenameValue] = useState(deletedLabel.name);
  const [newNameValue, setNewNameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  async function handleRestore(renameTo?: string) {
    if (renameTo !== undefined) {
      const parsed = nameSchema.safeParse(renameTo);
      if (!parsed.success) {
        setRenameError(parsed.error.issues[0]?.message ?? 'Invalid name');
        return;
      }
      renameTo = parsed.data;
    }
    const result = await onRestore(renameTo);
    if (result?.kind === 'active-name-collision') {
      setMode('rename-restore');
      setRenameError(`"${result.conflictingLabel?.name}" is already active — choose a different name.`);
    }
  }

  async function handleCreateDistinct(newName: string) {
    const parsed = nameSchema.safeParse(newName);
    if (!parsed.success) {
      setCreateError(parsed.error.issues[0]?.message ?? 'Invalid name');
      return;
    }
    if (parsed.data.toLowerCase() === deletedLabel.name.trim().toLowerCase()) {
      setCreateError(`Enter a name different from "${deletedLabel.name}".`);
      return;
    }
    const ok = await onCreateDistinct(parsed.data);
    if (!ok) setCreateError(`"${parsed.data}" is already an active label.`);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="restore-or-create-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-lg dark:bg-slate-800">
        <h2 id="restore-or-create-title" className="text-base font-medium text-slate-900 dark:text-slate-50">
          "{deletedLabel.name}" was deleted
        </h2>

        {mode === 'choice' && (
          <div className="mt-3 space-y-2">
            <button
              type="button"
              onClick={() => handleRestore()}
              className="w-full rounded bg-slate-900 px-3 py-2 text-left text-sm text-white focus-visible:ring-2 focus-visible:ring-offset-2 dark:bg-slate-50 dark:text-slate-900"
            >
              Restore "{deletedLabel.name}" (keeps its history)
            </button>
            <button
              type="button"
              onClick={() => setMode('create-new')}
              className="w-full rounded border border-slate-300 px-3 py-2 text-left text-sm focus-visible:ring-2 focus-visible:ring-offset-2 dark:border-slate-600"
            >
              Create a new label instead
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="w-full px-3 py-2 text-sm text-slate-500 focus-visible:ring-2 focus-visible:ring-offset-2 dark:text-slate-400"
            >
              Cancel
            </button>
          </div>
        )}

        {mode === 'rename-restore' && (
          <form
            className="mt-3 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              handleRestore(renameValue);
            }}
          >
            {renameError && <p className="text-sm text-red-600 dark:text-red-400">{renameError}</p>}
            <label className="block text-sm text-slate-600 dark:text-slate-300" htmlFor="restore-rename-input">
              Restore under a new name
            </label>
            <input
              id="restore-rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 dark:border-slate-600 dark:bg-slate-800"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="rounded bg-slate-900 px-3 py-2 text-sm text-white focus-visible:ring-2 focus-visible:ring-offset-2 dark:bg-slate-50 dark:text-slate-900"
              >
                Restore
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="px-3 py-2 text-sm text-slate-500 focus-visible:ring-2 focus-visible:ring-offset-2 dark:text-slate-400"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {mode === 'create-new' && (
          <form
            className="mt-3 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              handleCreateDistinct(newNameValue);
            }}
          >
            <label className="block text-sm text-slate-600 dark:text-slate-300" htmlFor="create-distinct-input">
              New label name (must differ from "{deletedLabel.name}")
            </label>
            <input
              id="create-distinct-input"
              value={newNameValue}
              onChange={(e) => setNewNameValue(e.target.value)}
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 dark:border-slate-600 dark:bg-slate-800"
            />
            {createError && <p className="text-sm text-red-600 dark:text-red-400">{createError}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                className="rounded bg-slate-900 px-3 py-2 text-sm text-white focus-visible:ring-2 focus-visible:ring-offset-2 dark:bg-slate-50 dark:text-slate-900"
              >
                Create
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="px-3 py-2 text-sm text-slate-500 focus-visible:ring-2 focus-visible:ring-offset-2 dark:text-slate-400"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
