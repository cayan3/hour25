import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { insertLabelForRestore, listAllLabels } from '../lib/db/labels';
import { createCategory, listCategories } from '../lib/db/categories';
import { bulkUpsertDirect, getEarliestEntryDate } from '../lib/db/entries';
import { updateSettings } from '../lib/db/settings';
import { toFriendlyErrorMessage } from '../lib/errorMessage';
import type { BackupV1 } from '../lib/backup';
import { parseBackupFile, restoreBackup, type RestoreOutcome } from '../lib/import/restore';

export type RestoreStage = 'idle' | 'ready' | 'restoring' | 'done';

export interface RestoreController {
  stage: RestoreStage;
  error: string | null;
  summary: { labels: number; categories: number; entries: number } | null;
  progress: { done: number; total: number } | null;
  outcome: RestoreOutcome | null;
  loadFile: (text: string) => void;
  restore: () => Promise<void>;
  reset: () => void;
}

// SPEC §10's restore half: validate the file up front (cheap, offline-safe),
// hold it as a summary, and only touch the network when Restore is pressed —
// restoreBackup owns the empty-account guard and the ordering.
export function useRestore(userId: string): RestoreController {
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<RestoreStage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<RestoreController['summary']>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcome, setOutcome] = useState<RestoreOutcome | null>(null);
  const backupRef = useRef<BackupV1 | null>(null);

  const reset = useCallback(() => {
    setStage('idle');
    setError(null);
    setSummary(null);
    setProgress(null);
    setOutcome(null);
    backupRef.current = null;
  }, []);

  const loadFile = useCallback(
    (text: string) => {
      reset();
      const parsed = parseBackupFile(text);
      if (!parsed.ok) {
        setError(parsed.error);
        return;
      }
      backupRef.current = parsed.backup;
      setSummary({
        labels: parsed.backup.labels.length,
        categories: parsed.backup.categories.length,
        entries: parsed.backup.entries.length,
      });
      setStage('ready');
    },
    [reset],
  );

  const restore = useCallback(async () => {
    const backup = backupRef.current;
    if (!backup) return;
    setStage('restoring');
    setError(null);
    setProgress(null);
    try {
      const result = await restoreBackup(
        userId,
        backup,
        {
          listAllLabels,
          listCategories,
          getEarliestEntryDate,
          createCategory,
          insertLabelForRestore,
          bulkUpsertDirect,
          updateSettings,
        },
        (done, total) => setProgress({ done, total }),
      );
      if (!result.ok) {
        setError(result.error);
        setStage('ready');
        return;
      }
      // A restore repopulates every domain — refresh them all once.
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['labels', userId] });
      queryClient.invalidateQueries({ queryKey: ['labels-all', userId] });
      queryClient.invalidateQueries({ queryKey: ['categories', userId] });
      queryClient.invalidateQueries({ queryKey: ['settings', userId] });
      setOutcome(result.outcome);
      setStage('done');
    } catch (e) {
      const kind = (e as { kind?: string } | null)?.kind;
      setError(
        kind === 'network'
          ? 'Connection lost — the restore stopped safely. Re-run it with the same file to resume.'
          : e instanceof Error && !kind
            ? e.message
            : toFriendlyErrorMessage(e),
      );
      setStage('ready');
    }
  }, [userId, queryClient]);

  return { stage, error, summary, progress, outcome, loadFile, restore, reset };
}
