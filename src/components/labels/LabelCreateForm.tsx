import { useState, type FormEvent } from 'react';
import { labelFormSchema } from '../../lib/schemas';
import { nextPaletteColor } from '../../lib/palette';
import { PaletteColorPicker } from './PaletteColorPicker';
import { RestoreOrCreateDialog } from './RestoreOrCreateDialog';
import { useLabelCreateFlow } from '../../hooks/useLabelCreateFlow';
import type { CategoryRow } from '../../lib/db/categories';

interface LabelCreateFormProps {
  userId: string;
  categories?: CategoryRow[];
  onCreated?: () => void;
}

export function LabelCreateForm({ userId, categories, onCreated }: LabelCreateFormProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(() => nextPaletteColor());
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const flow = useLabelCreateFlow(userId);

  function reset() {
    setName('');
    setColor(nextPaletteColor());
    setCategoryId(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = labelFormSchema.safeParse({ name, color, categoryId });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Invalid input');
      return;
    }
    setFieldError(null);
    const ok = await flow.create(parsed.data.name, parsed.data.color, parsed.data.categoryId ?? null);
    if (ok) {
      reset();
      onCreated?.();
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="label-name" className="block text-sm text-slate-600 dark:text-slate-300">
            Label name
          </label>
          <input
            id="label-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 dark:border-slate-600 dark:bg-slate-800"
            placeholder="e.g. Deep work"
          />
        </div>
        <PaletteColorPicker value={color} onChange={setColor} idPrefix="label-create" />
        {categories && categories.length > 0 && (
          <div>
            <label htmlFor="label-category" className="block text-sm text-slate-600 dark:text-slate-300">
              Category (optional)
            </label>
            <select
              id="label-category"
              value={categoryId ?? ''}
              onChange={(e) => setCategoryId(e.target.value || null)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 dark:border-slate-600 dark:bg-slate-800"
            >
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {(fieldError || flow.error) && (
          <p className="text-sm text-red-600 dark:text-red-400">{fieldError ?? flow.error}</p>
        )}
        <button
          type="submit"
          disabled={flow.isPending}
          className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 dark:bg-slate-50 dark:text-slate-900"
        >
          Add label
        </button>
      </form>

      {flow.collision && (
        <RestoreOrCreateDialog
          deletedLabel={flow.collision.deletedLabel}
          onRestore={flow.restore}
          onCreateDistinct={async (newName) => {
            const ok = await flow.createDistinct(newName);
            if (ok) {
              reset();
              onCreated?.();
            }
            return ok;
          }}
          onCancel={flow.cancelCollision}
        />
      )}
    </>
  );
}
