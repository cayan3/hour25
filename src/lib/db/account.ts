import { supabase } from '../supabase';
import { classifyError } from './errors';

// The two "Your data" actions, as security definer Postgres functions
// (migration 006). The client cannot do this work with ordinary table writes:
// there is no DELETE grant on labels or user_settings, and auth.users is not
// reachable from the client at all.
//
// Note the deliberate break with the rest of src/lib/db/: no userId parameter.
// The functions take none — the account is auth.uid() server-side, so there is
// nothing a caller could pass that would widen the scope to someone else's
// data.

// Deletes every entry, label and category, and clears the settings that make
// the account look used (sleep label, onboarded_at). The auth user survives,
// so the session does too.
export async function resetMyData(): Promise<void> {
  const { error } = await supabase.rpc('reset_my_data');
  if (error) throw Object.assign(error, { kind: classifyError(error) });
}

// The same, plus the auth user. The session is dead once this returns, so the
// caller must sign out afterwards.
export async function deleteMyAccount(): Promise<void> {
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw Object.assign(error, { kind: classifyError(error) });
}
