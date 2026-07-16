import { useState } from 'react';
import type { CategoryRow } from '../../lib/db/categories';
import { useDeleteCategory, useUpdateCategory } from '../../hooks/useCategories';
import { PaletteColorPicker } from '../labels/PaletteColorPicker';
import { categoryFormSchema } from '../../lib/schemas';

interface CategoryListProps {
  userId: string;
  categories: CategoryRow[];
}

export function CategoryList({ userId, categories }: CategoryListProps) {
  if (categories.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">No categories yet.</p>;
  }
  return (
    <ul className="space-y-2">
      {categories.map((category) => (
        <CategoryRowItem key={category.id} userId={userId} category={category} />
      ))}
    </ul>
  );
}

function CategoryRowItem({ userId, category }: { userId: string; category: CategoryRow }) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color);
  const [error, setError] = useState<string | null>(null);
  const updateCategory = useUpdateCategory(userId);
  const deleteCategory = useDeleteCategory(userId);

  async function save() {
    const parsed = categoryFormSchema.safeParse({ name, color });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid input');
      return;
    }
    const result = await updateCategory.mutateAsync({ id: category.id, patch: parsed.data });
    if (result.kind === 'name-taken') {
      setError(`"${parsed.data.name}" is already a category.`);
      return;
    }
    setError(null);
    setEditing(false);
  }

  function cancelEdit() {
    setEditing(false);
    setName(category.name);
    setColor(category.color);
    setError(null);
  }

  if (editing) {
    return (
      <li className="rounded border border-slate-200 p-3 dark:border-slate-700">
        <div className="space-y-2">
          <label className="sr-only" htmlFor={`category-rename-${category.id}`}>
            Category name
          </label>
          <input
            id={`category-rename-${category.id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 dark:border-slate-600 dark:bg-slate-800"
          />
          <PaletteColorPicker value={color} onChange={setColor} idPrefix={`category-${category.id}`} />
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
    <li className="flex items-center justify-between rounded border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="h-5 w-5 rounded-full" style={{ backgroundColor: category.color }} />
        <span className="text-sm text-slate-900 dark:text-slate-50">{category.name}</span>
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
            <span className="text-slate-600 dark:text-slate-300">Delete permanently? Labels keep no category.</span>
            <button
              type="button"
              onClick={() => {
                deleteCategory.mutate(category.id);
                setConfirmingDelete(false);
              }}
              className="rounded bg-red-600 px-2 py-1 text-white focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
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
    </li>
  );
}
