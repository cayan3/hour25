import { useEffect, useRef, useState } from 'react';
import { usePendingCount } from '../../hooks/useSync';
import { useQueueStatusStore } from '../../store/queueStatus';
import { loadLastSync } from '../../lib/lastSync';
import { localDateString } from '../../lib/time';

// DESIGN §7 (revised per Week 5 feedback): the chip is always visible so it
// never pops in and out of the header. Zero pending = a quiet synced state
// ("Synced HH:MM", word hidden on narrow screens); non-empty queue = count +
// state icon from queueStatus. The pending state is *debounced*: it appears
// only after the queue has been non-empty for a beat, and once shown it holds
// briefly — a ~100ms online flush never flickers the chip at all, while a
// real offline stretch shows honestly. The always-mounted polite live region
// announces the transitions ("3 entries pending sync" → "All entries synced")
// off the real queue state, not the debounced display.

const PENDING_SHOW_DELAY_MS = 400;
const PENDING_MIN_VISIBLE_MS = 600;

function entriesWord(n: number): string {
  return n === 1 ? 'entry' : 'entries';
}

// "10:43" for a same-day sync, "Jul 16, 10:43" otherwise. Display-only UI
// formatting — the C-45 no-locale rule is about stored dates, not chrome.
function formatSyncTime(ts: number): string {
  const d = new Date(ts);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (localDateString(d) === localDateString()) return time;
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`;
}

// Debounce the pending display so sub-second syncs never flash the chip.
function usePendingDisplay(pending: number): boolean {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef(0);

  useEffect(() => {
    if (pending > 0 && !visible) {
      const timer = setTimeout(() => {
        shownAt.current = Date.now();
        setVisible(true);
      }, PENDING_SHOW_DELAY_MS);
      return () => clearTimeout(timer);
    }
    if (pending === 0 && visible) {
      const remaining = Math.max(0, PENDING_MIN_VISIBLE_MS - (Date.now() - shownAt.current));
      const timer = setTimeout(() => setVisible(false), remaining);
      return () => clearTimeout(timer);
    }
  }, [pending, visible]);

  return visible;
}

export function SyncChip({ userId }: { userId: string }) {
  const pending = usePendingCount(userId);
  const status = useQueueStatusStore((s) => s.status);
  const lastSyncedAt = useQueueStatusStore((s) => s.lastSyncedAt) ?? loadLastSync(userId);
  const showPending = usePendingDisplay(pending);

  // During the brief hold after a drain, `pending` is already 0 — keep the
  // last real count on screen instead of flashing "0".
  const lastCount = useRef(0);
  if (pending > 0) lastCount.current = pending;
  const displayCount = pending > 0 ? pending : lastCount.current;

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
      {showPending ? (
        <span
          title={`${displayCount} ${entriesWord(displayCount)} pending sync (${stateLabel})`}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-300 px-2.5 py-1 text-xs tabular-nums text-slate-600 dark:border-slate-600 dark:text-slate-300"
        >
          {state === 'syncing' ? <SpinnerIcon /> : state === 'auth' ? <KeyIcon /> : <CloudOffIcon />}
          {displayCount}
          <span className="sr-only">
            {entriesWord(displayCount)} pending sync, {stateLabel}
          </span>
        </span>
      ) : (
        <span
          title={
            lastSyncedAt
              ? `All entries synced — last sync ${formatSyncTime(lastSyncedAt)}`
              : 'All entries synced'
          }
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-transparent px-2.5 py-1 text-xs tabular-nums text-slate-400 dark:text-slate-500"
        >
          <CloudCheckIcon />
          {/* The word squeezes out on narrow screens; the time stays. */}
          <span className="hidden sm:inline">Synced</span>
          {lastSyncedAt !== null && formatSyncTime(lastSyncedAt)}
          <span className="sr-only">all entries synced</span>
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

// Same cloud silhouette as the offline icon (Week 5 feedback: cohesion), with
// a check instead of the slash.
function CloudCheckIcon() {
  return (
    <svg {...iconProps}>
      <path d="M17.5 19a4.5 4.5 0 1 0-.42-8.98A6 6 0 0 0 5.34 12.06 3.5 3.5 0 0 0 6.5 19h11z" />
      <path d="m9 15 2 2 4-4" />
    </svg>
  );
}

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
