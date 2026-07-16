import { flushOnce, type FlushResult } from './flush';
import { offlineDB } from './store';
import { supabase } from '../supabase';

let inFlight: Promise<FlushResult> | null = null;

// Single-flight per tab + navigator.locks per origin (one flusher across
// tabs/PWA windows), straight-through fallback when locks are unavailable.
export function requestFlush(userId: string): Promise<FlushResult> {
  if (inFlight) return inFlight;
  const run = () => flushOnce(userId);
  inFlight = (typeof navigator !== 'undefined' && 'locks' in navigator
    ? navigator.locks.request('tt-flush', run)
    : run()
  )
    .catch(() => 'network' as const) // never an unhandled rejection
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

async function queueNonEmpty(): Promise<boolean> {
  return (await offlineDB.writes.count()) > 0;
}

// Triggers: online, tab becomes visible, SIGNED_IN/TOKEN_REFRESHED, a 30s
// timer while the queue is non-empty, and once at startup. Returns a
// disposer that removes every listener/timer (React StrictMode double-invokes
// effects in dev; without this, wiring would double-register).
export function initOfflineSync(getUserId: () => string | null): () => void {
  const kick = (): void => {
    const uid = getUserId();
    if (uid) requestFlush(uid);
  };

  const onVisibility = (): void => {
    if (document.visibilityState === 'visible') kick();
  };

  window.addEventListener('online', kick);
  document.addEventListener('visibilitychange', onVisibility);

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') kick();
  });

  const interval = setInterval(() => {
    queueNonEmpty().then((nonEmpty) => {
      if (nonEmpty) kick();
    });
  }, 30_000);

  kick(); // app startup

  return () => {
    window.removeEventListener('online', kick);
    document.removeEventListener('visibilitychange', onVisibility);
    subscription.unsubscribe();
    clearInterval(interval);
  };
}
