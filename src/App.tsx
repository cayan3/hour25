import { useEffect, useRef, useState } from 'react';
import { getCurrentSession, onAuthStateChange, signOut, type Session } from './lib/db/auth';
import { ensureUserSettings } from './lib/db/settings';
import { useSettings } from './hooks/useSettings';
import { configureSupabaseFlush } from './lib/offline/supabaseFlush';
import { initOfflineSync } from './lib/offline/sync';
import { queryClient } from './lib/queryClient';
import { SignInView } from './components/SignInView';
import { ThemeToggle } from './components/ThemeToggle';
import { UpdateToast } from './components/UpdateToast';
import { SyncChip } from './components/sync/SyncChip';
import { AuthBanner } from './components/sync/AuthBanner';
import { DeadLetterToast } from './components/sync/DeadLetterToast';
import { DayView } from './components/day/DayView';
import { SettingsView } from './components/settings/SettingsView';
import { OnboardingWizard } from './components/onboarding/OnboardingWizard';

function GearIcon() {
  return (
    <svg
      aria-hidden="true"
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

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
//
// Also force-invalidates labels/labels-all/categories alongside settings.
// Without this, those three rely purely on the default 60s staleTime — fine
// for normal multi-device drift, but it means a fresh app load can serve up
// to a minute of stale label/category data from the persisted cache even
// though `settings` (forced fresh here) already reflects reality. Cheap to
// do unconditionally on every boot/sign-in; keeps all four core queries in
// lockstep instead of settings alone jumping ahead.
function bootstrapUserSettings(userId: string): void {
  ensureUserSettings(userId, Intl.DateTimeFormat().resolvedOptions().timeZone)
    .then(() =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['settings', userId] }),
        queryClient.invalidateQueries({ queryKey: ['labels', userId] }),
        queryClient.invalidateQueries({ queryKey: ['labels-all', userId] }),
        queryClient.invalidateQueries({ queryKey: ['categories', userId] }),
      ]),
    )
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

  return (
    <>
      {auth.status === 'loading' && (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
          <p className="text-slate-500 dark:text-slate-400">Loading…</p>
        </div>
      )}
      {auth.status === 'signed-out' && <SignInView />}
      {auth.status === 'signed-in' && <AuthenticatedShell userId={auth.userId} email={auth.email} />}
      {/* Outside the auth branches: a waiting update is worth offering on the
          sign-in screen too, and remounting the toast on sign-in would drop a
          prompt the user had already dismissed. */}
      <UpdateToast />
    </>
  );
}

function AuthenticatedShell({ userId, email }: { userId: string; email: string | null }) {
  const { data: settings } = useSettings(userId);
  const [view, setView] = useState<'today' | 'settings'>('today');
  const [setAsideReveal, setSetAsideReveal] = useState(0);

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
    // overflow-x-clip: nothing inside may widen the page past the viewport —
    // an overflowing child would otherwise leave an unpainted strip beyond
    // this div's background (found on a phone: the account email pushed the
    // header wide and the right fifth of the page went white in dark mode).
    // `clip` rather than `hidden` so position:sticky descendants keep working.
    <div className="min-h-screen overflow-x-clip bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-50">
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 p-3 sm:p-4 dark:border-slate-800">
        <nav className="flex gap-1">
          {(['today', 'settings'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setView(tab)}
              aria-current={view === tab ? 'page' : undefined}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm capitalize focus-visible:ring-2 focus-visible:ring-offset-2 ${
                view === tab
                  ? 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-50'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {tab === 'settings' && <GearIcon />}
              {tab}
            </button>
          ))}
        </nav>
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          {/* Chip left of the email (Week 5 feedback): its state changes must
              not shove the rest of the header around. */}
          <SyncChip userId={userId} />
          <span className="hidden max-w-56 truncate text-sm text-slate-500 dark:text-slate-400 sm:block">
            {email}
          </span>
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
      <AuthBanner userId={userId} />
      {view === 'today' ? (
        <DayView userId={userId} onOpenSettings={() => setView('settings')} />
      ) : (
        <SettingsView
          userId={userId}
          revealSetAsideNonce={setAsideReveal}
          // One-shot: without this reset, a remounting SettingsView re-consumes
          // the old nonce and every later Settings visit jumps to Set-aside.
          onRevealSetAsideHandled={() => setSetAsideReveal(0)}
        />
      )}
      <DeadLetterToast
        onOpenSettings={() => {
          setView('settings');
          // Also expand + scroll to the set-aside section — Details used to
          // be a silent no-op when already on Settings with it collapsed.
          setSetAsideReveal((n) => n + 1);
        }}
      />
    </div>
  );
}
