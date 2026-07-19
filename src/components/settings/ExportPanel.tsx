import { useExport } from '../../hooks/useExport';

const BUTTON =
  'min-h-11 rounded border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800';

// SPEC §10 (C-37): two different jobs, so two buttons with the difference
// spelled out — the JSON file is the one to keep, the CSV is for taking the
// data somewhere else.
export function ExportPanel({ userId }: { userId: string }) {
  const { run, busy, error } = useExport(userId);

  return (
    <div className="space-y-4">
      <div>
        <button type="button" className={BUTTON} disabled={busy !== null} onClick={() => run('json')}>
          {busy === 'json' ? 'Preparing…' : 'Download backup (JSON)'}
        </button>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
          Everything: entries, notes, labels, categories and settings. This is the file to keep —
          download one every so often.
        </p>
      </div>

      <div>
        <button type="button" className={BUTTON} disabled={busy !== null} onClick={() => run('csv')}>
          {busy === 'csv' ? 'Preparing…' : 'Export spreadsheet (CSV)'}
        </button>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
          One row per day, one column per half-hour slot — for opening in a spreadsheet. Notes
          aren’t included.
        </p>
      </div>

      <p role="alert" className="text-sm text-red-600 empty:hidden dark:text-red-400">
        {error}
      </p>
    </div>
  );
}
