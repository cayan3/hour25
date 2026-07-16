import { useState } from 'react';
import { useCreateLabel, useRestoreLabel } from './useLabels';
import type { LabelRow } from '../lib/db/labels';
import { toFriendlyErrorMessage } from '../lib/errorMessage';

interface PendingCreate {
  name: string;
  color: string;
  categoryId: string | null;
}

interface Collision {
  deletedLabel: LabelRow;
  pending: PendingCreate;
}

export type CreateResult = { ok: true } | { ok: false; message?: string };

export type RestoreOutcome =
  | { kind: 'restored' }
  | { kind: 'active-name-collision'; conflictingLabel: LabelRow }
  | { kind: 'error'; message: string };

// Shared create-with-collision-handling flow (C-32) — used by both the
// Settings label form and the onboarding suggestion chips, so the
// restore-or-create dialog behaves identically everywhere a label is created.
export function useLabelCreateFlow(userId: string) {
  const createLabel = useCreateLabel(userId);
  const restoreLabel = useRestoreLabel(userId);
  const [collision, setCollision] = useState<Collision | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create(name: string, color: string, categoryId: string | null = null): Promise<CreateResult> {
    setError(null);
    try {
      const result = await createLabel.mutateAsync({ name, color, categoryId });
      if (result.kind === 'created') return { ok: true };
      if (result.kind === 'restore-or-create') {
        setCollision({ deletedLabel: result.deletedLabel, pending: { name, color, categoryId } });
        return { ok: false };
      }
      const message = `"${name}" is already an active label.`;
      setError(message);
      return { ok: false, message };
    } catch (e) {
      // Covers unexpected throws (classified Supabase errors, or a plain
      // Error from a zero-rows-affected guard) — the two expected outcomes
      // above are handled by the discriminated result; this is the
      // "something else went wrong" fallback so a failure is never silent
      // (e.g. a stale-cached row that no longer exists server-side).
      const message = toFriendlyErrorMessage(e);
      setError(message);
      return { ok: false, message };
    }
  }

  async function restore(renameTo?: string): Promise<RestoreOutcome> {
    if (!collision) return { kind: 'error', message: toFriendlyErrorMessage(undefined) };
    try {
      const result = await restoreLabel.mutateAsync({ id: collision.deletedLabel.id, renameTo });
      if (result.kind === 'restored') {
        setCollision(null);
        return { kind: 'restored' };
      }
      return { kind: 'active-name-collision', conflictingLabel: result.conflictingLabel };
    } catch (e) {
      return { kind: 'error', message: toFriendlyErrorMessage(e) };
    }
  }

  async function createDistinct(newName: string): Promise<CreateResult> {
    if (!collision) return { ok: false, message: toFriendlyErrorMessage(undefined) };
    const result = await create(newName, collision.pending.color, collision.pending.categoryId);
    if (result.ok) setCollision(null);
    return result;
  }

  function cancelCollision(): void {
    setCollision(null);
  }

  return {
    create,
    error,
    collision,
    restore,
    createDistinct,
    cancelCollision,
    isPending: createLabel.isPending || restoreLabel.isPending,
  };
}
