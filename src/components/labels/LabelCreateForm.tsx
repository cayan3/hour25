import { useState, type FormEvent } from 'react';
import { labelFormSchema } from '../../lib/schemas';
import { LABEL_PALETTE } from '../../lib/palette';
import { PaletteColorPicker } from './PaletteColorPicker';
import { RestoreOrCreateDialog } from './RestoreOrCreateDialog';
import { useLabelCreateFlow } from '../../hooks/useLabelCreateFlow';
import type { CategoryRow } from '../../lib/db/categories';

interface LabelCreateFormProps {
  userId: string;
  categories?: CategoryRow[];
  onCreated?: () => void;
  // Controlled color, optional — lets a caller (StepCreateLabels) share the
  // "currently selected" swatch with something else it renders (the
  // suggestion chips), so tapping a chip uses whatever's highlighted here
  // rather than an independent, invisible cycle. Uncontrolled (the Settings
  // usage) when omitted.
  color?: string;
  onColorChange?: (hex: string) => void;
}

export function LabelCreateForm({ userId, categories, onCreated, color: controlledColor, onColorChange }: LabelCreateFormProps) {
  const [name, setName] = useState('');
  const [internalColor, setInternalColor] = useState<string>(LABEL_PALETTE[0].hex);
  const color = controlledColor ?? internalColor;
  const setColor = onColorChange ?? setInternalColor;
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const flow = useLabelCreateFlow(userId);

  // Deliberately does not reset color after a successful create — jumping
  // to a new swatch on its own felt random to the user testing it, and
  // leaving the picker where they left it is more predictable even though
  // it means picking a new color for the next label is on them.
  function reset() {
    setName('');
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
    const result = await flow.create(parsed.data.name, parsed.data.color, parsed.data.categoryId ?? null);
    if (result.ok) {
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
            const result = await flow.createDistinct(newName);
            if (result.ok) {
              reset();
              onCreated?.();
            }
            return result;
          }}
          onCancel={flow.cancelCollision}
        />
      )}
    </>
  );
}
