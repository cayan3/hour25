import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('../../../src/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import { resetMyData, deleteMyAccount } from '../../../src/lib/db/account';

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
});

describe('resetMyData', () => {
  it('calls the reset_my_data function with no arguments', async () => {
    await resetMyData();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]).toEqual(['reset_my_data']);
  });

  it('throws the failure classified, so callers can tell offline from broken', async () => {
    rpc.mockResolvedValue({ data: null, error: { status: 500, code: '', message: 'boom' } });
    await expect(resetMyData()).rejects.toMatchObject({ kind: 'network' });
  });
});

describe('deleteMyAccount', () => {
  it('calls the delete_my_account function with no arguments', async () => {
    await deleteMyAccount();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]).toEqual(['delete_my_account']);
  });

  it('classifies an expired session as auth rather than something retriable', async () => {
    rpc.mockResolvedValue({ data: null, error: { status: 401, code: 'PGRST301', message: 'jwt' } });
    await expect(deleteMyAccount()).rejects.toMatchObject({ kind: 'auth' });
  });
});
