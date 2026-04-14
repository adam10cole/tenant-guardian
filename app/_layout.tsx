/**
 * Root layout — sets up auth guard, TanStack Query provider,
 * and NativeWind stylesheet.
 */

import '../global.css';

import { useEffect, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '@/store/authStore';
import { useProfileStore } from '@/store/profileStore';
import { useProfile } from '@/hooks/useProfile';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { useInvitationDeepLink } from '@/hooks/useInvitationDeepLink';
import { seedFromSupabase } from '@/lib/sync/queue';
import { getDb } from '@/lib/database/client';

// Kick off DB init immediately — don't wait for auth to resolve
getDb().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 2,
    },
  },
});

function AuthGuard() {
  const { session, isLoading: authLoading } = useAuthStore();
  const profileLoading = useProfileStore((s) => s.isLoading);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (authLoading) return;
    // When logged in, wait for profile to load before routing
    if (session && profileLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)/dashboard');
    }
  }, [session, authLoading, profileLoading, segments, router]);

  return null;
}

function AppServices() {
  const { session } = useAuthStore();
  const profile = useProfileStore((s) => s.profile);
  const seededRef = useRef<Set<string>>(new Set());

  useProfile();
  useOfflineQueue();
  useInvitationDeepLink();

  useEffect(() => {
    const userId = session?.user.id ?? null;
    const role = profile?.role ?? null;

    if (!userId) {
      // Signed out — reset so the next login always re-seeds
      seededRef.current.clear();
      return;
    }

    // Only seed SQLite for tenants — landlords are online-only
    if (role === 'tenant' && !seededRef.current.has(userId)) {
      seededRef.current.add(userId);
      seedFromSupabase(userId)
        .catch(() => {})
        .finally(() => queryClient.invalidateQueries({ queryKey: ['issues', userId] }));
    }
  }, [session, profile]);

  return null;
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGuard />
      <AppServices />
      <StatusBar style="auto" />
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="issue/[id]"
          options={{ title: 'Issue Details', headerBackTitle: 'Back' }}
        />
        <Stack.Screen name="issue/new" options={{ title: 'Report Issue', presentation: 'modal' }} />
        <Stack.Screen
          name="profile/edit"
          options={{ title: 'Edit Profile', headerBackTitle: 'Back' }}
        />
      </Stack>
    </QueryClientProvider>
  );
}
