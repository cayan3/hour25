import { useEffect, useRef, useState } from 'react';
import { useQueueStatusStore } from '../../store/queueStatus';

const TOAST_WINDOW_MS = 10_000;

// DESIGN §7: when a write is dead-lettered, the affected cell has already
// reverted (the overlay dropped the queue row); this toast is how the user
// finds out — "N entries couldn't sync and were set aside" with a details
// link to Settings → Set-aside entries. Watches deadCount from queueStatus
// (published by flush and the set-aside actions) and fires on increases.
export function DeadLetterToast({ onOpenSettings }: { onOpenSettings: () => void }) {
  const deadCount = useQueueStatusStore((s) => s.deadCount);
  const prev = useRef(deadCount);
  const [toast, setToast] = useState<{ delta: number; nonce: number } | null>(null);

  useEffect(() => {
    if (deadCount > prev.current) {
      const delta = deadCount - prev.current;
      setToast((t) => ({ delta, nonce: (t?.nonce ?? 0) + 1 }));
    }
    prev.current = deadCount;
  }, [deadCount]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [toast?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!toast) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg bg-slate-900 px-4 py-2.5 text-sm text-slate-50 shadow-lg dark:bg-slate-50 dark:text-slate-900"
    >
      <span>
        {toast.delta === 1
          ? '1 entry couldn’t sync and was set aside'
          : `${toast.delta} entries couldn’t sync and were set aside`}
      </span>
      <button
        type="button"
        onClick={() => {
          setToast(null);
          onOpenSettings();
        }}
        className="min-h-11 rounded px-2 font-medium text-sky-300 focus-visible:ring-2 focus-visible:ring-offset-2 dark:text-sky-700"
      >
        Details
      </button>
      <button
        type="button"
        onClick={() => setToast(null)}
        aria-label="Dismiss"
        className="min-h-11 rounded px-1 text-slate-400 focus-visible:ring-2 focus-visible:ring-offset-2 dark:text-slate-500"
      >
        ✕
      </button>
    </div>
  );
}
