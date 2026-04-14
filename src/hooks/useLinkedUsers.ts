import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useRole } from '@/store/profileStore';
import type { LandlordTenantLinkWithProfile } from '@/types/database';

export function useLinkedUsers() {
  const { session } = useAuthStore();
  const role = useRole();

  return useQuery({
    queryKey: ['connections', session?.user.id],
    queryFn: async () => {
      const userId = session!.user.id;
      const isLandlord = role === 'landlord';

      const { data, error } = await supabase
        .from('landlord_tenant_links')
        .select('*')
        .eq(isLandlord ? 'landlord_id' : 'tenant_id', userId)
        .eq('status', 'active');

      if (error) throw error;

      // Fetch the display names for the other party
      const otherIds = (data ?? []).map((l) => (isLandlord ? l.tenant_id : l.landlord_id));

      if (otherIds.length === 0) return [] as LandlordTenantLinkWithProfile[];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', otherIds);

      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

      // Fetch emails from auth users via a separate profiles query (email not in profiles table)
      return (data ?? []).map((link) => {
        const otherId = isLandlord ? link.tenant_id : link.landlord_id;
        return {
          ...link,
          other_display_name: profileMap.get(otherId) ?? null,
          other_email: null, // email not accessible client-side via RLS
        } as LandlordTenantLinkWithProfile;
      });
    },
    enabled: !!session && role !== null,
  });
}

export function useRevokeLink() {
  const queryClient = useQueryClient();
  const { session } = useAuthStore();

  return useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase
        .from('landlord_tenant_links')
        .update({ status: 'revoked' })
        .eq('id', linkId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections', session?.user.id] });
      queryClient.invalidateQueries({ queryKey: ['landlord-issues', session?.user.id] });
    },
  });
}
