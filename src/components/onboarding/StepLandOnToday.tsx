interface StepLandOnTodayProps {
  onFinish: () => void;
}

// Placeholder only — the real day grid is Week 4 (DESIGN.md §§2-3).
export function StepLandOnToday({ onFinish }: StepLandOnTodayProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-medium text-slate-900 dark:text-slate-50">You're all set</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          The day grid is on its way — for now you can manage labels and categories any time from Settings.
        </p>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onFinish}
          className="rounded bg-slate-900 px-4 py-2 text-sm text-white focus-visible:ring-2 focus-visible:ring-offset-2 dark:bg-slate-50 dark:text-slate-900"
        >
          Go to Today
        </button>
      </div>
    </div>
  );
}
