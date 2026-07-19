import type { CategoryRow } from './db/categories';
import type { LabelRow } from './db/labels';
import type { UserSettingsRow } from './db/settings';
import type { DatedEntry } from './merge';

// SPEC §10 (C-37). The CSV export is interop; this is the actual backup —
// it carries notes, colors, categories, soft-delete state and settings, and
// it keeps ids so restore (Phase 1.5) can remap them and reattach
// sleep_label_id. `id`/`user_id` are dropped: they belong to the account the
// file came from, never to the account it is restored into.
export interface BackupV1 {
  version: 1;
  exportedAt: string;
  settings: Omit<UserSettingsRow, 'id' | 'user_id'>;
  categories: { id: string; name: string; color: string }[];
  labels: {
    id: string;
    name: string;
    color: string;
    categoryId: string | null;
    deletedAt: string | null;
  }[];
  entries: {
    date: string;
    slotIndex: number;
    labelId: string;
    note: string | null;
    chunkMinutes: number;
  }[];
}

export function buildBackup(input: {
  settings: UserSettingsRow;
  categories: CategoryRow[];
  labels: LabelRow[];
  entries: DatedEntry[];
  exportedAt?: Date;
}): BackupV1 {
  const { id: _id, user_id: _userId, ...settings } = input.settings;
  return {
    version: 1,
    exportedAt: (input.exportedAt ?? new Date()).toISOString(),
    settings,
    categories: input.categories.map((c) => ({ id: c.id, name: c.name, color: c.color })),
    // Soft-deleted labels are included on purpose: entries reference them,
    // and a restore that dropped them would orphan real history.
    labels: input.labels.map((l) => ({
      id: l.id,
      name: l.name,
      color: l.color,
      categoryId: l.category_id,
      deletedAt: l.deleted_at,
    })),
    entries: input.entries.map((e) => ({
      date: e.date,
      slotIndex: e.slotIndex,
      labelId: e.labelId,
      note: e.note,
      chunkMinutes: e.chunkMinutes,
    })),
  };
}

// `time-tracker-backup-2026-07-19.json` — sorts chronologically in a folder
// of weekly exports, which is the habit this feature is meant to support.
export function backupFilename(kind: 'json' | 'csv', date: string): string {
  return kind === 'json'
    ? `time-tracker-backup-${date}.json`
    : `time-tracker-export-${date}.csv`;
}
