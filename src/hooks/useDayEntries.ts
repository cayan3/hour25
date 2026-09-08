import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import Dexie from 'dexie';
import { offlineDB } from '../lib/offline/store';
import { getEntriesForRange } from '../lib/db/entries';
import { mergePending, mergePendingAllDates, type DatedEntry, type MergedEntry } from '../lib/merge';

// The overlay (C-26): the UI never renders server entries directly. Every
// read surface renders the merge of the persisted server cache and the live
// pending queue, so a tap is visible instantly and survives restart/offline.
export function useDayEntries(userId: string, date: string): MergedEntry[] {
  // userId is in the key, not just the queryFn: the cache is persisted to
  // IndexedDB and shared by every account that signs in on this browser. An
  // unscoped key hands the previous user's day to the next one — visibly,
  // since useQuery returns cached data while it refetches, and indefinitely
  // if the new user is offline (queries keep the pausing network mode).
  const server = useQuery({
    queryKey: ['entries', userId, date],
    queryFn: () => getEntriesForRange(userId, date, date),
    staleTime: 60_000,
  });

  const pending = useLiveQuery(
    () =>
      offlineDB.writes
        .where('[userId+date+slotIndex]')
        .between([userId, date, Dexie.minKey], [userId, date, Dexie.maxKey])
        .toArray(),
    [userId, date],
  );

  return useMemo(() => mergePending(server.data ?? [], pending ?? []), [server.data, pending]);
}

// The same overlay across a date range, for the stats surfaces (C-77): stats
// are derived from the cached entries, never from a server-side sum, because
// a pending write cannot be merged into a sum — the totals would disagree with
// the grid above them and would vanish offline. ['entries', …] is persisted,
// so this renders from IndexedDB on a cold offline start.
//
// Returns the query's pending flag alongside the rows, unlike useDayEntries:
// a day view can paint 48 dashed cells while it loads, but a percentage has
// no honest empty rendering — it would read 0% and then jump.
export function useRangeEntries(
  userId: string,
  start: string,
  end: string,
): { entries: DatedEntry[]; isPending: boolean } {
  const server = useQuery({
    queryKey: ['entries', userId, start, end],
    queryFn: () => getEntriesForRange(userId, start, end),
    staleTime: 60_000,
  });

  // Filter scan, not a compound-key range — same reason as listPendingWrites
  // and usePendingCount: the queue is small by design, and Dexie.minKey inside
  // a compound between() trips fake-indexeddb, making the range form untestable.
  const pending = useLiveQuery(
    () =>
      offlineDB.writes
        .filter((w) => w.userId === userId && w.date >= start && w.date <= end)
        .toArray(),
    [userId, start, end],
  );

  const entries = useMemo(
    () => mergePendingAllDates(server.data ?? [], pending ?? []),
    [server.data, pending],
  );

  return { entries, isPending: server.isPending };
}
