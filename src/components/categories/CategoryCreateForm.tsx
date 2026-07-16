import { useState, type FormEvent } from 'react';
import { categoryFormSchema } from '../../lib/schemas';
import { nextPaletteColor } from '../../lib/palette';
import { PaletteColorPicker } from '../labels/PaletteColorPicker';
import { useCreateCategory } from '../../hooks/useCategories';
import { toFriendlyErrorMessage } from '../../lib/errorMessage';

interface CategoryCreateFormProps {
  userId: string;
  onCreated?: () => void;
}

export function CategoryCreateForm({ userId, onCreated }: CategoryCreateFormProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(() => nextPaletteColor());
  const [error, setError] = useState<string | null>(null);
  const createCategory = useCreateCategory(userId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = categoryFormSchema.safeParse({ name, color });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid input');
      return;
    }
    try {
      const result = await createCategory.mutateAsync(parsed.data);
      if (result.kind === 'name-taken') {
        setError(`"${parsed.data.name}" is already a category.`);
        return;
      }
      setError(null);
      setName('');
      setColor(nextPaletteColor());
      onCreated?.();
    } catch (e) {
      setError(toFriendlyErrorMessage(e));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor="category-name" className="block text-sm text-slate-600 dark:text-slate-300">
          Category name
        </label>
        <input
          id="category-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 dark:border-slate-600 dark:bg-slate-800"
          placeholder="e.g. Work"
        />
      </div>
      <PaletteColorPicker value={color} onChange={setColor} idPrefix="category-create" />
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={createCategory.isPending}
        className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 dark:bg-slate-50 dark:text-slate-900"
      >
        Add category
      </button>
    </form>
  );
}
