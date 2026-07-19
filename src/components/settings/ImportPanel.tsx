import { useRef } from 'react';
import { useImport } from '../../hooks/useImport';
import { useOnline } from '../../hooks/useOnline';
import { useActiveLabels } from '../../hooks/useLabels';
import type { LabelResolution } from '../../lib/import/plan';

const BUTTON =
  'min-h-11 rounded border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800';

const SELECT =
  'min-h-11 rounded border border-slate-300 bg-white px-2 text-base sm:text-sm focus-visible:ring-2 focus-visible:ring-offset-2 dark:border-slate-600 dark:bg-slate-900';

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

// SPEC §10: preview → per-name resolution (create / map / skip) → online-only
// direct commit with a progress bar (C-36). The button is disabled offline
// with a hint — the sanctioned treatment for the one online-only flow.
export function ImportPanel({ userId }: { userId: string }) {
  const importer = useImport(userId);
  const online = useOnline();
  const activeLabels = useActiveLabels(userId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { stage, preview, resolutions, progress, outcome, error } = importer;

  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor="import-csv-file"
          className="block text-sm font-medium text-slate-900 dark:text-slate-50"
        >
          Choose a CSV file
        </label>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Either this app’s own CSV export or a Google Sheets grid export. You’ll see a preview
          before anything is written.
        </p>
        <input
          id="import-csv-file"
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          disabled={stage === 'committing'}
          className="mt-2 block w-full text-sm text-slate-500 file:mr-3 file:min-h-11 file:cursor-pointer file:rounded file:border file:border-slate-300 file:bg-transparent file:px-3 file:text-sm file:font-medium hover:file:bg-slate-100 focus-visible:ring-2 focus-visible:ring-offset-2 dark:text-slate-400 dark:file:border-slate-600 dark:hover:file:bg-slate-800"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) await importer.loadFile(await file.text());
          }}
        />
      </div>

      {stage === 'reading' && <p className="text-sm text-slate-500 dark:text-slate-400">Reading…</p>}

      {(stage === 'preview' || stage === 'committing') && preview && (
        <div className="space-y-3 rounded border border-slate-200 p-3 dark:border-slate-700">
          <p className="text-sm text-slate-900 dark:text-slate-50">
            {plural(preview.dayCount, 'day')} ({preview.firstDate} → {preview.lastDate}),{' '}
            {plural(preview.totalSlots, 'filled slot')}.
          </p>
          {preview.willOverwrite > 0 && (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              {plural(preview.willOverwrite, 'existing entry')} will be overwritten.
            </p>
          )}

          {preview.unknownLabels.length > 0 && (
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-50">
                New label names in this file
              </p>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                Each will be created with a preset color — you can recolor and categorize them in
                Settings afterwards.
              </p>
              <ul className="mt-2 space-y-2">
                {preview.unknownLabels.map((name) => {
                  const key = name.toLowerCase();
                  const resolution = resolutions.get(key);
                  if (!resolution) return null;
                  return (
                    <li key={key} className="flex flex-wrap items-center gap-2">
                      {resolution.action === 'create' && (
                        <span
                          aria-hidden="true"
                          className="h-4 w-4 shrink-0 rounded"
                          style={{ backgroundColor: resolution.color }}
                        />
                      )}
                      <span className="text-sm text-slate-900 dark:text-slate-50">{name}</span>
                      <select
                        aria-label={`What to do with "${name}"`}
                        className={SELECT}
                        disabled={stage === 'committing'}
                        value={resolution.action}
                        onChange={(e) => {
                          const action = e.target.value as LabelResolution['action'];
                          if (action === 'create') {
                            importer.setResolution(key, {
                              action: 'create',
                              color:
                                resolution.action === 'create' ? resolution.color : '#5a5a5a',
                            });
                          } else if (action === 'map') {
                            importer.setResolution(key, {
                              action: 'map',
                              labelId: activeLabels.data?.[0]?.id ?? '',
                            });
                          } else {
                            importer.setResolution(key, { action: 'skip' });
                          }
                        }}
                      >
                        <option value="create">Create new label</option>
                        <option value="map" disabled={(activeLabels.data ?? []).length === 0}>
                          Use an existing label
                        </option>
                        <option value="skip">Skip these slots</option>
                      </select>
                      {resolution.action === 'map' && (
                        <select
                          aria-label={`Label to use for "${name}"`}
                          className={SELECT}
                          disabled={stage === 'committing'}
                          value={resolution.labelId}
                          onChange={(e) =>
                            importer.setResolution(key, { action: 'map', labelId: e.target.value })
                          }
                        >
                          {(activeLabels.data ?? []).map((label) => (
                            <option key={label.id} value={label.id}>
                              {label.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div>
            <button
              type="button"
              className={BUTTON}
              disabled={!online || stage === 'committing'}
              onClick={() => importer.commit()}
            >
              {stage === 'committing' ? 'Importing…' : `Import ${plural(preview.totalSlots, 'slot')}`}
            </button>
            {!online && (
              <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                You’re offline — importing writes directly to the server, so it needs a connection.
              </p>
            )}
          </div>

          {stage === 'committing' && (
            <div>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={progress?.total ?? preview.totalSlots}
                aria-valuenow={progress?.done ?? 0}
                aria-label="Import progress"
                className="h-2 w-full overflow-hidden rounded bg-slate-200 dark:bg-slate-700"
              >
                <div
                  className="h-full bg-sky-600 motion-safe:transition-[width]"
                  style={{
                    width: progress ? `${Math.round((progress.done / progress.total) * 100)}%` : '0%',
                  }}
                />
              </div>
              {progress && (
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {progress.done} of {progress.total} slots sent
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {stage === 'done' && outcome && (
        <div className="space-y-2">
          <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
            Imported {plural(outcome.imported, 'slot')}
            {outcome.createdLabels > 0 && `, created ${plural(outcome.createdLabels, 'label')}`}
            {outcome.restoredLabels > 0 && `, restored ${plural(outcome.restoredLabels, 'label')}`}.
          </p>
          <button
            type="button"
            className={BUTTON}
            onClick={() => {
              importer.reset();
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
          >
            Import another file
          </button>
        </div>
      )}

      <p role="alert" className="text-sm text-red-600 empty:hidden dark:text-red-400">
        {error}
      </p>
    </div>
  );
}
