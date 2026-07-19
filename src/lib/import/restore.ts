import { z } from 'zod';
import type { BackupV1 } from '../backup';
import type { CategoryRow, CreateCategoryResult } from '../db/categories';
import type { LabelRow } from '../db/labels';
import type { DirectEntryRow } from '../db/entries';
import type { UserSettingsRow } from '../db/settings';
import { SLOTS_PER_DAY } from '../constants';
import { isoDateSchema } from './parse';

// SPEC §10 (C-37): the JSON backup is the disaster-recovery story, and this
// is its other half. Zod owns the shape; referential integrity (entries →
// labels) is checked here because a schema can't see across arrays.

const settingsSchema = z.object({
  timezone: z.string(),
  sleep_start: z.number().int().min(0).max(SLOTS_PER_DAY - 1),
  sleep_end: z.number().int().min(0).max(SLOTS_PER_DAY - 1),
  sleep_label_id: z.string().nullable(),
  chunk_minutes: z.number().int().positive(),
  target_minutes_day: z.number().int().nullable(),
  dashboard_config: z.unknown(),
  theme: z.string(),
  onboarded_at: z.string().nullable(),
  created_at: z.string().nullable(),
});

const backupSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  settings: settingsSchema,
  categories: z.array(z.object({ id: z.string().min(1), name: z.string().min(1), color: z.string().min(1) })),
  labels: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      color: z.string().min(1),
      categoryId: z.string().nullable(),
      deletedAt: z.string().nullable(),
    }),
  ),
  entries: z.array(
    z.object({
      date: isoDateSchema,
      slotIndex: z.number().int().min(0).max(SLOTS_PER_DAY - 1),
      labelId: z.string().min(1),
      note: z.string().nullable(),
      chunkMinutes: z.number().int().positive(),
    }),
  ),
});

export type ParseBackupResult = { ok: true; backup: BackupV1 } | { ok: false; error: string };

export function parseBackupFile(text: string): ParseBackupResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This is not a valid JSON file.' };
  }

  // Version first, for a message better than a wall of schema issues: an
  // unknown version most likely means a newer app wrote the file (C-37).
  const version = (raw as { version?: unknown } | null)?.version;
  if (version !== 1) {
    return {
      ok: false,
      error: `This backup is version ${String(version)}; this app can only restore version 1 backups.`,
    };
  }

  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: `This doesn't look like a valid backup file (${issue.path.join('.') || 'root'}: ${issue.message}).`,
    };
  }

  const labelIds = new Set(parsed.data.labels.map((l) => l.id));
  for (const entry of parsed.data.entries) {
    if (!labelIds.has(entry.labelId)) {
      return {
        ok: false,
        error: `Entry ${entry.date} slot ${entry.slotIndex} references a label the file does not contain.`,
      };
    }
  }

  // The Zod output and the generated Supabase types disagree only on the
  // opaque dashboard_config Json — safe to assert across.
  return { ok: true, backup: parsed.data as BackupV1 };
}

// Injected like FlushDeps/ImportCommitDeps so the ordering and remapping are
// testable without supabase; the hook wires the real db helpers.
export interface RestoreDeps {
  listAllLabels: (userId: string) => Promise<LabelRow[]>;
  listCategories: (userId: string) => Promise<CategoryRow[]>;
  getEarliestEntryDate: (userId: string) => Promise<string | null>;
  createCategory: (userId: string, name: string, color: string) => Promise<CreateCategoryResult>;
  insertLabelForRestore: (
    userId: string,
    label: { name: string; color: string; categoryId: string | null; deletedAt: string | null },
  ) => Promise<LabelRow>;
  bulkUpsertDirect: (
    userId: string,
    rows: DirectEntryRow[],
    onProgress?: (done: number, total: number) => void,
  ) => Promise<void>;
  updateSettings: (
    userId: string,
    patch: Partial<Omit<UserSettingsRow, 'id' | 'user_id' | 'created_at'>>,
  ) => Promise<UserSettingsRow>;
}

export interface RestoreOutcome {
  categories: number;
  labels: number;
  entries: number;
}

export type RestoreResult = { ok: true; outcome: RestoreOutcome } | { ok: false; error: string };

// Restore into an EMPTY account only (SPEC §10): categories → labels
// (preserving deleted_at) → remap old ids → entries via the direct import
// path → settings with sleep_label_id remapped. Guard failures return
// ok:false; unexpected db errors propagate for the caller to classify.
export async function restoreBackup(
  userId: string,
  backup: BackupV1,
  deps: RestoreDeps,
  onProgress?: (done: number, total: number) => void,
): Promise<RestoreResult> {
  const [labels, categories, earliest] = await Promise.all([
    deps.listAllLabels(userId),
    deps.listCategories(userId),
    deps.getEarliestEntryDate(userId),
  ]);
  if (labels.length > 0 || categories.length > 0 || earliest !== null) {
    return {
      ok: false,
      error:
        'Restore needs an empty account — this one already has labels, categories or entries. It merges nothing, so restoring over data would tangle two histories.',
    };
  }

  const categoryIdMap = new Map<string, string>();
  for (const category of backup.categories) {
    const created = await deps.createCategory(userId, category.name, category.color);
    if (created.kind !== 'created') {
      throw new Error(`Category "${category.name}" already exists — is the account really empty?`);
    }
    categoryIdMap.set(category.id, created.category.id);
  }

  const labelIdMap = new Map<string, string>();
  for (const label of backup.labels) {
    const inserted = await deps.insertLabelForRestore(userId, {
      name: label.name,
      color: label.color,
      categoryId: label.categoryId === null ? null : (categoryIdMap.get(label.categoryId) ?? null),
      deletedAt: label.deletedAt,
    });
    labelIdMap.set(label.id, inserted.id);
  }

  const rows: DirectEntryRow[] = backup.entries.map((entry) => ({
    date: entry.date,
    slotIndex: entry.slotIndex,
    labelId: labelIdMap.get(entry.labelId) as string, // parseBackupFile guaranteed the reference
    note: entry.note,
    chunkMinutes: entry.chunkMinutes,
  }));
  await deps.bulkUpsertDirect(userId, rows, onProgress);

  const { created_at: _createdAt, sleep_label_id, ...settings } = backup.settings;
  await deps.updateSettings(userId, {
    ...settings,
    sleep_label_id: sleep_label_id === null ? null : (labelIdMap.get(sleep_label_id) ?? null),
  });

  return {
    ok: true,
    outcome: { categories: backup.categories.length, labels: backup.labels.length, entries: rows.length },
  };
}
