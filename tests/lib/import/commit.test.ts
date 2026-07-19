import { describe, it, expect, vi } from 'vitest';
import { commitImport, type ImportCommitDeps } from '../../../src/lib/import/commit';
import type { ParsedImportFile } from '../../../src/lib/import/parse';
import type { LabelResolution } from '../../../src/lib/import/plan';
import { SLOTS_PER_DAY } from '../../../src/lib/constants';

const USER = 'user-1';

function day(date: string, filled: Record<number, string>): ParsedImportFile['days'][number] {
  return { date, cells: Array.from({ length: SLOTS_PER_DAY }, (_, i) => filled[i] ?? null) };
}

function makeDeps(overrides: Partial<ImportCommitDeps> = {}): ImportCommitDeps & {
  written: { date: string; slotIndex: number; labelId: string }[];
} {
  const written: { date: string; slotIndex: number; labelId: string }[] = [];
  return {
    written,
    createLabel: vi.fn(async (_userId: string, name: string) => ({
      kind: 'created' as const,
      label: { id: `created-${name}` } as never,
    })),
    restoreLabel: vi.fn(async (_userId: string, id: string) => ({
      kind: 'restored' as const,
      label: { id } as never,
    })),
    bulkUpsertDirect: vi.fn(async (_userId, rows, onProgress) => {
      written.push(...rows);
      onProgress?.(rows.length, rows.length);
    }),
    ...overrides,
  };
}

describe('commitImport', () => {
  const file: ParsedImportFile = {
    format: 'sheets',
    days: [day('2026-07-01', { 0: 'work', 1: 'gym', 2: 'old hobby', 3: 'secret' })],
  };
  const active = [{ id: 'l-work', name: 'Work' }];
  const resolutions = new Map<string, LabelResolution>([
    ['gym', { action: 'create', color: '#936600' }],
    ['old hobby', { action: 'create', color: '#377395' }],
    ['secret', { action: 'skip' }],
  ]);

  it('creates unknown labels, maps active ones, omits skipped, and writes the rows', async () => {
    const deps = makeDeps();
    const outcome = await commitImport(USER, file, active, ['gym', 'old hobby'], resolutions, deps);

    expect(deps.createLabel).toHaveBeenCalledWith(USER, 'gym', '#936600');
    expect(deps.createLabel).toHaveBeenCalledWith(USER, 'old hobby', '#377395');
    expect(deps.written).toEqual([
      { date: '2026-07-01', slotIndex: 0, labelId: 'l-work' },
      { date: '2026-07-01', slotIndex: 1, labelId: 'created-gym' },
      { date: '2026-07-01', slotIndex: 2, labelId: 'created-old hobby' },
    ]);
    expect(outcome).toMatchObject({ imported: 3, createdLabels: 2, restoredLabels: 0 });
  });

  it('maps a name resolved to an existing label without creating anything', async () => {
    const deps = makeDeps();
    const mapped = new Map<string, LabelResolution>([['gym', { action: 'map', labelId: 'l-other' }]]);
    const smallFile: ParsedImportFile = { format: 'sheets', days: [day('2026-07-01', { 0: 'gym' })] };

    const outcome = await commitImport(USER, smallFile, [], ['gym'], mapped, deps);

    expect(deps.createLabel).not.toHaveBeenCalled();
    expect(deps.written).toEqual([{ date: '2026-07-01', slotIndex: 0, labelId: 'l-other' }]);
    expect(outcome.createdLabels).toBe(0);
  });

  it('restores a soft-deleted label when create collides with one (C-32: history wins)', async () => {
    const deps = makeDeps({
      createLabel: vi.fn(async () => ({
        kind: 'restore-or-create' as const,
        deletedLabel: { id: 'l-dormant' } as never,
      })),
    });
    const smallFile: ParsedImportFile = { format: 'sheets', days: [day('2026-07-01', { 0: 'gym' })] };
    const create = new Map<string, LabelResolution>([['gym', { action: 'create', color: '#936600' }]]);

    const outcome = await commitImport(USER, smallFile, [], ['gym'], create, deps);

    expect(deps.restoreLabel).toHaveBeenCalledWith(USER, 'l-dormant');
    expect(deps.written).toEqual([{ date: '2026-07-01', slotIndex: 0, labelId: 'l-dormant' }]);
    expect(outcome).toMatchObject({ createdLabels: 0, restoredLabels: 1 });
  });

  it('asks for a re-run when a create races an identically-named active label', async () => {
    const deps = makeDeps({
      createLabel: vi.fn(async () => ({ kind: 'active-name-taken' as const })),
    });
    const smallFile: ParsedImportFile = { format: 'sheets', days: [day('2026-07-01', { 0: 'gym' })] };
    const create = new Map<string, LabelResolution>([['gym', { action: 'create', color: '#936600' }]]);

    await expect(commitImport(USER, smallFile, [], ['gym'], create, deps)).rejects.toThrow(/re-run/i);
    expect(deps.written).toEqual([]);
  });

  it('lets a bulk write failure propagate untouched for the caller to classify', async () => {
    const boom = Object.assign(new Error('fetch failed'), { kind: 'network' });
    const deps = makeDeps({
      bulkUpsertDirect: vi.fn(async () => {
        throw boom;
      }),
    });
    const smallFile: ParsedImportFile = { format: 'sheets', days: [day('2026-07-01', { 0: 'work' })] };

    await expect(
      commitImport(USER, smallFile, active, [], new Map(), deps),
    ).rejects.toBe(boom);
  });
});
