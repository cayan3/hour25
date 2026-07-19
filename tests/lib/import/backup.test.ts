import { describe, it, expect, vi } from 'vitest';
import {
  parseBackupFile,
  restoreBackup,
  type RestoreDeps,
} from '../../../src/lib/import/restore';
import type { BackupV1 } from '../../../src/lib/backup';

const USER = 'user-1';

function validBackup(overrides: Partial<BackupV1> = {}): BackupV1 {
  return {
    version: 1,
    exportedAt: '2026-07-19T12:00:00.000Z',
    settings: {
      timezone: 'America/New_York',
      sleep_start: 46,
      sleep_end: 14,
      sleep_label_id: 'old-sleep',
      chunk_minutes: 30,
      target_minutes_day: null,
      dashboard_config: null,
      theme: 'system',
      onboarded_at: '2026-03-01T00:00:00.000Z',
      created_at: '2026-03-01T00:00:00.000Z',
    },
    categories: [{ id: 'old-cat', name: 'Health', color: '#00654a' }],
    labels: [
      { id: 'old-sleep', name: 'sleep', color: '#004972', categoryId: 'old-cat', deletedAt: null },
      { id: 'old-gone', name: 'old hobby', color: '#936600', categoryId: null, deletedAt: '2026-05-01T00:00:00.000Z' },
    ],
    entries: [
      { date: '2026-07-01', slotIndex: 0, labelId: 'old-sleep', note: null, chunkMinutes: 30 },
      { date: '2026-07-01', slotIndex: 1, labelId: 'old-gone', note: 'kept note', chunkMinutes: 30 },
    ],
    ...overrides,
  };
}

describe('parseBackupFile', () => {
  it('accepts a well-formed v1 backup', () => {
    const result = parseBackupFile(JSON.stringify(validBackup()));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.backup.entries).toHaveLength(2);
  });

  it('refuses malformed JSON with a readable message', () => {
    const result = parseBackupFile('{not json');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not a valid/i);
  });

  it('refuses an unknown version by naming it', () => {
    const result = parseBackupFile(JSON.stringify({ ...validBackup(), version: 2 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/version 2/);
  });

  it('refuses an entry pointing at a label the file does not contain', () => {
    const backup = validBackup();
    backup.entries.push({ date: '2026-07-02', slotIndex: 3, labelId: 'missing', note: null, chunkMinutes: 30 });
    const result = parseBackupFile(JSON.stringify(backup));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/label/i);
  });

  it('refuses structurally invalid files (bad slot index)', () => {
    const backup = validBackup();
    backup.entries[0].slotIndex = 48;
    const result = parseBackupFile(JSON.stringify(backup));
    expect(result.ok).toBe(false);
  });
});

interface CallLogDeps extends RestoreDeps {
  calls: string[];
  createdCategories: { name: string; color: string }[];
  createdLabels: { name: string; color: string; categoryId: string | null; deletedAt: string | null }[];
  writtenRows: { date: string; slotIndex: number; labelId: string; note?: string | null }[];
  settingsPatch: Record<string, unknown> | null;
}

function makeDeps(overrides: Partial<RestoreDeps> = {}): CallLogDeps {
  const deps: CallLogDeps = {
    calls: [],
    createdCategories: [],
    createdLabels: [],
    writtenRows: [],
    settingsPatch: null,
    listAllLabels: vi.fn(async () => []),
    listCategories: vi.fn(async () => []),
    getEarliestEntryDate: vi.fn(async () => null),
    createCategory: vi.fn(async (_u: string, name: string, color: string) => {
      deps.calls.push(`category:${name}`);
      deps.createdCategories.push({ name, color });
      return { kind: 'created' as const, category: { id: `new-cat-${name}` } as never };
    }),
    insertLabelForRestore: vi.fn(async (_u: string, label: { name: string; color: string; categoryId: string | null; deletedAt: string | null }) => {
      deps.calls.push(`label:${label.name}`);
      deps.createdLabels.push(label);
      return { id: `new-label-${label.name}` } as never;
    }),
    bulkUpsertDirect: vi.fn(async (_u, rows, onProgress) => {
      deps.calls.push('entries');
      deps.writtenRows.push(...rows);
      onProgress?.(rows.length, rows.length);
    }),
    updateSettings: vi.fn(async (_u, patch) => {
      deps.calls.push('settings');
      deps.settingsPatch = patch as Record<string, unknown>;
      return {} as never;
    }),
    ...overrides,
  };
  return deps;
}

describe('restoreBackup', () => {
  it('refuses a non-empty account (existing labels)', async () => {
    const deps = makeDeps({
      listAllLabels: vi.fn(async () => [{ id: 'x' } as never]),
    });
    const result = await restoreBackup(USER, validBackup(), deps);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/empty account/i);
    expect(deps.writtenRows).toHaveLength(0);
  });

  it('refuses a non-empty account (existing entries)', async () => {
    const deps = makeDeps({
      getEarliestEntryDate: vi.fn(async () => '2026-01-01'),
    });
    const result = await restoreBackup(USER, validBackup(), deps);
    expect(result.ok).toBe(false);
    expect(deps.writtenRows).toHaveLength(0);
  });

  it('creates categories, then labels (deleted state kept), then entries, then settings', async () => {
    const deps = makeDeps();
    const result = await restoreBackup(USER, validBackup(), deps);
    expect(result.ok).toBe(true);
    expect(deps.calls).toEqual(['category:Health', 'label:sleep', 'label:old hobby', 'entries', 'settings']);
    // Soft-deleted state and the category link ride through the id remap.
    expect(deps.createdLabels).toEqual([
      { name: 'sleep', color: '#004972', categoryId: 'new-cat-Health', deletedAt: null },
      { name: 'old hobby', color: '#936600', categoryId: null, deletedAt: '2026-05-01T00:00:00.000Z' },
    ]);
  });

  it('remaps entry label ids and keeps notes', async () => {
    const deps = makeDeps();
    await restoreBackup(USER, validBackup(), deps);
    expect(deps.writtenRows).toEqual([
      { date: '2026-07-01', slotIndex: 0, labelId: 'new-label-sleep', note: null, chunkMinutes: 30 },
      { date: '2026-07-01', slotIndex: 1, labelId: 'new-label-old hobby', note: 'kept note', chunkMinutes: 30 },
    ]);
  });

  it('remaps sleep_label_id in the settings patch and never writes ids or created_at', async () => {
    const deps = makeDeps();
    await restoreBackup(USER, validBackup(), deps);
    expect(deps.settingsPatch).toMatchObject({
      sleep_label_id: 'new-label-sleep',
      sleep_start: 46,
      sleep_end: 14,
      timezone: 'America/New_York',
      theme: 'system',
      onboarded_at: '2026-03-01T00:00:00.000Z',
    });
    expect(deps.settingsPatch).not.toHaveProperty('created_at');
    expect(deps.settingsPatch).not.toHaveProperty('id');
    expect(deps.settingsPatch).not.toHaveProperty('user_id');
  });

  it('nulls sleep_label_id when the backup points it at a label the file lacks', async () => {
    const deps = makeDeps();
    const backup = validBackup();
    backup.settings = { ...backup.settings, sleep_label_id: 'not-in-file' };
    const result = await restoreBackup(USER, backup, deps);
    expect(result.ok).toBe(true);
    expect(deps.settingsPatch).toMatchObject({ sleep_label_id: null });
  });

  it('reports progress through the entry write', async () => {
    const deps = makeDeps();
    const seen: [number, number][] = [];
    await restoreBackup(USER, validBackup(), deps, (done, total) => seen.push([done, total]));
    expect(seen).toEqual([[2, 2]]);
  });

  it('propagates a mid-restore failure untouched for the caller to classify', async () => {
    const boom = Object.assign(new Error('fetch failed'), { kind: 'network' });
    const deps = makeDeps({
      bulkUpsertDirect: vi.fn(async () => {
        throw boom;
      }),
    });
    await expect(restoreBackup(USER, validBackup(), deps)).rejects.toBe(boom);
  });
});
