import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, expect, test } from '@playwright/test';
import { LABEL_NAME, deleteAllEntries, useTestAccount, type TestAccount } from './helpers/account';
import { AUTH_STATE_PATH, BASE_URL } from './helpers/env';
import {
  expectPersistedSlots,
  expectQueueDrains,
  expectQueuedSlots,
  loggedSlot,
  logSlot,
  today,
  waitForDayView,
  waitForServiceWorker,
} from './helpers/app';

// SPEC §13, third E2E: offline restart. The one no unit test can reach —
// it needs a browser profile that outlives the process.
//
// Two slots on purpose, because "the day renders offline" has two independent
// sources and only using both distinguishes them:
//   CONFIRMED  flushed while online, so it is gone from the queue. Offline it
//              can only come from the persisted query cache (§7.4).
//   PENDING    logged offline and never sent. It can only come from the live
//              Dexie overlay (§7.3).
// The app shell under both comes from the service worker, which is why this
// runs against a build and not the dev server.

const CONFIRMED = 20; // 10:00–10:30
const PENDING = 21; // 10:30–11:00
const DATE = today();
const VIEWPORT = { width: 1280, height: 900 };

let account: TestAccount;

test.beforeAll(async () => {
  // The setup project already signed in and seeded the account.
  account = await useTestAccount();
});

test('a cold offline start renders the persisted day with the pending overlay intact', async () => {
  test.setTimeout(120_000);
  await deleteAllEntries(account);

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-e2e-profile-'));
  const state = JSON.parse(fs.readFileSync(AUTH_STATE_PATH, 'utf8')) as {
    origins: { localStorage: { name: string; value: string }[] }[];
  };

  try {
    const first = await chromium.launchPersistentContext(profile, { viewport: VIEWPORT });
    try {
      // Seed the session once. The profile keeps it from here on, which is what
      // makes the second launch a genuine restart rather than a fresh sign-in.
      await first.addInitScript((entries: { name: string; value: string }[]) => {
        for (const { name, value } of entries) localStorage.setItem(name, value);
      }, state.origins[0].localStorage);

      const page = await first.newPage();
      await page.goto(BASE_URL);
      await waitForDayView(page, DATE);
      await waitForServiceWorker(page);

      await logSlot(page, CONFIRMED, LABEL_NAME);
      await expectQueueDrains(page);
      // The persister throttles, so gate on the dump actually holding the day
      // before closing — otherwise this would be racing the disk.
      await expectPersistedSlots(page, account.userId, DATE, [CONFIRMED]);

      await first.setOffline(true);
      await logSlot(page, PENDING, LABEL_NAME);
      await expectQueuedSlots(page, [PENDING]);
    } finally {
      await first.close();
    }

    // Reopened with the network already down: nothing in this launch can reach
    // the server, including the navigation itself.
    const second = await chromium.launchPersistentContext(profile, {
      offline: true,
      viewport: VIEWPORT,
    });
    try {
      const page = await second.newPage();
      await page.goto(BASE_URL);
      expect(await page.evaluate(() => navigator.onLine)).toBe(false);

      await waitForDayView(page, DATE);
      await expect(loggedSlot(page, CONFIRMED, LABEL_NAME)).toBeVisible();
      await expect(loggedSlot(page, PENDING, LABEL_NAME)).toBeVisible();
      // Still queued, still unsent, still exactly one row: a restart must not
      // drop the pending write and must not duplicate it either.
      await expectQueuedSlots(page, [PENDING]);
    } finally {
      await second.close();
    }
  } finally {
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
