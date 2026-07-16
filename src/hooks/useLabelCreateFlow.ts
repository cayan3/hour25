import { useState } from 'react';
import { useCreateLabel, useRestoreLabel } from './useLabels';
import type { LabelRow } from '../lib/db/labels';

interface PendingCreate {
  name: string;
  color: string;
  categoryId: string | null;
}

interface Collision {
  deletedLabel: LabelRow;
  pending: PendingCreate;
}

type RestoreOutcome =
  | { kind: 'restored' }
  | { kind: 'active-name-collision'; conflictingLabel: LabelRow }
  | undefined;

// Shared create-with-collision-handling flow (C-32) — used by both the
// Settings label form and the onboarding suggestion chips, so the
// restore-or-create dialog behaves identically everywhere a label is created.
export function useLabelCreateFlow(userId: string) {
  const createLabel = useCreateLabel(userId);
  const restoreLabel = useRestoreLabel(userId);
  const [collision, setCollision] = useState<Collision | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create(name: string, color: string, categoryId: string | null = null): Promise<boolean> {
    setError(null);
    const result = await createLabel.mutateAsync({ name, color, categoryId });
    if (result.kind === 'created') return true;
    if (result.kind === 'restore-or-create') {
      setCollision({ deletedLabel: result.deletedLabel, pending: { name, color, categoryId } });
      return false;
    }
    setError(`"${name}" is already an active label.`);
    return false;
  }

  async function restore(renameTo?: string): Promise<RestoreOutcome> {
    if (!collision) return undefined;
    const result = await restoreLabel.mutateAsync({ id: collision.deletedLabel.id, renameTo });
    if (result.kind === 'restored') {
      setCollision(null);
      return { kind: 'restored' };
    }
    return { kind: 'active-name-collision', conflictingLabel: result.conflictingLabel };
  }

  async function createDistinct(newName: string): Promise<boolean> {
    if (!collision) return false;
    const ok = await create(newName, collision.pending.color, collision.pending.categoryId);
    if (ok) setCollision(null);
    return ok;
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
