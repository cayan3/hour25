import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createLabel, listActiveLabels, restoreLabel } from '../lib/db/labels';
import { bulkUpsertDirect, getEntriesForRange } from '../lib/db/entries';
import { toFriendlyErrorMessage } from '../lib/errorMessage';
import { parseImportFile, type ParsedImportFile } from '../lib/import/parse';
import {
  buildImportPreview,
  defaultResolutions,
  type ImportPreview,
  type LabelResolution,
} from '../lib/import/plan';
import { commitImport, type ImportCommitOutcome } from '../lib/import/commit';

export type ImportStage = 'idle' | 'reading' | 'preview' | 'committing' | 'done';

export interface ImportController {
  stage: ImportStage;
  error: string | null;
  preview: ImportPreview | null;
  resolutions: ReadonlyMap<string, LabelResolution>;
  progress: { done: number; total: number } | null;
  outcome: ImportCommitOutcome | null;
  loadFile: (text: string) => Promise<void>;
  setResolution: (nameKey: string, resolution: LabelResolution) => void;
  commit: () => Promise<void>;
  reset: () => void;
}

// SPEC §10's import flow: parse → preview + resolution → online-only direct
// commit. The parse/plan/commit logic is pure (src/lib/import/); this hook
// owns the db wiring, the stage machine, and the single end-of-import
// invalidation.
export function useImport(userId: string): ImportController {
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<ImportStage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [resolutions, setResolutions] = useState<Map<string, LabelResolution>>(new Map());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcome, setOutcome] = useState<ImportCommitOutcome | null>(null);

  // The parsed file and label snapshot back the commit; they never render.
  const fileRef = useRef<ParsedImportFile | null>(null);
  const activeLabelsRef = useRef<{ id: string; name: string }[]>([]);

  const reset = useCallback(() => {
    setStage('idle');
    setError(null);
    setPreview(null);
    setResolutions(new Map());
    setProgress(null);
    setOutcome(null);
    fileRef.current = null;
  }, []);

  const loadFile = useCallback(
    async (text: string) => {
      reset();
      setStage('reading');
      try {
        const parsed = parseImportFile(text);
        if (!parsed.ok) {
          setError(parsed.error);
          setStage('idle');
          return;
        }
        if (parsed.file.days.length === 0) {
          setError('The file has no day rows to import.');
          setStage('idle');
          return;
        }

        const [activeLabels, existing] = await Promise.all([
          listActiveLabels(userId),
          getEntriesForRange(
            userId,
            parsed.file.days[0].date,
            parsed.file.days[parsed.file.days.length - 1].date,
          ),
        ]);

        const previewed = buildImportPreview(parsed.file, activeLabels, existing);
        if (!previewed.ok) {
          setError(previewed.error);
          setStage('idle');
          return;
        }

        fileRef.current = parsed.file;
        activeLabelsRef.current = activeLabels.map((l) => ({ id: l.id, name: l.name }));
        setPreview(previewed.preview);
        setResolutions(defaultResolutions(previewed.preview.unknownLabels));
        setStage('preview');
      } catch (e) {
        setError(toFriendlyErrorMessage(e));
        setStage('idle');
      }
    },
    [userId, reset],
  );

  const setResolution = useCallback((nameKey: string, resolution: LabelResolution) => {
    setResolutions((prev) => new Map(prev).set(nameKey, resolution));
  }, []);

  const commit = useCallback(async () => {
    const file = fileRef.current;
    if (!file || !preview) return;
    setStage('committing');
    setError(null);
    setProgress(null);
    try {
      const result = await commitImport(
        userId,
        file,
        activeLabelsRef.current,
        preview.unknownLabels,
        resolutions,
        { createLabel, restoreLabel, bulkUpsertDirect },
        (done, total) => setProgress({ done, total }),
      );
      // Once, at the end (C-36): the prefix covers every cached day/range;
      // entries-earliest is its own key and import can move both bounds.
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['entries-earliest', userId] });
      if (result.createdLabels > 0 || result.restoredLabels > 0) {
        queryClient.invalidateQueries({ queryKey: ['labels', userId] });
        queryClient.invalidateQueries({ queryKey: ['labels-all', userId] });
      }
      setOutcome(result);
      setStage('done');
    } catch (e) {
      const kind = (e as { kind?: string } | null)?.kind;
      setError(
        kind === 'network'
          ? 'Connection lost — everything already sent is saved. Re-run the same import to resume.'
          : e instanceof Error && !kind
            ? e.message
            : toFriendlyErrorMessage(e),
      );
      // Back to the preview: the file and resolutions are intact, so
      // retrying is one click.
      setStage('preview');
    }
  }, [userId, preview, resolutions, queryClient]);

  return { stage, error, preview, resolutions, progress, outcome, loadFile, setResolution, commit, reset };
}
