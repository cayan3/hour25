import { describe, expect, it } from 'vitest';
import { backupFilename, buildBackup } from '../../src/lib/backup';
import type { CategoryRow } from '../../src/lib/db/categories';
import type { LabelRow } from '../../src/lib/db/labels';
import type { UserSettingsRow } from '../../src/lib/db/settings';

const settings: UserSettingsRow = {
  id: 'settings-row-id',
  user_id: 'user-1',
  chunk_minutes: 30,
  created_at: '2026-01-01T00:00:00Z',
  dashboard_config: null,
  onboarded_at: '2026-01-01T00:00:00Z',
  sleep_start: 46,
  sleep_end: 14,
  sleep_label_id: 'label-sleep',
  target_minutes_day: null,
  theme: 'system',
  timezone: 'America/Los_Angeles',
};

const categories: CategoryRow[] = [
  { id: 'cat-1', user_id: 'user-1', name: 'Rest', color: '#111111', created_at: null },
];

const labels: LabelRow[] = [
  {
    id: 'label-sleep',
    user_id: 'user-1',
    name: 'Sleep',
    color: '#222222',
    category_id: 'cat-1',
    deleted_at: null,
    created_at: null,
  },
  {
    id: 'label-old',
    user_id: 'user-1',
    name: 'Old habit',
    color: '#333333',
    category_id: null,
    deleted_at: '2026-05-01T00:00:00Z',
    created_at: null,
  },
];

const entries = [
  { date: '2026-07-01', slotIndex: 0, labelId: 'label-sleep', note: 'deep', chunkMinutes: 30 },
  { date: '2026-07-01', slotIndex: 1, labelId: 'label-old', note: null, chunkMinutes: 30 },
];

describe('buildBackup', () => {
  it('stamps version 1 and the export time', () => {
    const backup = buildBackup({
      settings,
      categories,
      labels,
      entries,
      exportedAt: new Date('2026-07-19T12:00:00Z'),
    });
    expect(backup.version).toBe(1);
    expect(backup.exportedAt).toBe('2026-07-19T12:00:00.000Z');
  });

  it('drops the account-scoped settings keys and keeps the rest', () => {
    const { settings: out } = buildBackup({ settings, categories, labels, entries });
    expect(out).not.toHaveProperty('id');
    expect(out).not.toHaveProperty('user_id');
    expect(out.sleep_label_id).toBe('label-sleep');
    expect(out.timezone).toBe('America/Los_Angeles');
  });

  it('keeps label ids so restore can remap them, and preserves soft-delete state', () => {
    const { labels: out } = buildBackup({ settings, categories, labels, entries });
    expect(out).toEqual([
      { id: 'label-sleep', name: 'Sleep', color: '#222222', categoryId: 'cat-1', deletedAt: null },
      {
        id: 'label-old',
        name: 'Old habit',
        color: '#333333',
        categoryId: null,
        deletedAt: '2026-05-01T00:00:00Z',
      },
    ]);
  });

  it('carries notes, which the CSV export deliberately does not', () => {
    const { entries: out } = buildBackup({ settings, categories, labels, entries });
    expect(out[0].note).toBe('deep');
    expect(out[1].note).toBeNull();
  });

  it('serialises to JSON without user_id anywhere in the file', () => {
    const json = JSON.stringify(buildBackup({ settings, categories, labels, entries }));
    expect(json).not.toContain('user_id');
    expect(json).not.toContain('user-1');
  });
});

describe('backupFilename', () => {
  it('date-stamps both kinds so a folder of exports sorts chronologically', () => {
    expect(backupFilename('json', '2026-07-19')).toBe('time-tracker-backup-2026-07-19.json');
    expect(backupFilename('csv', '2026-07-19')).toBe('time-tracker-export-2026-07-19.csv');
  });
});
