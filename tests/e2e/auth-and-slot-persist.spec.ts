import { expect, test } from '@playwright/test';
import { LABEL_NAME, deleteAllEntries, serverSlots, useTestAccount, type TestAccount } from './helpers/account';
import { e2eEnv } from './helpers/env';
import { expectQueueDrains, loggedSlot, logSlot, today, waitForDayView } from './helpers/app';

// SPEC §13, first E2E: auth + slot persist.
//
// "Auth" here is everything downstream of the OAuth redirect — a real session
// boots into the authenticated shell, no session shows the sign-in screen. The
// Google handshake itself is not automatable (see helpers/account.ts) and stays
// a manual checkpoint.

const SLOT = 8; // 4:00–4:30
const DATE = today();

let account: TestAccount;

test.beforeAll(async () => {
  // The setup project already signed in and seeded the account.
  account = await useTestAccount();
});

test.describe('signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('the app asks for a sign-in instead of showing anyone a day', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
    await expect(page.getByRole('grid')).toHaveCount(0);
  });
});

test('a signed-in session lands on today, and a logged slot reaches the server and survives a reload', async ({
  page,
}) => {
  await deleteAllEntries(account);

  await page.goto('/');
  // The shell, not the onboarding wizard: the seeded account has onboarded_at.
  await expect(page.getByRole('button', { name: 'today', exact: true })).toBeVisible();
  await expect(page.getByText(e2eEnv().email)).toBeVisible();
  await waitForDayView(page, DATE);

  await logSlot(page, SLOT, LABEL_NAME);

  // Visible immediately, off the overlay — before anything has been sent.
  await expect(loggedSlot(page, SLOT, LABEL_NAME)).toBeVisible();

  // Enqueueing fires a flush (§6), so the queue drains without help.
  await expectQueueDrains(page);
  await expect.poll(() => serverSlots(account, DATE)).toEqual([SLOT]);

  await page.reload();
  await waitForDayView(page, DATE);
  await expect(loggedSlot(page, SLOT, LABEL_NAME)).toBeVisible();
});
