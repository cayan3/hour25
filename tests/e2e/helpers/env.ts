import { loadEnv } from 'vite';

// The preview server the specs run against. A *built* preview, never `vite
// dev`: vite-plugin-pwa leaves the service worker off in dev (measured — the
// dev server registers zero service workers), and without a service worker
// there is no app shell to serve on a cold offline start, which is the whole
// point of the offline-restart spec. Both other specs run against the same
// server so no spec is testing a different artifact than its neighbours.
export const PREVIEW_PORT = 4173;
export const BASE_URL = `http://localhost:${PREVIEW_PORT}`;

// Where the setup project parks the signed-in session for the other specs.
// Gitignored — it holds a live access + refresh token.
export const AUTH_STATE_PATH = 'playwright/.auth/e2e-user.json';

// Production mode on purpose: these are the same values `npm run build` bakes
// into the bundle the preview serves, so the specs and the app under test are
// pointed at one project, not two.
const env = loadEnv('production', process.cwd(), '');

export interface E2EEnv {
  supabaseUrl: string;
  supabaseKey: string;
  email: string;
  password: string;
}

function required(name: string, why: string): string {
  const value = env[name] ?? process.env[name];
  if (!value) throw new Error(`${name} is missing from .env — ${why}. See tests/e2e/README.md.`);
  return value;
}

// Read lazily rather than at import: playwright.config.ts imports BASE_URL from
// this file, and a config that throws before the reporter exists reports badly.
export function e2eEnv(): E2EEnv {
  return {
    supabaseUrl: required('VITE_SUPABASE_URL', 'the specs run against a real Supabase project'),
    supabaseKey: required('VITE_SUPABASE_PUBLISHABLE_KEY', 'the specs run against a real Supabase project'),
    email: required('E2E_EMAIL', 'the E2E account signs in with email + password'),
    password: required('E2E_PASSWORD', 'the E2E account signs in with email + password'),
  };
}
