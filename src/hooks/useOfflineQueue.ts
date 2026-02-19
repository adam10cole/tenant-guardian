/**
 * useOfflineQueue — Monitors network connectivity and triggers sync on reconnect.
 *
 * Mount this hook once in the root layout or app entry point.
 */

import { useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import { flushQueue } from '@/lib/sync/queue';
import { useAuthStore } from '@/store/authStore';

export function useOfflineQueue() {
  const queryClient = useQueryClient();
  const { session } = useAuthStore();

  useEffect(() => {
    // Don't attempt sync when there is no authenticated session
    if (!session) return;

    async function syncAndRefresh() {
      const synced = await flushQueue();
      if (synced > 0) {
        // Invalidate all cached queries so the UI reflects the updated sync_status
        queryClient.invalidateQueries();
      }
    }

    // Subscribe to network state changes
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable) {
        syncAndRefresh().catch((err) => {
          console.warn('[offline-queue] Sync flush failed:', err);
        });
      }
    });

    // Attempt an immediate flush on mount (app may have come to foreground)
    syncAndRefresh().catch(() => {});

    return unsubscribe;
  }, [session, queryClient]);
}
