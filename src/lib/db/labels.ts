import { supabase } from '../supabase';
import { classifyError } from './errors';
import type { Database } from '../database.types';

export type LabelRow = Database['public']['Tables']['labels']['Row'];

const byNameAsc = { ascending: true } as const;

// Active only (pickers) — soft-deleted labels never appear here.
export async function listActiveLabels(userId: string): Promise<LabelRow[]> {
  const { data, error } = await supabase
    .from('labels')
    .select()
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('name', byNameAsc);
  if (error) throw Object.assign(error, { kind: classifyError(error) });
  return data;
}

// Includes soft-deleted — grid rendering and stats must resolve against this,
// never the active-only list, or deleted labels vanish from history (C-34/§7.5).
export async function listAllLabels(userId: string): Promise<LabelRow[]> {
  const { data, error } = await supabase
    .from('labels')
    .select()
    .eq('user_id', userId)
    .order('name', byNameAsc);
  if (error) throw Object.assign(error, { kind: classifyError(error) });
  return data;
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

async function findSoftDeletedByName(userId: string, name: string): Promise<LabelRow | null> {
  const all = await listAllLabels(userId);
  return all.find((l) => l.deleted_at !== null && sameName(l.name, name)) ?? null;
}

async function findActiveByName(userId: string, name: string, excludeId?: string): Promise<LabelRow | null> {
  const active = await listActiveLabels(userId);
  return active.find((l) => l.id !== excludeId && sameName(l.name, name)) ?? null;
}

export type CreateLabelResult =
  | { kind: 'created'; label: LabelRow }
  // A case-insensitive match against a soft-deleted label exists — the UI
  // must offer Restore (keeps history) or Create new (C-32; DESIGN.md §6).
  | { kind: 'restore-or-create'; deletedLabel: LabelRow }
  // Matches a currently-active label — nothing to restore, just blocked.
  | { kind: 'active-name-taken' };

// On a 23505 from labels_user_active_name, or a case-insensitive match against
// a soft-deleted label, surface the restore-or-create flow instead of letting
// a duplicate silently exist (C-32).
export async function createLabel(
  userId: string,
  name: string,
  color: string,
  categoryId: string | null = null,
): Promise<CreateLabelResult> {
  const trimmed = name.trim();

  const deletedMatch = await findSoftDeletedByName(userId, trimmed);
  if (deletedMatch) return { kind: 'restore-or-create', deletedLabel: deletedMatch };

  const { data, error } = await supabase
    .from('labels')
    .insert({ user_id: userId, name: trimmed, color, category_id: categoryId })
    .select()
    .single();
  if (!error) return { kind: 'created', label: data };

  if (error.code === '23505') {
    // Race: a soft delete or another create landed between our pre-check and insert.
    const raceMatch = await findSoftDeletedByName(userId, trimmed);
    if (raceMatch) return { kind: 'restore-or-create', deletedLabel: raceMatch };
    return { kind: 'active-name-taken' };
  }
  throw Object.assign(error, { kind: classifyError(error) });
}

// Must .select() the update and throw on zero affected rows — a no-op
// (already deleted, wrong user, unknown id) must never look like success.
export async function softDeleteLabel(userId: string, id: string): Promise<LabelRow> {
  const { data, error } = await supabase
    .from('labels')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select();
  if (error) throw Object.assign(error, { kind: classifyError(error) });
  if (!data || data.length === 0) {
    throw new Error('softDeleteLabel: no matching active label to delete (already deleted, wrong user, or unknown id)');
  }
  return data[0];
}

export type UpdateLabelResult =
  | { kind: 'updated'; label: LabelRow }
  // Rename collides with another currently-active label (23505 from the
  // same partial unique index createLabel checks) — never a restore
  // candidate here, since only createLabel offers that flow (C-32).
  | { kind: 'name-taken' };

// Rename / recolor / recategorize. Renaming to a name that only matches a
// soft-deleted label is allowed at the DB level (the unique index only
// covers active labels) and is not intercepted here — that ambiguity is
// createLabel's job, not this one's.
export async function updateLabel(
  userId: string,
  id: string,
  patch: { name?: string; color?: string; categoryId?: string | null },
): Promise<UpdateLabelResult> {
  const dbPatch: { name?: string; color?: string; category_id?: string | null } = {};
  if (patch.name !== undefined) dbPatch.name = patch.name.trim();
  if (patch.color !== undefined) dbPatch.color = patch.color;
  if (patch.categoryId !== undefined) dbPatch.category_id = patch.categoryId;

  const { data, error } = await supabase
    .from('labels')
    .update(dbPatch)
    .eq('id', id)
    .eq('user_id', userId)
    .select();
  if (error) {
    if (error.code === '23505') return { kind: 'name-taken' };
    throw Object.assign(error, { kind: classifyError(error) });
  }
  if (!data || data.length === 0) {
    throw new Error('updateLabel: no matching label (wrong user or unknown id)');
  }
  return { kind: 'updated', label: data[0] };
}

// JSON-restore only (SPEC §10): a raw insert that preserves the backup's
// soft-delete state and skips the restore-or-create flow — the empty-account
// guard upstream means there is nothing to collide with. Never called from
// the interactive create paths.
export async function insertLabelForRestore(
  userId: string,
  label: { name: string; color: string; categoryId: string | null; deletedAt: string | null },
): Promise<LabelRow> {
  const { data, error } = await supabase
    .from('labels')
    .insert({
      user_id: userId,
      name: label.name,
      color: label.color,
      category_id: label.categoryId,
      deleted_at: label.deletedAt,
    })
    .select()
    .single();
  if (error) throw Object.assign(error, { kind: classifyError(error) });
  return data;
}

export type RestoreLabelResult =
  | { kind: 'restored'; label: LabelRow }
  // Restoring into a live name collision forces a rename in the same dialog.
  | { kind: 'active-name-collision'; conflictingLabel: LabelRow };

export async function restoreLabel(
  userId: string,
  id: string,
  renameTo?: string,
): Promise<RestoreLabelResult> {
  const { data: deletedLabel, error: fetchError } = await supabase
    .from('labels')
    .select()
    .eq('id', id)
    .eq('user_id', userId)
    .single();
  if (fetchError) throw Object.assign(fetchError, { kind: classifyError(fetchError) });

  const targetName = (renameTo ?? deletedLabel.name).trim();
  const activeMatch = await findActiveByName(userId, targetName, id);
  if (activeMatch) return { kind: 'active-name-collision', conflictingLabel: activeMatch };

  const { data, error } = await supabase
    .from('labels')
    .update({ deleted_at: null, name: targetName })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) throw Object.assign(error, { kind: classifyError(error) });
  return { kind: 'restored', label: data };
}
