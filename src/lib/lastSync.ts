const KEY_PREFIX = 'last-sync:';

// Last time a flush confirmed sends for this user (Week 5 feedback: the chip
// shows sync state at all times, with the last-synced time). Persisted
// per-user in localStorage so the timestamp survives reloads; corrupt or
// unavailable storage degrades to "unknown", never throws (mru.ts pattern).

export function loadLastSync(userId: string): number | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + userId);
    const ts = raw === null ? NaN : Number(raw);
    return Number.isFinite(ts) ? ts : null;
  } catch {
    return null;
  }
}

export function recordLastSync(userId: string, ts: number): void {
  try {
    localStorage.setItem(KEY_PREFIX + userId, String(ts));
  } catch {
    // Storage unavailable — the in-memory store value still covers the session.
  }
}
