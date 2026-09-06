import { supabase } from '../supabase';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

// Components never import @supabase/supabase-js directly; all server access
// goes through src/lib/db/. The session type they need is re-exported here
// so no component has to reach past that boundary for a type alone.
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
  // Sign-out must never touch the offline queue: unsent writes belong to the
  // user, not to the session, and signing out on one device must not discard
  // work that has not reached the server. This clears the session only.
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
