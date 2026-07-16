import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSettings, updateSettings, type UserSettingsRow } from '../lib/db/settings';

export function useSettings(userId: string) {
  return useQuery({ queryKey: ['settings', userId], queryFn: () => getSettings(userId) });
}

type SettingsPatch = Partial<Omit<UserSettingsRow, 'id' | 'user_id' | 'created_at'>>;

export function useUpdateSettings(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsPatch) => updateSettings(userId, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', userId] }),
  });
}
