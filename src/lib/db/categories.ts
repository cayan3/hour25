import { supabase } from '../supabase';
import { classifyError } from './errors';
import type { Database } from '../database.types';

export type CategoryRow = Database['public']['Tables']['categories']['Row'];

export async function listCategories(userId: string): Promise<CategoryRow[]> {
  const { data, error } = await supabase
    .from('categories')
    .select()
    .eq('user_id', userId)
    .order('name', { ascending: true });
  if (error) throw Object.assign(error, { kind: classifyError(error) });
  return data;
}

export type CreateCategoryResult =
  | { kind: 'created'; category: CategoryRow }
  // Case-insensitive unique index violation (C-32) — no soft delete on
  // categories in v1, so this is always a plain "name taken", never a restore.
  | { kind: 'name-taken' };

export async function createCategory(
  userId: string,
  name: string,
  color: string,
): Promise<CreateCategoryResult> {
  const { data, error } = await supabase
    .from('categories')
    .insert({ user_id: userId, name: name.trim(), color })
    .select()
    .single();
  if (!error) return { kind: 'created', category: data };
  if (error.code === '23505') return { kind: 'name-taken' };
  throw Object.assign(error, { kind: classifyError(error) });
}

export type UpdateCategoryResult =
  | { kind: 'updated'; category: CategoryRow }
  | { kind: 'name-taken' };

export async function updateCategory(
  userId: string,
  id: string,
  updates: { name?: string; color?: string },
): Promise<UpdateCategoryResult> {
  const patch: { name?: string; color?: string } = { ...updates };
  if (patch.name !== undefined) patch.name = patch.name.trim();

  const { data, error } = await supabase
    .from('categories')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select();
  if (error) {
    if (error.code === '23505') return { kind: 'name-taken' };
    throw Object.assign(error, { kind: classifyError(error) });
  }
  if (!data || data.length === 0) {
    throw new Error('updateCategory: no matching category (wrong user or unknown id)');
  }
  return { kind: 'updated', category: data[0] };
}

// No soft delete on categories in v1 (SPEC.md §2) — labels referencing a
// deleted category fall back to `category_id: null` via the FK's on-delete-set-null.
export async function deleteCategory(userId: string, id: string): Promise<void> {
  const { data, error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .select();
  if (error) throw Object.assign(error, { kind: classifyError(error) });
  if (!data || data.length === 0) {
    throw new Error('deleteCategory: no matching category (wrong user or unknown id)');
  }
}
