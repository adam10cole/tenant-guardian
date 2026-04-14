import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import type { IssueWithTenant } from '@/types/database';

export function useLandlordIssues() {
  const { session } = useAuthStore();

  return useQuery({
    queryKey: ['landlord-issues', session?.user.id],
    queryFn: async () => {
      // Fetch all issues the landlord can see (RLS filters to linked tenants)
      const { data: issuesData, error } = await supabase
        .from('issues')
        .select('*')
        .order('first_reported_at', { ascending: false });

      if (error) throw error;
      if (!issuesData || issuesData.length === 0) return [] as IssueWithTenant[];

      // Fetch display names for all unique tenant IDs in one query
      const tenantIds = [...new Set(issuesData.map((i) => i.user_id))];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', tenantIds);

      const profileMap = new Map((profilesData ?? []).map((p) => [p.id, p.display_name]));

      return issuesData.map((i) => ({
        ...i,
        tenant_display_name: profileMap.get(i.user_id) ?? null,
      })) as IssueWithTenant[];
    },
    enabled: !!session,
    staleTime: 1000 * 30,
  });
}
