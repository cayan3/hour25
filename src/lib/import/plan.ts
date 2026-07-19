import type { ServerEntryRow } from '../merge';
import type { DirectEntryRow } from '../db/entries';
import type { ParsedImportFile } from './parse';
import { nextPaletteColor } from '../palette';

export interface ImportPreview {
  totalSlots: number; // filled cells in the file
  willOverwrite: number; // (date, slot) pairs that already hold a server entry
  unknownLabels: string[]; // distinct case-insensitively, first spelling kept
  dayCount: number;
  firstDate: string;
  lastDate: string;
}

export type PreviewResult = { ok: true; preview: ImportPreview } | { ok: false; error: string };

// SPEC §10 step 1: names match case-insensitively against ACTIVE labels only.
// Two active labels sharing a lowercased name should be impossible (C-32's
// partial unique index), so hitting it means something is wrong enough that
// guessing which label wins would corrupt the import — refuse instead.
export function buildImportPreview(
  file: ParsedImportFile,
  activeLabels: { id: string; name: string }[],
  existing: ServerEntryRow[],
): PreviewResult {
  const idsByName = new Map<string, string[]>();
  for (const label of activeLabels) {
    const key = label.name.trim().toLowerCase();
    idsByName.set(key, [...(idsByName.get(key) ?? []), label.id]);
  }

  const existingSlots = new Set<string>();
  for (const row of existing) existingSlots.add(`${row.date}:${row.slot_index}`);

  const unknown = new Map<string, string>(); // lower → first spelling
  let totalSlots = 0;
  let willOverwrite = 0;

  for (const day of file.days) {
    for (let slot = 0; slot < day.cells.length; slot++) {
      const name = day.cells[slot];
      if (name === null) continue;
      totalSlots++;
      if (existingSlots.has(`${day.date}:${slot}`)) willOverwrite++;

      const key = name.toLowerCase();
      const matches = idsByName.get(key) ?? [];
      if (matches.length > 1) {
        return {
          ok: false,
          error: `More than one active label is named "${name}" — resolve the duplicate labels in Settings first.`,
        };
      }
      if (matches.length === 0 && !unknown.has(key)) unknown.set(key, name);
    }
  }

  return {
    ok: true,
    preview: {
      totalSlots,
      willOverwrite,
      unknownLabels: [...unknown.values()],
      dayCount: file.days.length,
      firstDate: file.days[0]?.date ?? '',
      lastDate: file.days[file.days.length - 1]?.date ?? '',
    },
  };
}

export type LabelResolution =
  | { action: 'create'; color: string }
  | { action: 'map'; labelId: string }
  | { action: 'skip' };

// Every unknown name defaults to create-with-palette-color (C-46): the
// resolution UI is a review screen, not a data-entry chore. The shared
// palette cursor hands successive names visibly distinct colors with zero
// input — exactly the case it was kept for (C-58).
export function defaultResolutions(unknownLabels: string[]): Map<string, LabelResolution> {
  const resolutions = new Map<string, LabelResolution>();
  for (const name of unknownLabels) {
    resolutions.set(name.toLowerCase(), { action: 'create', color: nextPaletteColor() });
  }
  return resolutions;
}

// The commit plan: every filled cell whose (lowercased) name resolved to a
// label id becomes one direct row; names absent from the map were skipped.
// Dates and slots are unique by construction (the parser refuses duplicate
// dates), so no further dedup is needed before bulkUpsertDirect.
export function buildImportRows(
  file: ParsedImportFile,
  labelIdByName: Map<string, string>,
): DirectEntryRow[] {
  const rows: DirectEntryRow[] = [];
  for (const day of file.days) {
    for (let slot = 0; slot < day.cells.length; slot++) {
      const name = day.cells[slot];
      if (name === null) continue;
      const labelId = labelIdByName.get(name.toLowerCase());
      if (labelId === undefined) continue;
      rows.push({ date: day.date, slotIndex: slot, labelId });
    }
  }
  return rows;
}
