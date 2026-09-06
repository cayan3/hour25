import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// DEV_ALLOWED_HOSTS (comma-separated, set in the local .env) lets the dev
// server answer to extra hostnames — e.g. the machine's mDNS name for phone
// testing on the LAN. Vite blocks non-IP hosts by default (DNS-rebinding
// protection), and the hostname itself is machine-identifying, so the value
// lives in the gitignored .env rather than this file. No VITE_ prefix: the
// variable is config-time only and never reaches the client bundle.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const allowedHosts =
    env.DEV_ALLOWED_HOSTS?.split(',')
      .map((h) => h.trim())
      .filter(Boolean) ?? [];
  return {
    plugins: [
      react(),
      VitePWA({
        // 'prompt', never 'autoUpdate' (C-40): an automatic reload mid-logging
        // would discard whatever the user was typing. The toast asks first.
        registerType: 'prompt',
        manifest: {
          name: 'Time Tracker',
          short_name: 'Time Tracker',
          description: 'Track where your time goes, half an hour at a time.',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          background_color: '#f8fafc',
          theme_color: '#f8fafc',
          icons: [
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // The app shell only. No runtimeCaching is configured on purpose:
          // data must never be served by the service worker — the persisted
          // query cache plus the write-ahead queue are the offline data layer,
          // and a second, staler copy of entries would fight both.
          globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
          // The offline fallback for uncached navigations: any route (incl.
          // /auth/callback) resolves to the precached shell, which is what
          // makes a cold offline start possible at all.
          navigateFallback: 'index.html',
        },
      }),
    ],
    // host: true binds 0.0.0.0 *and* [::], not just the first address Node
    // resolves for 'localhost'. Node 17+ resolves localhost to ::1 first, so
    // the default bound IPv6-only and any browser that tried 127.0.0.1 got
    // connection-refused. Also removes the need for a --host flag when testing
    // from a phone on the LAN (see PHONE-TESTING.md).
    server: { host: true, allowedHosts },
    // Two test projects: lib/queue tests stay in the fast node environment;
    // component tests (tests/components/ only) run under jsdom with Testing
    // Library. Both need fake-indexeddb (Dexie in Node/jsdom).
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: 'unit',
            environment: 'node',
            include: ['tests/**/*.test.ts'],
            exclude: ['tests/components/**'],
            setupFiles: ['./tests/setup.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'components',
            environment: 'jsdom',
            include: ['tests/components/**/*.test.tsx'],
            setupFiles: ['./tests/setup.ts', './tests/components/setup.ts'],
          },
        },
      ],
    },
  };
});
