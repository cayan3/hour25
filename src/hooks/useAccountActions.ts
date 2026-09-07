import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { deleteMyAccount, resetMyData } from '../lib/db/account';
import { signOut } from '../lib/db/auth';
import { clearPendingWrites } from '../lib/offline/queue';
import { clearDeadWrites } from '../lib/offline/deadLetters';
import { clearMru } from '../lib/mru';
import { clearLastSync } from '../lib/lastSync';
import { toFriendlyErrorMessage } from '../lib/errorMessage';
import { useDayStore } from '../store/day';

export type AccountAction = 'reset' | 'delete';

export interface AccountActionsController {
  busy: AccountAction | null;
  done: AccountAction | null;
  error: string | null;
  resetData: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

// The local half of both "Your data" actions. Server-side each is a single
// security definer function (src/lib/db/account.ts); everything here is the
// cleanup that has to follow it in this browser.
//
// Order matters: the RPC goes first and local state is only discarded once it
// has succeeded. The reverse would destroy unsent writes on a failed call and
// leave the server untouched — destruction without the thing it was for.
async function discardLocalWork(userId: string): Promise<void> {
  await clearPendingWrites(userId);
  await clearDeadWrites(userId);
  clearMru(userId);
  // The undo snackbar's action names a slot and a label that no longer exist;
  // undoing it would queue a write against a deleted label.
  useDayStore.getState().clearLastAction();
}

export function useAccountActions(userId: string): AccountActionsController {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<AccountAction | null>(null);
  const [done, setDone] = useState<AccountAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetData = useCallback(async () => {
    setBusy('reset');
    setError(null);
    try {
      await resetMyData();
      await discardLocalWork(userId);
      // Same set as a restore: a reset empties every domain at once.
      // `settings` is the load-bearing one — onboarded_at is null again, so
      // the shell re-renders into onboarding (C-38) as soon as it refetches.
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['labels', userId] });
      queryClient.invalidateQueries({ queryKey: ['labels-all', userId] });
      queryClient.invalidateQueries({ queryKey: ['categories', userId] });
      queryClient.invalidateQueries({ queryKey: ['settings', userId] });
      setDone('reset');
    } catch (e) {
      setError(toFriendlyErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }, [userId, queryClient]);

  const deleteAccount = useCallback(async () => {
    setBusy('delete');
    setError(null);
    try {
      await deleteMyAccount();
      await discardLocalWork(userId);
      clearLastSync(userId);
      // The account is already gone at this point, so a failing sign-out call
      // must not be reported as a failed deletion. supabase-js ignores the
      // 401/403/404 the deleted user's token now produces and clears the
      // session anyway; only a genuine network failure lands here, and the
      // App's SIGNED_OUT handler (which clears the query cache) then runs on
      // the next load instead of now.
      try {
        await signOut();
      } catch {
        /* deliberately swallowed — see above */
      }
      setDone('delete');
    } catch (e) {
      setError(toFriendlyErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }, [userId]);

  return { busy, done, error, resetData, deleteAccount };
}
