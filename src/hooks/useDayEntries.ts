import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import Dexie from 'dexie';
import { offlineDB } from '../lib/offline/store';
import { getEntriesForRange } from '../lib/db/entries';
import { mergePending, type MergedEntry } from '../lib/merge';

// The overlay (C-26): the UI never renders server entries directly. Every
// read surface renders the merge of the persisted server cache and the live
// pending queue, so a tap is visible instantly and survives restart/offline.
export function useDayEntries(userId: string, date: string): MergedEntry[] {
  const server = useQuery({
    queryKey: ['entries', date],
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
