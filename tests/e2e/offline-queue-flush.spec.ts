import { expect, test } from '@playwright/test';
import { LABEL_NAME, deleteAllEntries, serverSlots, useTestAccount, type TestAccount } from './helpers/account';
import {
  expectPersistedSlots,
  expectQueueDrains,
  expectQueuedSlots,
  expectReadyToLogOffline,
  loggedSlot,
  logSlot,
  syncAnnouncer,
  today,
  waitForDayView,
} from './helpers/app';

// SPEC §13, second E2E: offline logging → pending → reconnect → flush →
// persists after reload.
//
// Nothing here asserts a connectivity check, because the write path has none
// (C-25): logging offline and logging online run exactly the same code. What
// the offline half proves is that the queue absorbed the writes and the overlay
// rendered them, and that neither reached the server until a flush trigger
// fired.

const FIRST = 10; // 5:00–5:30
const SECOND = 11; // 5:30–6:00
const DATE = today();

let account: TestAccount;

test.beforeAll(async () => {
  // The setup project already signed in and seeded the account.
  account = await useTestAccount();
});

test('entries logged offline queue up, then flush on reconnect and survive a reload', async ({
  page,
  context,
}) => {
  await deleteAllEntries(account);

  await page.goto('/');
  await waitForDayView(page, DATE);
  await expectQueueDrains(page);
  await expectReadyToLogOffline(page, account.userId);

  await context.setOffline(true);

  await logSlot(page, FIRST, LABEL_NAME);
  // The overlay is the optimistic layer (C-26): the cell reads as logged with
  // no request in flight and no rollback machinery behind it.
  await expect(loggedSlot(page, FIRST, LABEL_NAME)).toBeVisible();
  // DESIGN §7: the live region announces off the real queue state, at the
  // start of a pending episode — not off the debounced chip below.
  await expect(syncAnnouncer(page)).toHaveText('1 entry pending sync');

  await logSlot(page, SECOND, LABEL_NAME);
  await expect(loggedSlot(page, SECOND, LABEL_NAME)).toBeVisible();

  await expectQueuedSlots(page, [FIRST, SECOND]);
  expect(await serverSlots(account, DATE)).toEqual([]);

  // C-67: offline, the count is the only how-much-is-at-stake signal, and by
  // now the ~400ms debounce has long passed. The title carries the state too,
  // so this pins "waiting to sync" rather than "syncing".
  await expect(page.getByTitle('2 entries pending sync (waiting to sync)')).toBeVisible();

  // Reconnecting fires the `online` trigger (§6) — the 30s timer is not what
  // this spec is measuring.
  await context.setOffline(false);

  await expectQueueDrains(page);
  await expect.poll(() => serverSlots(account, DATE)).toEqual([FIRST, SECOND]);
  await expect(syncAnnouncer(page)).toHaveText('All entries synced');

  // Wait for the flushed day to reach the persisted cache before reloading.
  // Not politeness: the persister throttles, and a reload inside that window
  // restores the pre-flush snapshot with its original timestamp, which
  // staleTime (60s) then treats as fresh — so the grid comes back empty and
  // stays empty. That is a real defect, recorded rather than papered over; this
  // spec is about the entries surviving a reload, not about that window.
  await expectPersistedSlots(page, account.userId, DATE, [FIRST, SECOND]);

  await page.reload();
  await waitForDayView(page, DATE);
  await expect(loggedSlot(page, FIRST, LABEL_NAME)).toBeVisible();
  await expect(loggedSlot(page, SECOND, LABEL_NAME)).toBeVisible();
});
