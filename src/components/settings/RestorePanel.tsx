import { useRef } from 'react';
import { useRestore } from '../../hooks/useRestore';
import { useOnline } from '../../hooks/useOnline';

const BUTTON =
  'min-h-11 rounded border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800';

function plural(n: number, word: string, words = `${word}s`): string {
  return `${n} ${n === 1 ? word : words}`;
}

// SPEC §10 (C-37): restore a JSON backup into an EMPTY account. Validation is
// local and immediate; the empty-account guard and all writes live behind the
// Restore button, which is online-only like the CSV import (C-36).
export function RestorePanel({ userId }: { userId: string }) {
  const restorer = useRestore(userId);
  const online = useOnline();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { stage, summary, progress, outcome, error } = restorer;

  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor="restore-backup-file"
          className="block text-sm font-medium text-slate-900 dark:text-slate-50"
        >
          Choose a backup file
        </label>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          A JSON backup downloaded above. Restoring only works into an empty account — it recreates
          everything, it never merges.
        </p>
        <input
          id="restore-backup-file"
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          disabled={stage === 'restoring'}
          className="mt-2 block w-full text-sm text-slate-500 file:mr-3 file:min-h-11 file:cursor-pointer file:rounded file:border file:border-slate-300 file:bg-transparent file:px-3 file:text-sm file:font-medium hover:file:bg-slate-100 focus-visible:ring-2 focus-visible:ring-offset-2 dark:text-slate-400 dark:file:border-slate-600 dark:hover:file:bg-slate-800"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) restorer.loadFile(await file.text());
          }}
        />
      </div>

      {(stage === 'ready' || stage === 'restoring') && summary && (
        <div className="space-y-3 rounded border border-slate-200 p-3 dark:border-slate-700">
          <p className="text-sm text-slate-900 dark:text-slate-50">
            {plural(summary.labels, 'label')}, {plural(summary.categories, 'category', 'categories')},{' '}
            {plural(summary.entries, 'entry', 'entries')} (notes included).
          </p>

          <div>
            <button
              type="button"
              className={BUTTON}
              disabled={!online || stage === 'restoring'}
              onClick={() => restorer.restore()}
            >
              {stage === 'restoring' ? 'Restoring…' : 'Restore this backup'}
            </button>
            {!online && (
              <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                You’re offline — restoring writes directly to the server, so it needs a connection.
              </p>
            )}
          </div>

          {stage === 'restoring' && progress && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {progress.done} of {progress.total} entries sent
            </p>
          )}
        </div>
      )}

      {stage === 'done' && outcome && (
        <div className="space-y-2">
          <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
            Restored {plural(outcome.entries, 'entry', 'entries')},{' '}
            {plural(outcome.labels, 'label')} and{' '}
            {plural(outcome.categories, 'category', 'categories')}.
          </p>
          <button
            type="button"
            className={BUTTON}
            onClick={() => {
              restorer.reset();
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
          >
            Done
          </button>
        </div>
      )}

      <p role="alert" className="text-sm text-red-600 empty:hidden dark:text-red-400">
        {error}
      </p>
    </div>
  );
}
