import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useProfileStore } from '@/store/profileStore';
import type { Profile } from '@/types/database';

export function useProfile() {
  const { session } = useAuthStore();
  const { setProfile, setLoading } = useProfileStore();

  const query = useQuery({
    queryKey: ['profile', session?.user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session!.user.id)
        .single();
      if (error) throw error;
      return data as Profile;
    },
    enabled: !!session,
    staleTime: 1000 * 60 * 10, // 10 minutes
  });

  useEffect(() => {
    if (query.data) {
      setProfile(query.data);
    } else if (!query.isLoading && !session) {
      setProfile(null);
    }
  }, [query.data, query.isLoading, session, setProfile]);

  useEffect(() => {
    setLoading(query.isLoading);
  }, [query.isLoading, setLoading]);

  return query;
}
