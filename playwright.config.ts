import { defineConfig } from '@playwright/test';
import { AUTH_STATE_PATH, BASE_URL, PREVIEW_PORT } from './tests/e2e/helpers/env';

// SPEC §13's E2E layer. Three specs, all against a production build served by
// `vite preview` and a real dev Supabase project — there is no local Supabase
// stack (migrations/README.md) and no service worker under `vite dev`.
export default defineConfig({
  testDir: './tests/e2e',
  // One shared account on one shared project: parallel workers would seed and
  // wipe each other's entries.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    // Above the 768px breakpoint, so the day view renders the desktop grid.
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'e2e',
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts/,
      use: { storageState: AUTH_STATE_PATH },
    },
  ],
  webServer: {
    // `npm run build` first (it type-checks, then bundles): the specs must run
    // against the current source, and the service worker only exists in a
    // build. Never reuse a running server for the same reason — a stale preview
    // would quietly test the previous commit.
    command: `npm run build && npx vite preview --port ${PREVIEW_PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
