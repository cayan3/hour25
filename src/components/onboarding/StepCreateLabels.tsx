import { useState } from 'react';
import { useActiveLabels } from '../../hooks/useLabels';
import { useLabelCreateFlow } from '../../hooks/useLabelCreateFlow';
import { LABEL_PALETTE } from '../../lib/palette';
import { LabelCreateForm } from '../labels/LabelCreateForm';
import { CreatedLabelsList } from './CreatedLabelsList';
import { RestoreOrCreateDialog } from '../labels/RestoreOrCreateDialog';

// The ONLY hardcoded label-name strings permitted anywhere in the codebase
// (C-46) — generic onboarding suggestions. Tapping one creates exactly that
// one label; none pre-selected; not tapping any creates nothing.
const SUGGESTIONS = ['Sleep', 'Work', 'Exercise', 'Meals', 'Social', 'Chores', 'Leisure'];

interface StepCreateLabelsProps {
  userId: string;
  onContinue: () => void;
}

export function StepCreateLabels({ userId, onContinue }: StepCreateLabelsProps) {
  const activeLabels = useActiveLabels(userId);
  const flow = useLabelCreateFlow(userId);
  // Shared with LabelCreateForm below: whichever swatch is currently
  // highlighted there is what a chip tap uses too, not an independent cycle
  // invisible to the form. Deliberately does not advance after a creation —
  // jumping to a new color on its own read as random to the user testing
  // it; leaving the picker where it was is more predictable, even though it
  // means picking a new color for the next label is on them.
  const [color, setColor] = useState<string>(LABEL_PALETTE[0].hex);

  const existingNames = new Set((activeLabels.data ?? []).map((l) => l.name.trim().toLowerCase()));

  async function tapSuggestion(name: string) {
    await flow.create(name, color);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-medium text-slate-900 dark:text-slate-50">Create your first labels</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Labels are what you'll tag time slots with. You can also create labels later by importing a CSV.
        </p>
      </div>

      <CreatedLabelsList labels={activeLabels.data ?? []} />

      <div>
        <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">Quick add:</p>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((name) => {
            const already = existingNames.has(name.toLowerCase());
            return (
              <button
                key={name}
                type="button"
                disabled={already || flow.isPending}
                onClick={() => tapSuggestion(name)}
                className="touch-manipulation rounded-full border border-slate-300 px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-40 dark:border-slate-600"
              >
                {already ? `${name} ✓` : name}
              </button>
            );
          })}
        </div>
        {flow.error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{flow.error}</p>}
      </div>

      <LabelCreateForm userId={userId} color={color} onColorChange={setColor} />

      {flow.collision && (
        <RestoreOrCreateDialog
          deletedLabel={flow.collision.deletedLabel}
          onRestore={flow.restore}
          onCreateDistinct={flow.createDistinct}
          onCancel={flow.cancelCollision}
        />
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onContinue}
          className="rounded bg-slate-900 px-4 py-2 text-sm text-white focus-visible:ring-2 focus-visible:ring-offset-2 dark:bg-slate-50 dark:text-slate-900"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
