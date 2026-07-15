import { flushOnce, type FlushResult } from './flush';

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
