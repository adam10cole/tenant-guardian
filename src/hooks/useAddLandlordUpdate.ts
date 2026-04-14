import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useProfileStore } from '@/store/profileStore';

interface AddLandlordUpdateVars {
  note: string;
}

export function useAddLandlordUpdate(issueId: string) {
  const queryClient = useQueryClient();
  const { session } = useAuthStore();
  const profile = useProfileStore((s) => s.profile);

  return useMutation({
    mutationFn: async ({ note }: AddLandlordUpdateVars) => {
      const { data, error } = await supabase
        .from('issue_updates')
        .insert({
          issue_id: issueId,
          user_id: session!.user.id,
          event_type: 'update',
          note: note || null,
          created_by_name: profile?.display_name ?? null,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['landlord-issue-updates', issueId] });
      queryClient.invalidateQueries({ queryKey: ['landlord-issue-photos', issueId] });
    },
  });
}
