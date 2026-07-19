import { QueryClient, type QueryKey } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { get, set, del } from 'idb-keyval';
import { CACHE_BUSTER } from './constants';

// §7.5: freshness is specified, not defaulted. Multi-device (phone + laptop)
// is normal use — stale data must not sit on screen all day.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
    // 'always' opts mutations out of React Query's offline pausing: with the
    // 'online' default, going offline paused every mutation before its
    // mutationFn ran — Settings/label/category saves froze with no error, then
    // silently replayed on reconnect. These writes are online-only by design
    // and must fail fast into their catch handlers instead. Queries keep the
    // pausing default on purpose: offline reads serve the persisted cache and
    // resume refetching on reconnect rather than flashing error states.
    mutations: { networkMode: 'always' },
  },
});

// idb-keyval's get/set/del adapted to the getItem/setItem/removeItem shape
// createAsyncStoragePersister expects.
const persister = createAsyncStoragePersister({
  storage: {
    getItem: (key: string) => get(key),
    setItem: (key: string, value: string) => set(key, value),
    removeItem: (key: string) => del(key),
  },
});

// Only these query-key prefixes are persisted (§7.4) — stats (Phase 2) and
// anything else stays server-cache-only, never written to IndexedDB.
const PERSISTED_PREFIXES = ['entries', 'labels', 'categories', 'settings'];

function isPersistedKey(queryKey: QueryKey): boolean {
  const [prefix] = queryKey;
  return typeof prefix === 'string' && PERSISTED_PREFIXES.some((p) => prefix.startsWith(p));
}

persistQueryClient({
  queryClient,
  persister,
  buster: CACHE_BUSTER,
  maxAge: 30 * 24 * 60 * 60 * 1000,
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => isPersistedKey(query.queryKey),
  },
});
