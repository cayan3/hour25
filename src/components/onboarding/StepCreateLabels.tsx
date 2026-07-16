import { useActiveLabels } from '../../hooks/useLabels';
import { useLabelCreateFlow } from '../../hooks/useLabelCreateFlow';
import { nextPaletteColor } from '../../lib/palette';
import { LabelCreateForm } from '../labels/LabelCreateForm';
import { LabelList } from '../labels/LabelList';
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

  const existingNames = new Set((activeLabels.data ?? []).map((l) => l.name.trim().toLowerCase()));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-medium text-slate-900 dark:text-slate-50">Create your first labels</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Labels are what you'll tag time slots with. You can also create labels later by importing a CSV.
        </p>
      </div>

      <LabelList userId={userId} labels={activeLabels.data ?? []} categories={[]} />

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
                onClick={() => flow.create(name, nextPaletteColor())}
                className="touch-manipulation rounded-full border border-slate-300 px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-40 dark:border-slate-600"
              >
                {already ? `${name} ✓` : name}
              </button>
            );
          })}
        </div>
        {flow.error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{flow.error}</p>}
      </div>

      <LabelCreateForm userId={userId} />

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
