import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FakeTable, fakeSupabaseClient } from '../../helpers/fakeSupabase';

let labelsTable: FakeTable;

vi.mock('../../../src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => fakeSupabaseClient({ labels: labelsTable }).from(table),
  },
}));

import {
  createLabel,
  insertLabelForRestore,
  softDeleteLabel,
  restoreLabel,
  updateLabel,
} from '../../../src/lib/db/labels';

const USER = 'user-1';

beforeEach(() => {
  labelsTable = new FakeTable([
    { id: 'label-active', user_id: USER, category_id: null, name: 'Work', color: '#111111', deleted_at: null, created_at: null },
    {
      id: 'label-deleted',
      user_id: USER,
      category_id: null,
      name: 'Gaming',
      color: '#222222',
      deleted_at: '2026-06-01T00:00:00.000Z',
      created_at: null,
    },
  ]);
});

describe('createLabel — restore-or-create flow (C-32)', () => {
  it('surfaces restore-or-create when the name case-insensitively matches a soft-deleted label', async () => {
    const result = await createLabel(USER, 'gaming', '#333333');
    expect(result).toEqual({
      kind: 'restore-or-create',
      deletedLabel: expect.objectContaining({ id: 'label-deleted', name: 'Gaming' }),
    });
    // Must not have inserted a new row alongside the soft-deleted one.
    expect(labelsTable.rows.filter((r) => (r.name as string).toLowerCase() === 'gaming')).toHaveLength(1);
  });

  it('creates a brand new label when no name collision exists', async () => {
    const result = await createLabel(USER, 'Reading', '#444444');
    expect(result.kind).toBe('created');
    if (result.kind === 'created') {
      expect(result.label).toMatchObject({ user_id: USER, name: 'Reading', color: '#444444', deleted_at: null });
    }
  });

  it('reports active-name-taken when the name matches a currently-active label (no restore option)', async () => {
    const result = await createLabel(USER, 'work', '#555555');
    expect(result).toEqual({ kind: 'active-name-taken' });
  });
});

describe('softDeleteLabel — zero-rows-affected guard', () => {
  it('soft-deletes an active label and returns it', async () => {
    const row = await softDeleteLabel(USER, 'label-active');
    expect(row.deleted_at).not.toBeNull();
  });

  it('throws rather than silently succeeding when the label is already deleted', async () => {
    await expect(softDeleteLabel(USER, 'label-deleted')).rejects.toThrow(/no matching active label/);
  });

  it('throws rather than silently succeeding for an unknown id', async () => {
    await expect(softDeleteLabel(USER, 'does-not-exist')).rejects.toThrow(/no matching active label/);
  });

  it('throws rather than silently succeeding for another user\'s label', async () => {
    await expect(softDeleteLabel('someone-else', 'label-active')).rejects.toThrow(/no matching active label/);
  });
});

describe('restoreLabel — rename-on-collision', () => {
  it('restores a soft-deleted label when its name is free', async () => {
    const result = await restoreLabel(USER, 'label-deleted');
    expect(result).toEqual({ kind: 'restored', label: expect.objectContaining({ id: 'label-deleted', deleted_at: null }) });
  });

  it('forces a rename when restoring would collide with an active label', async () => {
    labelsTable.rows.push({
      id: 'label-deleted-2',
      user_id: USER,
      category_id: null,
      name: 'Work',
      color: '#666666',
      deleted_at: '2026-06-01T00:00:00.000Z',
      created_at: null,
    });
    const result = await restoreLabel(USER, 'label-deleted-2');
    expect(result).toEqual({
      kind: 'active-name-collision',
      conflictingLabel: expect.objectContaining({ id: 'label-active', name: 'Work' }),
    });
  });

  it('accepts a rename that resolves the collision', async () => {
    labelsTable.rows.push({
      id: 'label-deleted-2',
      user_id: USER,
      category_id: null,
      name: 'Work',
      color: '#666666',
      deleted_at: '2026-06-01T00:00:00.000Z',
      created_at: null,
    });
    const result = await restoreLabel(USER, 'label-deleted-2', 'Work (old)');
    expect(result).toEqual({
      kind: 'restored',
      label: expect.objectContaining({ id: 'label-deleted-2', name: 'Work (old)', deleted_at: null }),
    });
  });
});

describe('updateLabel — rename/recolor', () => {
  it('recolors a label without touching its name', async () => {
    const result = await updateLabel(USER, 'label-active', { color: '#abcdef' });
    expect(result).toEqual({ kind: 'updated', label: expect.objectContaining({ id: 'label-active', name: 'Work', color: '#abcdef' }) });
  });

  it('renames a label to a free name', async () => {
    const result = await updateLabel(USER, 'label-active', { name: 'Deep work' });
    expect(result).toEqual({ kind: 'updated', label: expect.objectContaining({ name: 'Deep work' }) });
  });

  it('reports name-taken when renaming to another active label\'s name', async () => {
    labelsTable.rows.push({ id: 'label-active-2', user_id: USER, category_id: null, name: 'Reading', color: '#777777', deleted_at: null, created_at: null });
    const result = await updateLabel(USER, 'label-active-2', { name: 'Work' });
    expect(result).toEqual({ kind: 'name-taken' });
  });

  it('throws for an unknown id', async () => {
    await expect(updateLabel(USER, 'does-not-exist', { color: '#000000' })).rejects.toThrow(/no matching label/);
  });
});

describe('insertLabelForRestore — JSON restore path', () => {
  it('preserves the soft-deleted state from the backup instead of resetting it', async () => {
    const row = await insertLabelForRestore(USER, {
      name: 'retired habit',
      color: '#5a5a5a',
      categoryId: null,
      deletedAt: '2026-05-01T00:00:00.000Z',
    });
    expect(row.deleted_at).toBe('2026-05-01T00:00:00.000Z');
    expect(row.name).toBe('retired habit');
  });
});
