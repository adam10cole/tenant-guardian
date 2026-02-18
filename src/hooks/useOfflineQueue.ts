/**
 * useOfflineQueue — Monitors network connectivity and triggers sync on reconnect.
 *
 * Mount this hook once in the root layout or app entry point.
 */

import { useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { flushQueue } from '@/lib/sync/queue';

export function useOfflineQueue() {
  useEffect(() => {
    // Subscribe to network state changes
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable) {
        // Fire-and-forget — errors are handled inside flushQueue
        flushQueue().catch((err) => {
          console.warn('[offline-queue] Sync flush failed:', err);
        });
      }
    });

    // Attempt an immediate flush on mount (app may have come to foreground)
    flushQueue().catch(() => {});

    return unsubscribe;
  }, []);
}
