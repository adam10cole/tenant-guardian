import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getDb } from '@/lib/database/client';
import { enqueueIssueWrite, enqueueIssueUpdateWrite } from '@/lib/sync/queue';
import { useProfileStore } from '@/store/profileStore';
import type { IssueInsert, IssueStatus } from '@/types/database';

function generateLocalId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface UpdateStatusVars {
  status: IssueStatus;
  currentLandlordNotifiedAt: string | null;
}

export function useUpdateIssueStatus(
  localId: string | null | undefined,
  routeId: string,
  userId: string | undefined,
) {
  const queryClient = useQueryClient();
  const profile = useProfileStore((s) => s.profile);

  return useMutation({
    mutationFn: async ({ status, currentLandlordNotifiedAt }: UpdateStatusVars) => {
      if (!localId) throw new Error('No local_id available');
      if (!userId) throw new Error('No user ID available');

      const clientUpdatedAt = new Date().toISOString();
      const createdByName = profile?.display_name ?? null;
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

      const updateLocalId = generateLocalId();
      await db.runAsync(
        `INSERT INTO issue_updates
         (local_id, issue_local_id, user_id, event_type, status_value, created_by_name, created_at, sync_status)
         VALUES (?, ?, ?, 'status_change', ?, ?, ?, 'pending_insert')`,
        [updateLocalId, localId, userId, status, createdByName, clientUpdatedAt],
      );
      await enqueueIssueUpdateWrite(updateLocalId, {
        local_id: updateLocalId,
        issue_id: localId,
        user_id: userId,
        event_type: 'status_change',
        note: null,
        status_value: status,
        created_by_name: createdByName,
        created_at: clientUpdatedAt,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issue', routeId] });
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      queryClient.invalidateQueries({ queryKey: ['updates', routeId] });
    },
  });
}
