import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getDb } from '@/lib/database/client';
import { enqueueIssueUpdateWrite, enqueuePhotoUpload } from '@/lib/sync/queue';
import type { WizardPhoto } from '@/store/issueWizardStore';

function generateLocalId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface AddUpdateVars {
  userId: string;
  note: string;
  photos: WizardPhoto[];
}

export function useAddIssueUpdate(issueLocalId: string | null | undefined, routeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, note, photos }: AddUpdateVars) => {
      if (!issueLocalId) throw new Error('No issue local_id');
      const db = await getDb();
      const updateLocalId = generateLocalId();
      const now = new Date().toISOString();

      await db.runAsync(
        `INSERT INTO issue_updates
         (local_id, issue_local_id, user_id, event_type, note, created_at, sync_status)
         VALUES (?, ?, ?, 'update', ?, ?, 'pending_insert')`,
        [updateLocalId, issueLocalId, userId, note || null, now],
      );

      await enqueueIssueUpdateWrite(updateLocalId, {
        local_id: updateLocalId,
        issue_id: issueLocalId,
        user_id: userId,
        event_type: 'update',
        note: note || null,
        status_value: null,
        created_at: now,
      });

      for (const photo of photos) {
        await db.runAsync(
          `INSERT INTO photos
           (local_id, issue_local_id, user_id, taken_at, latitude, longitude,
            photo_hash, local_path, update_local_id, created_at, sync_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_insert')`,
          [
            photo.localId,
            issueLocalId,
            userId,
            photo.takenAt,
            photo.latitude ?? null,
            photo.longitude ?? null,
            photo.hash,
            photo.uri,
            updateLocalId,
            now,
          ],
        );
        await enqueuePhotoUpload(
          photo.localId,
          photo.uri,
          {
            issue_id: issueLocalId,
            user_id: userId,
            storage_path: '',
            taken_at: photo.takenAt,
            latitude: photo.latitude ?? null,
            longitude: photo.longitude ?? null,
            photo_hash: photo.hash,
            local_id: photo.localId,
            watermarked_path: null,
          },
          updateLocalId,
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issue', routeId] });
      queryClient.invalidateQueries({ queryKey: ['updates', routeId] });
      queryClient.invalidateQueries({ queryKey: ['photos', routeId] });
    },
  });
}
