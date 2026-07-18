export type WriteFailure = 'network' | 'auth' | 'permanent';

// Status and Postgres code only — never inspect `message` (C-33).
export function classifyError(e: unknown): WriteFailure {
  const err = e as { code?: string; status?: number } | null;
  if (err?.status === 401 || err?.code === 'PGRST301') return 'auth';
  if (err?.status === 408 || err?.status === 429) return 'network'; // timeouts / rate limits: retry
  // Postgres codes are strings. The string check matters: DOMException carries
  // a legacy NUMERIC code (TimeoutError = 23, QuotaExceededError = 22) that the
  // regex would coerce and match — dead-lettering healthy rows on a timeout if
  // a raw exception ever reached here unwrapped.
  if (typeof err?.code === 'string' && /^(22|23|42)/.test(err.code)) return 'permanent'; // data, integrity, access/undefined
  if (err?.status === 403) return 'permanent'; // RLS denial on own data = bug, not retry fodder
  if (typeof err?.status === 'number' && err.status >= 400 && err.status < 500) return 'permanent';
  return 'network'; // 5xx, thrown fetch, unknown → retriable
}
