import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getCurrentSession, onAuthStateChange, signOut } from './lib/db/auth';
import { ensureUserSettings } from './lib/db/settings';
import { useSettings } from './hooks/useSettings';
import { configureSupabaseFlush } from './lib/offline/supabaseFlush';
import { initOfflineSync } from './lib/offline/sync';
import { queryClient } from './lib/queryClient';
import { SignInView } from './components/SignInView';
import { ThemeToggle } from './components/ThemeToggle';
import { TodayPlaceholder } from './components/TodayPlaceholder';
import { SettingsView } from './components/settings/SettingsView';
import { OnboardingWizard } from './components/onboarding/OnboardingWizard';

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
  const { data: settings } = useSettings(userId);
  const [view, setView] = useState<'today' | 'settings'>('today');

  if (!settings) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
        <p className="text-slate-500 dark:text-slate-400">Loading…</p>
      </div>
    );
  }

  // §12/C-38: onboarding shows iff onboarded_at is null; stamped on finish or
  // skip so it never re-triggers.
  if (settings.onboarded_at === null) {
    return (
      <OnboardingWizard
        userId={userId}
        initialSleepStart={settings.sleep_start}
        initialSleepEnd={settings.sleep_end}
        onDone={() => setView('today')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800">
        <nav className="flex gap-1">
          {(['today', 'settings'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setView(tab)}
              aria-current={view === tab ? 'page' : undefined}
              className={`rounded px-3 py-1.5 text-sm capitalize focus-visible:ring-2 focus-visible:ring-offset-2 ${
                view === tab
                  ? 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-50'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500 dark:text-slate-400">{email}</span>
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
      {view === 'today' ? <TodayPlaceholder userId={userId} /> : <SettingsView userId={userId} />}
    </div>
  );
}
