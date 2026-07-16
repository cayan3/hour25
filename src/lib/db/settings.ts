import { supabase } from '../supabase';
import { classifyError } from './errors';
import type { Database } from '../database.types';

export type UserSettingsRow = Database['public']['Tables']['user_settings']['Row'];

export async function getSettings(userId: string): Promise<UserSettingsRow | null> {
  const { data, error } = await supabase.from('user_settings').select().eq('user_id', userId).maybeSingle();
  if (error) throw Object.assign(error, { kind: classifyError(error) });
  return data;
}

// Called once on first authenticated load (§12). ignoreDuplicates means an
// existing row for this user is left completely untouched — this never
// overwrites a returning user's settings, only creates the row the first
// time, writing the browser-detected zone rather than a hardcoded one (C-48).
export async function ensureUserSettings(userId: string, timezone: string): Promise<void> {
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: userId, timezone }, { onConflict: 'user_id', ignoreDuplicates: true });
  if (error) throw Object.assign(error, { kind: classifyError(error) });
}

type SettingsPatch = Partial<Omit<UserSettingsRow, 'id' | 'user_id' | 'created_at'>>;

export async function updateSettings(userId: string, patch: SettingsPatch): Promise<UserSettingsRow> {
  const { data, error } = await supabase
    .from('user_settings')
    .update(patch)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) throw Object.assign(error, { kind: classifyError(error) });
  return data;
}
