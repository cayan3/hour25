import { supabase } from '../supabase';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

// Components never import @supabase/supabase-js directly (CLAUDE.md) — the
// session type they need is re-exported from here instead.
export type { Session };

// §12: Google OAuth via Supabase Auth. supabase-js persists the session in
// localStorage and refreshes tokens automatically while the app runs.
export async function signInWithGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  // Sign-out must never touch the offline queue (CLAUDE.md) — this call
  // clears the Supabase session only.
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void,
): { data: { subscription: { unsubscribe: () => void } } } {
  return supabase.auth.onAuthStateChange(callback);
}
