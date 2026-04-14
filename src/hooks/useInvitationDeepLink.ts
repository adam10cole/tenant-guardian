import { useEffect } from 'react';
import { Alert } from 'react-native';
import * as Linking from 'expo-linking';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

export function useInvitationDeepLink() {
  const { session } = useAuthStore();
  const queryClient = useQueryClient();
  const url = Linking.useURL();

  useEffect(() => {
    if (!url || !session) return;

    const parsed = Linking.parse(url);
    const token = parsed.queryParams?.token;
    if (parsed.path !== 'invite' || !token || typeof token !== 'string') return;

    supabase.rpc('accept_invitation', { p_token: token }).then(({ error }) => {
      if (error) {
        Alert.alert('Invitation Error', error.message);
      } else {
        Alert.alert('Connected!', 'You are now linked with your contact.');
        queryClient.invalidateQueries({ queryKey: ['connections'] });
        queryClient.invalidateQueries({ queryKey: ['landlord-issues'] });
      }
    });
  }, [url, session, queryClient]);
}
