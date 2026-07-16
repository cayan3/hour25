import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listActiveLabels,
  listAllLabels,
  createLabel,
  softDeleteLabel,
  restoreLabel,
  updateLabel,
} from '../lib/db/labels';

// §7.5: two label queries exist on purpose. 'labels' = active only
// (pickers); 'labels-all' = includes soft-deleted (grid rendering, stats).
export function useActiveLabels(userId: string) {
  return useQuery({ queryKey: ['labels', userId], queryFn: () => listActiveLabels(userId) });
}

export function useAllLabels(userId: string) {
  return useQuery({ queryKey: ['labels-all', userId], queryFn: () => listAllLabels(userId) });
}

function useInvalidateLabels(userId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['labels', userId] });
    queryClient.invalidateQueries({ queryKey: ['labels-all', userId] });
  };
}

export function useCreateLabel(userId: string) {
  const invalidate = useInvalidateLabels(userId);
  return useMutation({
    mutationFn: ({ name, color, categoryId }: { name: string; color: string; categoryId?: string | null }) =>
      createLabel(userId, name, color, categoryId ?? null),
    onSuccess: invalidate,
  });
}

export function useUpdateLabel(userId: string) {
  const invalidate = useInvalidateLabels(userId);
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateLabel>[2] }) =>
      updateLabel(userId, id, patch),
    onSuccess: invalidate,
  });
}

export function useSoftDeleteLabel(userId: string) {
  const invalidate = useInvalidateLabels(userId);
  return useMutation({
    mutationFn: (id: string) => softDeleteLabel(userId, id),
    onSuccess: invalidate,
  });
}

export function useRestoreLabel(userId: string) {
  const invalidate = useInvalidateLabels(userId);
  return useMutation({
    mutationFn: ({ id, renameTo }: { id: string; renameTo?: string }) => restoreLabel(userId, id, renameTo),
    onSuccess: invalidate,
  });
}
