import { useExport } from '../../hooks/useExport';
import { advancedToolsEnabled } from '../../lib/advanced';

const BUTTON =
  'min-h-11 rounded border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800';

// SPEC §10 (C-37): the JSON file is the backup. The CSV is spreadsheet
// interop and is lossy, so it sits behind the advanced gate rather than beside
// the backup button where it reads as an equivalent choice.
export function ExportPanel({ userId }: { userId: string }) {
  const { run, busy, error } = useExport(userId);
  const advanced = advancedToolsEnabled();

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

      {advanced && (
        <div>
          <button type="button" className={BUTTON} disabled={busy !== null} onClick={() => run('csv')}>
            {busy === 'csv' ? 'Preparing…' : 'Export spreadsheet (CSV)'}
          </button>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            One row per day, one column per half-hour slot — for opening in a spreadsheet. Notes,
            colours, categories and settings aren’t included, so this is not a backup.
          </p>
        </div>
      )}

      <p role="alert" className="text-sm text-red-600 empty:hidden dark:text-red-400">
        {error}
      </p>
    </div>
  );
}
