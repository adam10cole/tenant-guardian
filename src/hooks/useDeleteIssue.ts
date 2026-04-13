import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getDb } from '@/lib/database/client';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import type { LocalIssue } from '@/types/database';

async function deleteIssue(issue: LocalIssue): Promise<void> {
  const db = await getDb();

  await db.withTransactionAsync(async () => {
    // Collect child record local_ids before cascade removes them
    const childLocalIds = await db.getAllAsync<{ local_id: string }>(
      `SELECT local_id FROM photos WHERE issue_local_id = ?
       UNION SELECT local_id FROM communications WHERE issue_local_id = ?
       UNION SELECT local_id FROM issue_updates WHERE issue_local_id = ?`,
      [issue.local_id, issue.local_id, issue.local_id],
    );

    // Remove pending sync operations for this issue and all its child records
    await db.runAsync('DELETE FROM sync_queue WHERE local_id = ?', [issue.local_id]);
    for (const { local_id } of childLocalIds) {
      await db.runAsync('DELETE FROM sync_queue WHERE local_id = ?', [local_id]);
    }

    // Delete the issue — CASCADE removes photos, communications, issue_updates
    await db.runAsync('DELETE FROM issues WHERE local_id = ?', [issue.local_id]);
  });

  // Mirror to Supabase if the issue was already synced there
  // Supabase CASCADE handles server-side child records
  if (issue.id && issue.sync_status === 'synced') {
    await supabase.from('issues').delete().eq('id', issue.id);
  }
}

export function useDeleteIssue() {
  const queryClient = useQueryClient();
  const { session } = useAuthStore();
  const userId = session?.user.id ?? '';

  return useMutation({
    mutationFn: deleteIssue,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues', userId] });
    },
  });
}
