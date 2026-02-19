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
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { seedFromSupabase } from '@/lib/sync/queue';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 2,
    },
  },
});

function AuthGuard() {
  const { session, isLoading } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)/dashboard');
    }
  }, [session, isLoading, segments, router]);

  return null;
}

function AppServices() {
  const { session } = useAuthStore();
  const prevUserIdRef = useRef<string | null>(null);

  useOfflineQueue();

  useEffect(() => {
    const userId = session?.user.id ?? null;
    if (userId && userId !== prevUserIdRef.current) {
      // New user logged in — seed local DB from Supabase if empty
      seedFromSupabase(userId).catch(() => {});
    }
    prevUserIdRef.current = userId;
  }, [session]);

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
      </Stack>
    </QueryClientProvider>
  );
}
