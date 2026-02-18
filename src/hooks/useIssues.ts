import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDb } from '@/lib/database/client';
import { flushQueue } from '@/lib/sync/queue';
import type { LocalIssue } from '@/types/database';

async function fetchLocalIssues(): Promise<LocalIssue[]> {
  const db = await getDb();
  return db.getAllAsync<LocalIssue>('SELECT * FROM issues ORDER BY first_reported_at DESC');
}

export function useIssues() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['issues'],
    queryFn: fetchLocalIssues,
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
