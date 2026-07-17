interface StepLandOnTodayProps {
  onFinish: () => void;
}

export function StepLandOnToday({ onFinish }: StepLandOnTodayProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-medium text-slate-900 dark:text-slate-50">You're all set</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Today's grid is waiting — tap a slot to log your first half hour. Labels and categories can
          be managed any time from Settings.
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
