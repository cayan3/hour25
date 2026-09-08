import { test as setup } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { seedAccount, signInTestAccount } from './helpers/account';
import { AUTH_STATE_PATH, BASE_URL } from './helpers/env';

// Runs once, before every other project. Signs the E2E account in through
// supabase-js in Node and writes the session out as a Playwright storage state,
// so the specs open the app already signed in without ever touching the
// (unautomatable) Google consent screen.
setup('sign in the E2E account and seed a known starting state', async () => {
  const account = await signInTestAccount();
  await seedAccount(account);

  fs.mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true });
  fs.writeFileSync(
    AUTH_STATE_PATH,
    `${JSON.stringify(
      { cookies: [], origins: [{ origin: BASE_URL, localStorage: account.storage }] },
      null,
      2,
    )}\n`,
  );
});
