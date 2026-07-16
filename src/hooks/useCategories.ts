import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listCategories, createCategory, updateCategory, deleteCategory } from '../lib/db/categories';

export function useCategories(userId: string) {
  return useQuery({ queryKey: ['categories', userId], queryFn: () => listCategories(userId) });
}

function useInvalidateCategories(userId: string) {
  const queryClient = useQueryClient();
  return (alsoLabels = false) => {
    queryClient.invalidateQueries({ queryKey: ['categories', userId] });
    // Deleting a category nulls category_id on labels that referenced it
    // (on-delete-set-null) — the cached label lists go stale too.
    if (alsoLabels) {
      queryClient.invalidateQueries({ queryKey: ['labels', userId] });
      queryClient.invalidateQueries({ queryKey: ['labels-all', userId] });
    }
  };
}

export function useCreateCategory(userId: string) {
  const invalidate = useInvalidateCategories(userId);
  return useMutation({
    mutationFn: ({ name, color }: { name: string; color: string }) => createCategory(userId, name, color),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateCategory(userId: string) {
  const invalidate = useInvalidateCategories(userId);
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; color?: string } }) =>
      updateCategory(userId, id, patch),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteCategory(userId: string) {
  const invalidate = useInvalidateCategories(userId);
  return useMutation({
    mutationFn: (id: string) => deleteCategory(userId, id),
    onSuccess: () => invalidate(true),
  });
}
