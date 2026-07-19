import { useCallback, useState } from 'react';
import { backupFilename, buildBackup } from '../lib/backup';
import { entriesToCsv } from '../lib/csv';
import { listCategories } from '../lib/db/categories';
import { listAllLabels } from '../lib/db/labels';
import { getSettings } from '../lib/db/settings';
import { getEarliestEntryDate, getEntriesForRange, getLatestEntryDate } from '../lib/db/entries';
import { downloadTextFile } from '../lib/download';
import { toFriendlyErrorMessage } from '../lib/errorMessage';
import { listPendingWrites } from '../lib/offline/queue';
import { mergePendingAllDates, type DatedEntry } from '../lib/merge';
import { localDateString } from '../lib/time';

// Export is a read surface like any other, so it renders merged state: an
// entry logged offline and still sitting in the queue belongs in the backup.
// Without this, exporting while pending writes exist would silently omit
// exactly the entries least likely to be recoverable elsewhere.
async function readAllEntries(userId: string): Promise<DatedEntry[]> {
  const [earliest, latest, pending] = await Promise.all([
    getEarliestEntryDate(userId),
    getLatestEntryDate(userId),
    listPendingWrites(userId),
  ]);
  const server = earliest && latest ? await getEntriesForRange(userId, earliest, latest) : [];
  return mergePendingAllDates(server, pending);
}

type ExportKind = 'csv' | 'json';

export interface ExportState {
  run: (kind: ExportKind) => Promise<void>;
  busy: ExportKind | null;
  error: string | null;
}

export function useExport(userId: string): ExportState {
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (kind: ExportKind) => {
      setBusy(kind);
      setError(null);
      try {
        const today = localDateString();
        if (kind === 'csv') {
          // Names resolve against labels-all, never the active list: a slot
          // logged under a since-deleted label must still export its name.
          const [entries, labels] = await Promise.all([readAllEntries(userId), listAllLabels(userId)]);
          const names = new Map(labels.map((l) => [l.id, l.name]));
          downloadTextFile(
            backupFilename('csv', today),
            'text/csv;charset=utf-8',
            entriesToCsv(entries, names),
          );
        } else {
          const [entries, labels, categories, settings] = await Promise.all([
            readAllEntries(userId),
            listAllLabels(userId),
            listCategories(userId),
            getSettings(userId),
          ]);
          if (!settings) throw new Error('Settings not found');
          downloadTextFile(
            backupFilename('json', today),
            'application/json',
            JSON.stringify(buildBackup({ settings, categories, labels, entries }), null, 2),
          );
        }
      } catch (e) {
        setError(toFriendlyErrorMessage(e));
      } finally {
        setBusy(null);
      }
    },
    [userId],
  );

  return { run, busy, error };
}
