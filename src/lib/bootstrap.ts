import type { QueryClient } from '@tanstack/react-query';

// Query prefixes refreshed on every boot and sign-in.
//
// C-56 established this for settings/labels/labels-all/categories: the
// persisted cache (§7.4) can outlive its truth, and the 60s staleTime (C-35)
// is a freshness bound for multi-device drift, not a reason to keep serving a
// snapshot after a boot.
//
// `entries` joined them for a sharper case of the same failure. The persister
// throttles its writes, so for about a second after a flush the dump on disk
// still holds the PRE-flush snapshot. A reload inside that window restores it
// with its original `dataUpdatedAt`, staleTime then treats it as fresh and no
// refetch is issued — and because the queue has just drained, the overlay adds
// nothing back on top. The day comes back empty and stays empty until a window
// focus or the 60s bound expires. Boot must not trust persisted entries as
// fresh; one day-sized request is a cheap price for never showing a day the
// app itself has already superseded.
//
// Note that invalidating does not discard anything — the cached data stays on
// screen while the refetch runs, and offline the refetch simply pauses
// (queries keep React Query's pausing network mode, C-72), so a cold offline
// boot still renders the persisted day.
export const BOOTSTRAP_PREFIXES = ['settings', 'labels', 'labels-all', 'categories', 'entries'] as const;

// Every key is user-scoped: the persisted cache is shared by every account
// that signs in on this browser, so one account's boot must never reach into
// another's cached data.
export async function bootstrapAccountCache(client: QueryClient, userId: string): Promise<void> {
  await Promise.all(
    BOOTSTRAP_PREFIXES.map((prefix) => client.invalidateQueries({ queryKey: [prefix, userId] })),
  );
}
