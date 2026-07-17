import { useEffect, useRef, useState } from 'react';
import { usePendingCount } from '../../hooks/useSync';
import { useQueueStatusStore } from '../../store/queueStatus';

// DESIGN §7: a small persistent chip (icon + count) while the queue is
// non-empty; hidden at zero. States from queueStatus: syncing (subtle
// spinner), offline (cloud-off), auth (key — the banner carries the action).
// The always-mounted polite live region announces the transitions
// ("3 entries pending sync" → "All entries synced") — it must outlive the
// visible chip or the "synced" announcement would never be read.

function entriesWord(n: number): string {
  return n === 1 ? 'entry' : 'entries';
}

export function SyncChip({ userId }: { userId: string }) {
  const pending = usePendingCount(userId);
  const status = useQueueStatusStore((s) => s.status);

  const [announcement, setAnnouncement] = useState('');
  const prevPending = useRef(0);
  useEffect(() => {
    if (pending > 0 && prevPending.current === 0) {
      setAnnouncement(`${pending} ${entriesWord(pending)} pending sync`);
    } else if (pending === 0 && prevPending.current > 0) {
      setAnnouncement('All entries synced');
    }
    prevPending.current = pending;
  }, [pending]);

  const state = status === 'flushing' ? 'syncing' : status === 'auth' ? 'auth' : 'offline';
  const stateLabel =
    state === 'syncing' ? 'syncing' : state === 'auth' ? 'sign-in needed' : 'waiting to sync';

  return (
    <>
      <span aria-live="polite" role="status" className="sr-only">
        {announcement}
      </span>
      {pending > 0 && (
        <span
          title={`${pending} ${entriesWord(pending)} pending sync (${stateLabel})`}
          className="flex items-center gap-1.5 rounded-full border border-slate-300 px-2.5 py-1 text-xs tabular-nums text-slate-600 dark:border-slate-600 dark:text-slate-300"
        >
          {state === 'syncing' ? <SpinnerIcon /> : state === 'auth' ? <KeyIcon /> : <CloudOffIcon />}
          {pending}
          <span className="sr-only">
            {entriesWord(pending)} pending sync, {stateLabel}
          </span>
        </span>
      )}
    </>
  );
}

const iconProps = {
  'aria-hidden': true,
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function CloudOffIcon() {
  return (
    <svg {...iconProps}>
      <path d="M7.9 7.1A6 6 0 0 1 17.08 10H17.5a4.5 4.5 0 0 1 2.9 7.94" />
      <path d="M5.34 9.06A3.5 3.5 0 0 0 6.5 16H15" />
      <line x1="3" y1="3" x2="21" y2="21" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="7.5" cy="15.5" r="3.5" />
      <path d="M10.3 12.7 21 2m-3 3 3 3" />
    </svg>
  );
}

function SpinnerIcon() {
  // Three-quarter arc; spins only under motion-safe — the chip's text carries
  // the state either way, so a static arc still reads fine.
  return (
    <svg {...iconProps} className="motion-safe:animate-spin">
      <path d="M21 12a9 9 0 1 1-9-9" />
    </svg>
  );
}
