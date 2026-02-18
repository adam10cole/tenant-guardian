import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getDb } from '@/lib/database/client';
import { enqueueIssueWrite } from '@/lib/sync/queue';
import type { IssueInsert, IssueStatus } from '@/types/database';

interface UpdateStatusVars {
  status: IssueStatus;
  currentLandlordNotifiedAt: string | null;
}

export function useUpdateIssueStatus(localId: string | null | undefined, routeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ status, currentLandlordNotifiedAt }: UpdateStatusVars) => {
      if (!localId) throw new Error('No local_id available');

      const clientUpdatedAt = new Date().toISOString();
      const landlordNotifiedAt =
        status === 'landlord_notified' && currentLandlordNotifiedAt === null
          ? clientUpdatedAt
          : currentLandlordNotifiedAt;

      const db = await getDb();
      await db.runAsync(
        `UPDATE issues
         SET status = ?, landlord_notified_at = ?, client_updated_at = ?, sync_status = 'pending_update'
         WHERE local_id = ?`,
        [status, landlordNotifiedAt, clientUpdatedAt, localId],
      );

      await enqueueIssueWrite(localId, 'update', {
        status,
        landlord_notified_at: landlordNotifiedAt,
        client_updated_at: clientUpdatedAt,
      } as IssueInsert);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issue', routeId] });
      queryClient.invalidateQueries({ queryKey: ['issues'] });
    },
  });
}
