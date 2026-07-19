import type { CreateLabelResult, RestoreLabelResult } from '../db/labels';
import type { DirectEntryRow } from '../db/entries';
import type { ParsedImportFile } from './parse';
import { buildImportRows, type LabelResolution } from './plan';

// Injected like FlushDeps: the orchestration is testable without supabase,
// and the hook wires the real db helpers plus query invalidation around it.
export interface ImportCommitDeps {
  createLabel: (userId: string, name: string, color: string) => Promise<CreateLabelResult>;
  restoreLabel: (userId: string, id: string) => Promise<RestoreLabelResult>;
  bulkUpsertDirect: (
    userId: string,
    rows: DirectEntryRow[],
    onProgress?: (done: number, total: number) => void,
  ) => Promise<void>;
}

export interface ImportCommitOutcome {
  imported: number;
  createdLabels: number;
  restoredLabels: number;
}

// SPEC §10 step 2. Labels first, then entries: a failure while creating
// labels writes no entry at all, and a failure mid-entries leaves whole
// committed batches — either way re-running the same file with the same
// resolutions converges on the same end state (idempotence is the abort
// story, not a transaction).
export async function commitImport(
  userId: string,
  file: ParsedImportFile,
  activeLabels: { id: string; name: string }[],
  unknownLabels: string[], // first spellings, from the preview
  resolutions: Map<string, LabelResolution>,
  deps: ImportCommitDeps,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportCommitOutcome> {
  const labelIdByName = new Map<string, string>();
  for (const label of activeLabels) {
    labelIdByName.set(label.name.trim().toLowerCase(), label.id);
  }

  let createdLabels = 0;
  let restoredLabels = 0;

  for (const spelling of unknownLabels) {
    const key = spelling.toLowerCase();
    const resolution = resolutions.get(key);
    if (!resolution || resolution.action === 'skip') continue;

    if (resolution.action === 'map') {
      labelIdByName.set(key, resolution.labelId);
      continue;
    }

    const created = await deps.createLabel(userId, spelling, resolution.color);
    if (created.kind === 'created') {
      labelIdByName.set(key, created.label.id);
      createdLabels++;
    } else if (created.kind === 'restore-or-create') {
      // The name matches a soft-deleted label: restore it (C-32 — history
      // wins) so the imported slots join the entries already logged under it.
      const restored = await deps.restoreLabel(userId, created.deletedLabel.id);
      if (restored.kind !== 'restored') {
        throw new Error(
          `The label "${spelling}" could not be restored because an active label now has that name — re-run the import.`,
        );
      }
      labelIdByName.set(key, restored.label.id);
      restoredLabels++;
    } else {
      // Race: an identically-named active label appeared since the preview.
      // On a re-run it will simply match instead of being unknown.
      throw new Error(`A label named "${spelling}" was just created elsewhere — re-run the import.`);
    }
  }

  const rows = buildImportRows(file, labelIdByName);
  await deps.bulkUpsertDirect(userId, rows, onProgress);

  return { imported: rows.length, createdLabels, restoredLabels };
}
