import { expect, type Locator, type Page } from '@playwright/test';
import { localDateString } from '../../../src/lib/time';

export const OFFLINE_DB = 'time-tracker-offline';
// idb-keyval's defaults, which is where the persisted query cache (§7.4) lands.
const KEYVAL_DB = 'keyval-store';
const KEYVAL_STORE = 'keyval';
const QUERY_CACHE_KEY = 'REACT_QUERY_OFFLINE_CACHE';

export function today(): string {
  return localDateString();
}

// DESIGN §10's accessible-name format, restated here rather than imported from
// slotNames.ts on purpose: a spec that calls the app's own name builder would
// agree with it however it changed. This is the string a screen reader gets.
function slotTime(index: number): string {
  const total = index * 30;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function slotRange(index: number): string {
  return `${slotTime(index)} to ${slotTime(index + 1)}`;
}

export function untrackedSlot(page: Page, index: number): Locator {
  return page.getByRole('gridcell', { name: `${slotRange(index)}, untracked`, exact: true });
}

export function loggedSlot(page: Page, index: number, labelName: string): Locator {
  return page.getByRole('gridcell', { name: `${slotRange(index)}, ${labelName}`, exact: true });
}

/** The always-mounted polite live region in the header (DESIGN §7). Scoped to
 *  the header because the update toast and the day view own `status`/`alert`
 *  roles of their own. */
export function syncAnnouncer(page: Page): Locator {
  return page.locator('header').getByRole('status');
}

export async function waitForDayView(page: Page, date = today()): Promise<void> {
  await expect(page.getByRole('grid', { name: `Day grid for ${date}` })).toBeVisible();
}

/** Log a slot the way a person does: click the cell, pick the label. */
export async function logSlot(page: Page, index: number, labelName: string): Promise<void> {
  await untrackedSlot(page, index).click();
  const picker = page.getByRole('dialog', { name: `Label for ${slotRange(index)}` });
  await expect(picker).toBeVisible();
  // .first(): once a label is in the MRU the picker lists it twice on purpose
  // (the Recent group, then the full list, DESIGN §4). A person clicks one of
  // them; which one is not what these specs are about.
  await picker.getByRole('option', { name: labelName, exact: true }).first().click();
  await expect(picker).toBeHidden();
}

export interface PendingRow {
  userId: string;
  date: string;
  slotIndex: number;
  op: 'upsert' | 'delete';
  labelId: string | null;
  rev: string;
  attempts: number;
}

/**
 * The write-ahead queue itself, read straight out of IndexedDB.
 *
 * The specs assert on this rather than on the sync chip because the chip is
 * debounced (C-67: ~400ms before it appears, ≥600ms hold), so a fast sync
 * legitimately never renders it — "the chip was not there" proves nothing
 * either way. The queue is the state the architecture is actually about.
 */
export async function pendingWrites(page: Page): Promise<PendingRow[]> {
  return page.evaluate(async (dbName) => {
    // Never open by name blind: opening a database that does not exist creates
    // an empty version 1, and Dexie would then find its own version 1 already
    // present with none of its object stores in it.
    const existing = await indexedDB.databases();
    if (!existing.some((d) => d.name === dbName)) return [];
    return new Promise<PendingRow[]>((resolve, reject) => {
      const open = indexedDB.open(dbName);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains('writes')) {
          db.close();
          resolve([]);
          return;
        }
        const req = db.transaction('writes', 'readonly').objectStore('writes').getAll();
        req.onsuccess = () => {
          resolve(req.result as PendingRow[]);
          db.close();
        };
        req.onerror = () => {
          db.close();
          reject(req.error);
        };
      };
    });
  }, OFFLINE_DB);
}

export async function pendingSlots(page: Page): Promise<number[]> {
  return (await pendingWrites(page)).map((w) => w.slotIndex).sort((a, b) => a - b);
}

export async function expectQueuedSlots(page: Page, slots: number[]): Promise<void> {
  await expect.poll(() => pendingSlots(page)).toEqual(slots);
}

/** Wait for the queue to drain. Callers must have fired a flush trigger (§6) —
 *  going back online, a visibility change, a sign-in — rather than relying on
 *  the 30s timer, or this just measures the timer. */
export async function expectQueueDrains(page: Page): Promise<void> {
  await expect.poll(() => pendingSlots(page), { timeout: 20_000 }).toEqual([]);
}

/**
 * One query's data as persisted to IndexedDB (§7.4), read the way a cold start
 * reads it. Returns null when that query is not in the dump at all.
 */
async function persistedQueryData(page: Page, key: unknown[]): Promise<unknown[] | null> {
  return page.evaluate(
    async ({ dbName, storeName, cacheKey, wantedKey }) => {
      const existing = await indexedDB.databases();
      if (!existing.some((d) => d.name === dbName)) return null;
      const raw = await new Promise<unknown>((resolve, reject) => {
        const open = indexedDB.open(dbName);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains(storeName)) {
            db.close();
            resolve(undefined);
            return;
          }
          const req = db.transaction(storeName, 'readonly').objectStore(storeName).get(cacheKey);
          req.onsuccess = () => {
            resolve(req.result);
            db.close();
          };
          req.onerror = () => {
            db.close();
            reject(req.error);
          };
        };
      });
      if (typeof raw !== 'string') return null;
      const dump = JSON.parse(raw) as {
        clientState?: { queries?: { queryKey: unknown[]; state?: { data?: unknown } }[] }[] | undefined;
      };
      const queries = (dump.clientState as { queries?: { queryKey: unknown[]; state?: { data?: unknown } }[] } | undefined)?.queries;
      const wanted = JSON.stringify(wantedKey);
      const query = queries?.find((q) => JSON.stringify(q.queryKey) === wanted);
      const data = query?.state?.data;
      return Array.isArray(data) ? (data as unknown[]) : null;
    },
    { dbName: KEYVAL_DB, storeName: KEYVAL_STORE, cacheKey: QUERY_CACHE_KEY, wantedKey: key },
  );
}

/** The persister throttles its writes, so "the day is on screen" does not yet
 *  mean "the day is on disk". Gate on the dump itself before a reload or before
 *  closing a context that is meant to reopen from it. */
export async function expectPersistedSlots(
  page: Page,
  userId: string,
  date: string,
  slots: number[],
): Promise<void> {
  await expect
    .poll(
      async () => {
        const rows = (await persistedQueryData(page, ['entries', userId, date])) as
          | { slot_index: number }[]
          | null;
        return rows?.map((e) => e.slot_index).sort((a, b) => a - b) ?? null;
      },
      { timeout: 15_000 },
    )
    .toEqual(slots);
}

/**
 * Labels are a normal query, and queries keep React Query's pausing network
 * mode on purpose (C-72), so offline they serve the persisted cache or nothing
 * at all. A spec that cuts the network before the label list has landed opens
 * an empty picker for reasons that have nothing to do with what it asserts —
 * gate on the cache first. Waiting on the dump rather than on the UI keeps this
 * from perturbing the run: disk only ever lags memory, never leads it.
 */
export async function expectReadyToLogOffline(page: Page, userId: string): Promise<void> {
  for (const key of [['labels', userId], ['labels-all', userId]]) {
    await expect.poll(async () => (await persistedQueryData(page, key))?.length ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);
  }
}

export async function waitForServiceWorker(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
}
