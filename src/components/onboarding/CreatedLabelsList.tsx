import type { LabelRow } from '../../lib/db/labels';

interface CreatedLabelsListProps {
  labels: LabelRow[];
}

// Read-only during onboarding — DESIGN.md §5 step 1 is "an empty list with
// an inline add-label form," no per-row actions. Deliberately not the full
// LabelList: exposing Delete here let a label be soft-deleted before the
// user had even finished onboarding, which then showed up in Settings'
// Deleted labels panel looking like real usage history. Fixing a mistake
// mid-onboarding happens in Settings afterward, same as any other edit.
export function CreatedLabelsList({ labels }: CreatedLabelsListProps) {
  if (labels.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">No labels yet.</p>;
  }
  return (
    <ul className="space-y-2">
      {labels.map((label) => (
        <li
          key={label.id}
          className="flex items-center gap-2 rounded border border-slate-200 p-3 dark:border-slate-700"
        >
          <span aria-hidden="true" className="h-5 w-5 rounded-full" style={{ backgroundColor: label.color }} />
          <span className="text-sm text-slate-900 dark:text-slate-50">{label.name}</span>
        </li>
      ))}
    </ul>
  );
}
