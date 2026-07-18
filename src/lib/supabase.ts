import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// Every request times out instead of hanging: supabase-js sets no fetch
// timeout, so on a flaky/offline connection (especially mobile) an awaited
// mutation could pend indefinitely — Settings buttons froze mid-press with no
// error and no way for the C-56 catch paths to ever run (Week 5 feedback).
// An abort rejects the promise, classifyError reads it as 'network', and the
// existing per-callsite handlers surface a visible message. 15s leaves slack
// for the import path's 500-row batches on slow links. Entry writes are
// unaffected in substance: flush classifies the abort as network and the
// queue simply retries later.
// Known gaps this wrapper does NOT cover:
// - supabase-js awaits the access token (auth.getSession()) BEFORE calling
//   this fetch, so a hang inside GoTrueClient's session-refresh path never
//   starts this clock — see STATUS.md's open bug. That includes flush: its
//   getSession dep goes through the same layer.
// - postgrest-js internally retries GET/HEAD/OPTIONS up to 3× (1s/2s/4s
//   backoff) on fetch rejections, and its abort guard doesn't recognize the
//   TimeoutError this wrapper produces — a hung READ settles after ~67s
//   worst case, not 15s. Mutations aren't retried, so 15s holds for writes.
const REQUEST_TIMEOUT_MS = 15_000;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal =
    init?.signal && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([init.signal, timeout])
      : (init?.signal ?? timeout);
  return fetch(input, { ...init, signal });
}

export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { global: { fetch: fetchWithTimeout } },
);
