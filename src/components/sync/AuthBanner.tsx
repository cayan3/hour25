import { useEffect, useState } from 'react';
import { signInWithGoogle } from '../../lib/db/auth';
import { usePendingCount } from '../../hooks/useSync';
import { useQueueStatusStore } from '../../store/queueStatus';
import { toFriendlyErrorMessage } from '../../lib/errorMessage';

// DESIGN §7 / SPEC §12: when flush hits an auth failure with queued writes,
// this persistent (dismissable) banner appears — "Sign in again to sync N
// saved entries". It never blocks the grid: logging keeps working and keeps
// queueing while it's up. Dismissal lasts until the next auth episode.
export function AuthBanner({ userId }: { userId: string }) {
  const status = useQueueStatusStore((s) => s.status);
  const pending = usePendingCount(userId);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // An auth episode only genuinely ends on a successful flush ('idle'). The
    // retry loop blips 'flushing' every ~30s in the revoked-token case (session
    // present locally, server 401s) — resetting on any non-auth status re-armed
    // a dismissed banner on every one of those blips.
    if (status === 'idle') setDismissed(false);
  }, [status]);

  if (status !== 'auth' || pending === 0 || dismissed) return null;

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
    >
      <p>
        Sign in again to sync {pending} saved {pending === 1 ? 'entry' : 'entries'}.
        {error && <span className="ml-2">{error}</span>}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            setError(null);
            signInWithGoogle().catch((e) => setError(toFriendlyErrorMessage(e)));
          }}
          className="min-h-11 touch-manipulation rounded px-3 font-medium underline focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="min-h-11 touch-manipulation rounded px-2 focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
