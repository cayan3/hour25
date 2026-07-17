import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

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
    plugins: [react()],
    server: { allowedHosts },
    test: {
      environment: 'node',
      setupFiles: ['./tests/setup.ts'],
    },
  };
});
