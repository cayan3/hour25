import fs from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../src/lib/database.types';
import { AUTH_STATE_PATH, e2eEnv } from './env';

// The E2E account: a dedicated email+password user on the dev project.
//
// Google OAuth (§12) cannot be driven headlessly — the consent screen is not
// automatable and the client is in Testing mode — so these specs cover what is
// downstream of the redirect: a real session boots into the shell, and a
// missing one shows the sign-in screen. The OAuth handshake itself stays a
// manual checkpoint. What matters for everything the specs *do* assert is that
// this session is genuine: a real GoTrue token, so RLS applies to every read
// and write exactly as it does for a signed-in person. Nothing here holds a
// service key, and nothing bypasses row-level security.

export const LABEL_NAME = 'E2E';
export const LABEL_COLOR = '#2563eb';

export interface TestAccount {
  client: SupabaseClient<Database>;
  userId: string;
  /**
   * Whatever supabase-js itself wrote to storage while signing in — keys and
   * encoding included. Replaying these into the browser's localStorage gives
   * the app the session it would have written for itself, so this never has to
   * track supabase-js's storage-key naming or its chunking scheme by hand.
   */
  storage: { name: string; value: string }[];
}

function clientBackedBy(written: Map<string, string>): SupabaseClient<Database> {
  const { supabaseUrl, supabaseKey } = e2eEnv();
  return createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: false, // no background timer to keep the runner alive
      detectSessionInUrl: false, // there is no window with a hash fragment here
      storage: {
        getItem: (key) => written.get(key) ?? null,
        setItem: (key, value) => void written.set(key, value),
        removeItem: (key) => void written.delete(key),
      },
    },
  });
}

/** Signs in for real. Called once per run, by the setup project. */
export async function signInTestAccount(): Promise<TestAccount> {
  const { email, password } = e2eEnv();
  const written = new Map<string, string>();
  const client = clientBackedBy(written);

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(
      `E2E sign-in failed: ${error.message}. Check that the Email provider is enabled on the ` +
        `dev project and that E2E_EMAIL/E2E_PASSWORD name a confirmed user. See tests/e2e/README.md.`,
    );
  }
  if (!data.session || !data.user) throw new Error('E2E sign-in returned no session.');
  if (written.size === 0) {
    throw new Error('supabase-js wrote no session to storage — cannot build a browser storage state.');
  }

  return {
    client,
    userId: data.user.id,
    storage: [...written].map(([name, value]) => ({ name, value })),
  };
}

/**
 * Reuses the session the setup project already established, rather than signing
 * in again in every spec file. Four password grants per run against one GoTrue
 * project is wasteful, and it is rate-limitable — one run failed a spec's
 * beforeAll on a repeat grant. One sign-in per run is enough for all of them.
 */
export async function useTestAccount(): Promise<TestAccount> {
  const raw = fs.readFileSync(AUTH_STATE_PATH, 'utf8');
  const state = JSON.parse(raw) as { origins: { localStorage: { name: string; value: string }[] }[] };
  const written = new Map(state.origins[0].localStorage.map((e) => [e.name, e.value] as const));
  const client = clientBackedBy(written);

  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (!data.session) throw new Error('No stored E2E session — the setup project should have written one.');

  return {
    client,
    userId: data.session.user.id,
    storage: [...written].map(([name, value]) => ({ name, value })),
  };
}

/**
 * Every run starts from the same place: onboarded (so the app lands on the day
 * view rather than the wizard), exactly one known active label, and no entries.
 *
 * Deliberately NOT `reset_my_data()` (C-76), even though it exists and is
 * applied on dev: it nulls `onboarded_at` and deletes every label, so each run
 * would have to walk the onboarding wizard and re-create a label before it
 * could log anything — more moving parts in the setup than in the thing under
 * test. Scoped writes as the account itself are smaller, faster, and survive
 * `006` not being applied. The account is dedicated, so "delete every entry" is
 * still a complete reset of the surface these specs touch.
 */
export async function seedAccount(account: TestAccount): Promise<{ labelId: string }> {
  const { client, userId } = account;

  await deleteAllEntries(account);

  // The row may not exist yet on a freshly created user — the app writes it on
  // first authenticated load (§12), and the specs must not depend on having
  // been run once before.
  const inserted = await client
    .from('user_settings')
    .upsert({ user_id: userId, timezone: 'UTC' }, { onConflict: 'user_id', ignoreDuplicates: true });
  if (inserted.error) throw inserted.error;

  const stamped = await client
    .from('user_settings')
    .update({ onboarded_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (stamped.error) throw stamped.error;

  return { labelId: await ensureLabel(account) };
}

// Labels are soft-delete only in v1 (004 grants the client no DELETE on them),
// so this reuses the one it created the first time rather than churning rows.
async function ensureLabel(account: TestAccount): Promise<string> {
  const { client, userId } = account;
  const existing = await client
    .from('labels')
    .select('id')
    .eq('user_id', userId)
    .eq('name', LABEL_NAME)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data.id;

  const created = await client
    .from('labels')
    .insert({ user_id: userId, name: LABEL_NAME, color: LABEL_COLOR })
    .select('id')
    .single();
  if (created.error) throw created.error;
  return created.data.id;
}

export async function deleteAllEntries(account: TestAccount): Promise<void> {
  const { error } = await account.client
    .from('time_entries')
    .delete()
    .eq('user_id', account.userId);
  if (error) throw error;
}

/** What the server actually holds for a day — the only unambiguous proof that
 *  a write got past the queue, since the overlay and the persisted cache both
 *  render entries the server has never seen. */
export async function serverEntries(
  account: TestAccount,
  date: string,
): Promise<{ slot_index: number; label_id: string; note: string | null }[]> {
  const { data, error } = await account.client
    .from('time_entries')
    .select('slot_index, label_id, note')
    .eq('user_id', account.userId)
    .eq('date', date)
    .order('slot_index');
  if (error) throw error;
  return data ?? [];
}

export async function serverSlots(account: TestAccount, date: string): Promise<number[]> {
  return (await serverEntries(account, date)).map((e) => e.slot_index);
}
