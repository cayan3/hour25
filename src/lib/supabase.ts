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
