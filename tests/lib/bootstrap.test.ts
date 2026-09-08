import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { bootstrapAccountCache } from '../../src/lib/bootstrap';

const USER = 'user-1';
const OTHER = 'user-2';
const DAY = '2026-09-08';

function seededClient(): QueryClient {
  const client = new QueryClient();
  client.setQueryData(['settings', USER], { user_id: USER });
  client.setQueryData(['labels', USER], [{ id: 'l1' }]);
  client.setQueryData(['labels-all', USER], [{ id: 'l1' }]);
  client.setQueryData(['categories', USER], []);
  client.setQueryData(['entries', USER, DAY], [{ slot_index: 8 }]);
  client.setQueryData(['entries', USER, '2026-09-01', DAY], [{ slot_index: 8 }]);
  client.setQueryData(['entries', OTHER, DAY], [{ slot_index: 9 }]);
  return client;
}

function invalidated(client: QueryClient, key: unknown[]): boolean {
  return client.getQueryState(key)?.isInvalidated ?? false;
}

describe('bootstrapAccountCache', () => {
  it('refreshes the account queries C-56 put in lockstep', async () => {
    const client = seededClient();
    await bootstrapAccountCache(client, USER);

    expect(invalidated(client, ['settings', USER])).toBe(true);
    expect(invalidated(client, ['labels', USER])).toBe(true);
    expect(invalidated(client, ['labels-all', USER])).toBe(true);
    expect(invalidated(client, ['categories', USER])).toBe(true);
  });

  // The defect this closes: the persister throttles its writes, so for about a
  // second after a flush the dump on disk still holds the PRE-flush snapshot.
  // A reload inside that window restores it with its original dataUpdatedAt,
  // staleTime (60s) treats it as fresh and issues no refetch — and because the
  // queue has just drained, the overlay adds nothing back. The day renders
  // empty and stays empty for the rest of the minute. Boot must therefore
  // never trust persisted entries as fresh.
  it('refreshes the cached entries too, day ranges included', async () => {
    const client = seededClient();
    await bootstrapAccountCache(client, USER);

    expect(invalidated(client, ['entries', USER, DAY])).toBe(true);
    expect(invalidated(client, ['entries', USER, '2026-09-01', DAY])).toBe(true);
  });

  it('leaves another account on this browser untouched', async () => {
    const client = seededClient();
    await bootstrapAccountCache(client, USER);

    expect(invalidated(client, ['entries', OTHER, DAY])).toBe(false);
  });

  // Invalidating must not blank the screen: offline the refetch just pauses
  // (C-72), and a cold offline boot still has to render the persisted day.
  it('keeps the cached data in place so an offline boot still renders', async () => {
    const client = seededClient();
    await bootstrapAccountCache(client, USER);

    expect(client.getQueryData(['entries', USER, DAY])).toEqual([{ slot_index: 8 }]);
    expect(client.getQueryData(['labels', USER])).toEqual([{ id: 'l1' }]);
  });
});
