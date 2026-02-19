import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDb } from '@/lib/database/client';
import { flushQueue } from '@/lib/sync/queue';
import { useAuthStore } from '@/store/authStore';
import type { LocalIssue } from '@/types/database';

async function fetchLocalIssues(userId: string): Promise<LocalIssue[]> {
  const db = await getDb();
  return db.getAllAsync<LocalIssue>(
    'SELECT * FROM issues WHERE user_id = ? ORDER BY first_reported_at DESC',
    [userId],
  );
}

export function useIssues() {
  const { session } = useAuthStore();
  const userId = session?.user.id ?? '';

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['issues', userId],
    queryFn: () => fetchLocalIssues(userId),
    enabled: !!userId,
  });

  const refresh = useCallback(async () => {
    // Attempt to flush any pending operations first, then reload
    await flushQueue().catch(() => {});
    await refetch();
  }, [refetch]);

  return {
    issues: data ?? [],
    isLoading,
    refresh,
  };
}
