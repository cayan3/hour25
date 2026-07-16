import { useState } from 'react';
import type { LabelRow } from '../../lib/db/labels';
import type { CategoryRow } from '../../lib/db/categories';
import { useSoftDeleteLabel, useUpdateLabel } from '../../hooks/useLabels';
import { PaletteColorPicker } from './PaletteColorPicker';
import { labelFormSchema } from '../../lib/schemas';
import { toFriendlyErrorMessage } from '../../lib/errorMessage';

interface LabelListProps {
  userId: string;
  labels: LabelRow[];
  categories: CategoryRow[];
}

export function LabelList({ userId, labels, categories }: LabelListProps) {
  if (labels.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">No labels yet.</p>;
  }
  return (
    <ul className="space-y-2">
      {labels.map((label) => (
        <LabelRowItem key={label.id} userId={userId} label={label} categories={categories} />
      ))}
    </ul>
  );
}

function LabelRowItem({
  userId,
  label,
  categories,
}: {
  userId: string;
  label: LabelRow;
  categories: CategoryRow[];
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [name, setName] = useState(label.name);
  const [color, setColor] = useState(label.color);
  const [categoryId, setCategoryId] = useState<string | null>(label.category_id);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const updateLabel = useUpdateLabel(userId);
  const softDeleteLabel = useSoftDeleteLabel(userId);

  async function save() {
    const parsed = labelFormSchema.safeParse({ name, color, categoryId });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid input');
      return;
    }
    try {
      const result = await updateLabel.mutateAsync({
        id: label.id,
        patch: { name: parsed.data.name, color: parsed.data.color, categoryId: parsed.data.categoryId ?? null },
      });
      if (result.kind === 'name-taken') {
        setError(`"${parsed.data.name}" is already an active label.`);
        return;
      }
      setError(null);
      setEditing(false);
    } catch (e) {
      setError(toFriendlyErrorMessage(e));
    }
  }

  async function confirmDelete() {
    try {
      await softDeleteLabel.mutateAsync(label.id);
      setDeleteError(null);
      setConfirmingDelete(false);
    } catch (e) {
      // Leave the confirm row open with the error visible instead of
      // silently closing it — a stale-cached label whose row no longer
      // exists server-side used to fail here with zero feedback.
      setDeleteError(toFriendlyErrorMessage(e));
    }
  }

  function cancelEdit() {
    setEditing(false);
    setName(label.name);
    setColor(label.color);
    setCategoryId(label.category_id);
    setError(null);
  }

  if (editing) {
    return (
      <li className="rounded border border-slate-200 p-3 dark:border-slate-700">
        <div className="space-y-2">
          <label className="sr-only" htmlFor={`rename-${label.id}`}>
            Label name
          </label>
          <input
            id={`rename-${label.id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 dark:border-slate-600 dark:bg-slate-800"
          />
          <PaletteColorPicker value={color} onChange={setColor} idPrefix={`label-${label.id}`} />
          {categories.length > 0 && (
            <select
              value={categoryId ?? ''}
              onChange={(e) => setCategoryId(e.target.value || null)}
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 dark:border-slate-600 dark:bg-slate-800"
            >
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white focus-visible:ring-2 focus-visible:ring-offset-2 dark:bg-slate-50 dark:text-slate-900"
            >
              Save
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              className="px-3 py-1.5 text-sm text-slate-500 focus-visible:ring-2 focus-visible:ring-offset-2 dark:text-slate-400"
            >
              Cancel
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="rounded border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="h-5 w-5 rounded-full" style={{ backgroundColor: label.color }} />
        <span className="text-sm text-slate-900 dark:text-slate-50">{label.name}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-offset-2 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          Rename
        </button>
        {confirmingDelete ? (
          <span className="flex items-center gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-300">Delete? History is kept.</span>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={softDeleteLabel.isPending}
              className="rounded bg-red-600 px-2 py-1 text-white focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmingDelete(false);
                setDeleteError(null);
              }}
              className="px-2 py-1 text-slate-500 focus-visible:ring-2 focus-visible:ring-offset-2 dark:text-slate-400"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-offset-2 dark:text-red-400 dark:hover:bg-red-950"
          >
            Delete
          </button>
        )}
      </div>
      </div>
      {deleteError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{deleteError}</p>}
    </li>
  );
}
