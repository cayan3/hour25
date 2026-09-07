import { useExport } from '../../hooks/useExport';
import { useOnline } from '../../hooks/useOnline';
import { advancedToolsEnabled } from '../../lib/advanced';

const BUTTON =
  'min-h-11 rounded border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800';

const HINT = 'mt-1.5 text-sm text-slate-500 dark:text-slate-400';

// SPEC §10 (C-37): the JSON file is the backup. The CSV is spreadsheet
// interop and is lossy, so it sits behind the advanced gate rather than beside
// the backup button where it reads as an equivalent choice.
export function ExportPanel({ userId }: { userId: string }) {
  const { run, busy, error } = useExport(userId);
  const online = useOnline();
  const advanced = advancedToolsEnabled();

  // C-36's disabled-with-hint treatment, the same one import and restore get:
  // an export reads the whole entry range from the server, so offline it can
  // only fail. Saying so before the press beats failing after it.
  const offlineHint = !online && (
    <p className={HINT}>
      You’re offline — an export reads your whole history from the server, so it needs a
      connection.
    </p>
  );

  return (
    <div className="space-y-4">
      <div>
        <button
          type="button"
          className={BUTTON}
          disabled={busy !== null || !online}
          onClick={() => run('json')}
        >
          {busy === 'json' ? 'Preparing…' : 'Download backup (JSON)'}
        </button>
        {offlineHint}
        <p className={HINT}>
          Everything: entries, notes, labels, categories and settings. This is the file to keep —
          download one every so often.
        </p>
      </div>

      {advanced && (
        <div>
          <button
            type="button"
            className={BUTTON}
            disabled={busy !== null || !online}
            onClick={() => run('csv')}
          >
            {busy === 'csv' ? 'Preparing…' : 'Export spreadsheet (CSV)'}
          </button>
          {offlineHint}
          <p className={HINT}>
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
