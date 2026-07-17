import { useLiveQuery } from 'dexie-react-hooks';
import { offlineDB, type DeadWrite } from '../lib/offline/store';
import { retryDeadWrite, discardDeadWrite } from '../lib/offline/deadLetters';

// Sync-surface hooks (DESIGN §7): the live pending count and the set-aside
// rows. Components read these plus the queueStatus store — no component
// invents its own sync logic or touches Dexie directly.

export function usePendingCount(userId: string): number {
  // Filter scan, not a compound-key range: the queue drains in ~100ms online
  // and stays small offline, and fake-indexeddb rejects Dexie.minKey
  // (-Infinity) inside a compound range, so the range form is untestable.
  return (
    useLiveQuery(() => offlineDB.writes.filter((r) => r.userId === userId).count(), [userId]) ?? 0
  );
}

export function useSetAside(userId: string) {
  const deadRows =
    useLiveQuery(async () => {
      const rows = await offlineDB.dead.orderBy('failedAt').reverse().toArray();
      return rows.filter((r) => r.userId === userId);
    }, [userId]) ?? [];

  return {
    deadRows,
    retry: (row: DeadWrite) => retryDeadWrite(userId, row),
    discard: (row: DeadWrite) => discardDeadWrite(userId, row),
  };
}
