import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { getCurrentSession, onAuthStateChange, signOut } from './lib/db/auth';
import { ensureUserSettings, getSettings } from './lib/db/settings';
import { configureSupabaseFlush } from './lib/offline/supabaseFlush';
import { initOfflineSync } from './lib/offline/sync';
import { queryClient } from './lib/queryClient';
import { SignInView } from './components/SignInView';
import { ThemeToggle } from './components/ThemeToggle';

type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; userId: string; email: string | null };

function toAuthState(session: Session | null): AuthState {
  return session
    ? { status: 'signed-in', userId: session.user.id, email: session.user.email ?? null }
    : { status: 'signed-out' };
}

// §12: upsert user_settings (ignoreDuplicates) on first authenticated load,
// writing the browser-detected timezone (C-48). Safe to call on every
// sign-in — a returning user's row is left untouched.
function bootstrapUserSettings(userId: string): void {
  ensureUserSettings(userId, Intl.DateTimeFormat().resolvedOptions().timeZone)
    .then(() => queryClient.invalidateQueries({ queryKey: ['settings', userId] }))
    .catch((e) => {
      console.error('ensureUserSettings failed', e);
    });
  if (window.location.pathname === '/auth/callback') {
    window.history.replaceState({}, '', '/');
  }
}

export default function App() {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' });
  const authRef = useRef<AuthState>(auth);
  authRef.current = auth;

  useEffect(() => {
    let cancelled = false;

    getCurrentSession().then((session) => {
      if (cancelled) return;
      const next = toAuthState(session);
      setAuth(next);
      if (next.status === 'signed-in') bootstrapUserSettings(next.userId);
    });

    const { data: sub } = onAuthStateChange((event, session) => {
      if (cancelled) return;
      const next = toAuthState(session);
      setAuth(next);
      if (event === 'SIGNED_IN' && next.status === 'signed-in') bootstrapUserSettings(next.userId);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    configureSupabaseFlush();
    return initOfflineSync(() => (authRef.current.status === 'signed-in' ? authRef.current.userId : null));
  }, []);

  if (auth.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
        <p className="text-slate-500 dark:text-slate-400">Loading…</p>
      </div>
    );
  }

  if (auth.status === 'signed-out') {
    return <SignInView />;
  }

  return <AuthenticatedShell userId={auth.userId} email={auth.email} />;
}

function AuthenticatedShell({ userId, email }: { userId: string; email: string | null }) {
  const { data: settings } = useQuery({
    queryKey: ['settings', userId],
    queryFn: () => getSettings(userId),
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-50">
      <header className="flex items-center justify-between p-4">
        <span className="text-sm text-slate-500 dark:text-slate-400">{email}</span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => signOut()}
            className="rounded px-3 py-1.5 text-sm hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-offset-2 dark:hover:bg-slate-800"
          >
            Sign out
          </button>
        </div>
      </header>
      <p className="p-4">Time Tracker — Phase 1 scaffold. Timezone: {settings?.timezone ?? '…'}</p>
    </div>
  );
}
