/**
 * Offline Mutation Queue — Tenant Guardian
 *
 * Architecture:
 *   1. All writes go to SQLite first (sync_status = 'pending_insert' or 'pending_update').
 *   2. A sync queue entry is appended to the sync_queue table.
 *   3. The sync worker is triggered by NetInfo on reconnect, or by background fetch.
 *   4. The worker flushes pending operations to Supabase, resolving local_id → server id.
 *   5. Photos are uploaded sequentially (not in parallel) to be kind to slow connections.
 *   6. Conflict resolution: last-write-wins using client_updated_at.
 *
 * Retry policy: exponential backoff, max 5 attempts.
 *   attempt 1: immediate
 *   attempt 2: +30s
 *   attempt 3: +2m
 *   attempt 4: +10m
 *   attempt 5: +1h
 *   after 5 failures: entry stays in queue but is not retried automatically;
 *     the UI can surface these as "sync errors" for the user.
 */

import { File } from 'expo-file-system';
import { getDb } from '@/lib/database/client';
import { supabase } from '@/lib/supabase';
import type {
  IssueInsert,
  IssueUpdateInsert,
  PhotoInsert,
  CommunicationInsert,
  BuildingInsert,
} from '@/types/database';

// -------------------------------------------------------
// Types
// -------------------------------------------------------

export type PhotoUploadPayload = PhotoInsert & {
  localPath: string;
  updateLocalId?: string | null; // local-only
};

export type QueueOperation = 'insert' | 'update' | 'photo_upload';

export interface QueueEntry {
  id: number;
  table_name: string;
  local_id: string;
  operation: QueueOperation;
  payload: string | null; // JSON
  attempts: number;
  last_error: string | null;
  created_at: string;
  next_retry_at: string;
}

const MAX_ATTEMPTS = 5;

// Exponential backoff delays in milliseconds
const BACKOFF_DELAYS_MS = [0, 30_000, 120_000, 600_000, 3_600_000];

// -------------------------------------------------------
// Enqueue helpers (called by hooks/store on every write)
// -------------------------------------------------------

/**
 * Enqueues an issue insert or update operation.
 * The caller is responsible for writing to local SQLite first.
 */
export async function enqueueIssueWrite(
  localId: string,
  operation: 'insert' | 'update',
  payload: IssueInsert,
): Promise<void> {
  await enqueue('issues', localId, operation, payload);
}

export async function enqueueCommunicationWrite(
  localId: string,
  operation: 'insert' | 'update',
  payload: CommunicationInsert,
): Promise<void> {
  await enqueue('communications', localId, operation, payload);
}

export async function enqueueBuildingWrite(
  localId: string,
  payload: BuildingInsert,
): Promise<void> {
  await enqueue('buildings', localId, 'insert', payload);
}

export async function enqueueIssueUpdateWrite(
  localId: string,
  payload: IssueUpdateInsert,
): Promise<void> {
  await enqueue('issue_updates', localId, 'insert', payload);
}

/**
 * Enqueues a photo upload. The photo must already be saved to the local filesystem.
 * localPath is the device file URI; the upload worker reads the file from disk.
 */
export async function enqueuePhotoUpload(
  localId: string,
  localPath: string,
  payload: PhotoInsert,
  updateLocalId?: string | null,
): Promise<void> {
  const fullPayload: PhotoUploadPayload = {
    localPath,
    updateLocalId: updateLocalId ?? null,
    ...payload,
  };
  await enqueue('photos', localId, 'photo_upload', fullPayload);
}

async function enqueue(
  tableName: string,
  localId: string,
  operation: QueueOperation,
  payload: unknown,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO sync_queue (table_name, local_id, operation, payload, next_retry_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
    [tableName, localId, operation, JSON.stringify(payload)],
  );
}

// -------------------------------------------------------
// Sync worker
// -------------------------------------------------------

let _isSyncing = false;

/**
 * Flushes all pending sync_queue entries to Supabase.
 * Safe to call concurrently — a guard prevents re-entrant runs.
 *
 * @returns Number of successfully synced operations
 */
export async function flushQueue(): Promise<number> {
  if (_isSyncing) return 0;
  _isSyncing = true;

  let synced = 0;
  try {
    const db = await getDb();

    // Process entries in creation order, only those due for retry
    const entries = await db.getAllAsync<QueueEntry>(
      `SELECT * FROM sync_queue
       WHERE attempts < ? AND next_retry_at <= datetime('now')
       ORDER BY id ASC`,
      [MAX_ATTEMPTS],
    );

    for (const entry of entries) {
      const success = await processEntry(entry);
      if (success) synced++;
    }
  } finally {
    _isSyncing = false;
  }

  return synced;
}

async function processEntry(entry: QueueEntry): Promise<boolean> {
  const db = await getDb();

  try {
    if (entry.table_name === 'photos' && entry.operation === 'photo_upload') {
      await handlePhotoUpload(entry);
    } else {
      await handleRowSync(entry);
    }

    // Success — remove from queue, update sync_status in local table
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM sync_queue WHERE id = ?', [entry.id]);
      await db.runAsync(
        `UPDATE ${entry.table_name} SET sync_status = 'synced' WHERE local_id = ?`,
        [entry.local_id],
      );
    });

    return true;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const nextAttempt = entry.attempts + 1;
    const delayMs =
      BACKOFF_DELAYS_MS[Math.min(nextAttempt, BACKOFF_DELAYS_MS.length - 1)] ?? 3_600_000;
    const nextRetryAt = new Date(Date.now() + delayMs)
      .toISOString()
      .replace('T', ' ')
      .substring(0, 19);

    await db.runAsync(
      `UPDATE sync_queue
       SET attempts = ?, last_error = ?, next_retry_at = datetime(?)
       WHERE id = ?`,
      [nextAttempt, errorMsg, nextRetryAt, entry.id],
    );

    console.warn(`[sync] Failed to sync ${entry.table_name}/${entry.local_id}:`, errorMsg);
    return false;
  }
}

// -------------------------------------------------------
// Row sync handler
// -------------------------------------------------------

async function handleRowSync(entry: QueueEntry): Promise<void> {
  const payload = entry.payload ? (JSON.parse(entry.payload) as Record<string, unknown>) : {};
  const db = await getDb();

  if (entry.operation === 'insert') {
    // Resolve local_id references to server IDs before inserting
    const resolved = await resolveLocalIds(payload, db);

    const { data, error } = await supabase
      .from(entry.table_name as 'issues' | 'communications' | 'buildings')
      .insert({ ...resolved, local_id: entry.local_id })
      .select('id')
      .single();

    if (error) throw new Error(`Supabase insert error: ${error.message}`);

    // Persist the server-assigned UUID back to local DB
    await db.runAsync(`UPDATE ${entry.table_name} SET id = ? WHERE local_id = ?`, [
      data.id,
      entry.local_id,
    ]);
  } else if (entry.operation === 'update') {
    // For updates, the server id may already be known in the local row
    const row = await db.getFirstAsync<{ id: string | null; client_updated_at: string }>(
      `SELECT id, client_updated_at FROM ${entry.table_name} WHERE local_id = ?`,
      [entry.local_id],
    );

    if (!row?.id) {
      // Server id not yet resolved — the insert may still be in flight.
      // Re-enqueue after the insert completes.
      throw new Error('Server ID not yet resolved; insert may be pending');
    }

    const { error } = await supabase
      .from(entry.table_name as 'issues' | 'communications')
      .update(payload)
      .eq('id', row.id)
      // Last-write-wins: only apply if our client_updated_at is newer
      .lt('client_updated_at', row.client_updated_at);

    if (error) throw new Error(`Supabase update error: ${error.message}`);
  }
}

// -------------------------------------------------------
// Photo upload handler (sequential, resumable)
// -------------------------------------------------------

async function handlePhotoUpload(entry: QueueEntry): Promise<void> {
  const payload = JSON.parse(entry.payload!) as PhotoUploadPayload;
  const { localPath, updateLocalId, ...photoMeta } = payload;

  const file = new File(localPath);
  if (!file.exists) throw new Error(`Local photo file not found: ${localPath}`);

  const db = await getDb();

  const issueRow = await db.getFirstAsync<{ id: string | null; local_id: string }>(
    'SELECT id, local_id FROM issues WHERE local_id = ?',
    [photoMeta.issue_id],
  );
  if (!issueRow?.id) {
    throw new Error('Parent issue server ID not yet resolved; waiting for issue sync');
  }

  // Resolve updateLocalId -> server update UUID (update_id)
  let updateId: string | null = null;
  if (updateLocalId) {
    const updateRow = await db.getFirstAsync<{ id: string | null }>(
      'SELECT id FROM issue_updates WHERE local_id = ?',
      [updateLocalId],
    );
    if (!updateRow?.id) {
      throw new Error('Parent update server ID not yet resolved; waiting for update sync');
    }
    updateId = updateRow.id;
  }

  const storagePath = `${photoMeta.user_id}/${issueRow.id}/${entry.local_id}.jpg`;

  // Upload bytes
  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from('evidence-photos')
    .upload(storagePath, arrayBuffer, {
      upsert: false,
      contentType: 'image/jpeg',
    });

  if (uploadError) throw new Error(`Storage upload error: ${uploadError.message}`);

  const { data, error: insertError } = await supabase
    .from('photos')
    .insert({
      ...photoMeta,
      issue_id: issueRow.id,
      storage_path: storagePath,
      local_id: entry.local_id,
      update_id: updateId,
    })
    .select('id')
    .single();

  if (insertError) throw new Error(`Photo insert error: ${insertError.message}`);

  // Update local DB with server id and storage path (optional: also store update_id if column exists)
  await db.runAsync('UPDATE photos SET id = ?, storage_path = ? WHERE local_id = ?', [
    data.id,
    storagePath,
    entry.local_id,
  ]);
}

// -------------------------------------------------------
// Utility: resolve local_id references in payload
// -------------------------------------------------------

/**
 * Before inserting a row that references another table by local_id,
 * look up the server-assigned UUID and substitute it.
 * This handles the case where a communication's issue_id is still a local_id.
 */
async function resolveLocalIds(
  payload: Record<string, unknown>,
  db: Awaited<ReturnType<typeof getDb>>,
): Promise<Record<string, unknown>> {
  const resolved = { ...payload };

  // Resolve issue_id: if it looks like a local_id (no server row yet), skip;
  // if it resolves to a server UUID, substitute it.
  if (typeof resolved.issue_id === 'string') {
    const row = await db.getFirstAsync<{ id: string | null }>(
      'SELECT id FROM issues WHERE local_id = ?',
      [resolved.issue_id],
    );
    if (row?.id) {
      resolved.issue_id = row.id;
    } else if (!isServerUuid(resolved.issue_id as string)) {
      throw new Error(
        `Cannot resolve issue_id "${resolved.issue_id}" — parent issue not yet synced`,
      );
    }
  }

  if (typeof resolved.building_id === 'string') {
    const row = await db.getFirstAsync<{ id: string | null }>(
      'SELECT id FROM buildings WHERE local_id = ?',
      [resolved.building_id],
    );
    if (row?.id) {
      resolved.building_id = row.id;
    }
    // If building has no server id yet, the insert will fail with FK constraint —
    // that's intentional: buildings should be synced before issues.
  }

  return resolved;
}

/**
 * Heuristic: PostgreSQL UUIDs are 36 chars with 4 hyphens.
 * Device-generated local_ids use the same format (crypto.randomUUID),
 * so this check is structural only — used to detect unresolved local ids
 * that were never given a server row.
 */
function isServerUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

// -------------------------------------------------------
// Pending count (for UI badge / sync indicator)
// -------------------------------------------------------

/**
 * Returns the number of operations still pending sync.
 */
export async function getPendingCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM sync_queue WHERE attempts < ?',
    [MAX_ATTEMPTS],
  );
  return row?.count ?? 0;
}

/**
 * Clears all local SQLite data. Call before signing out so the next
 * user doesn't see stale data from the previous session.
 */
export async function clearLocalData(): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM sync_queue');
    await db.runAsync('DELETE FROM issue_updates');
    await db.runAsync('DELETE FROM photos');
    await db.runAsync('DELETE FROM issues');
    await db.runAsync('DELETE FROM communications');
  });
}

/**
 * Seeds the local SQLite database from Supabase for a given user.
 * Only runs when there is no existing local data for the user (e.g. new
 * device, or after a sign-out that cleared local data).
 */
export async function seedFromSupabase(userId: string): Promise<void> {
  const db = await getDb();

  const existing = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM issues WHERE user_id = ?',
    [userId],
  );
  if ((existing?.count ?? 0) > 0) return;

  // Fetch issues
  const { data: issues } = await supabase.from('issues').select('*').eq('user_id', userId);

  if (!issues?.length) return;

  for (const issue of issues) {
    const localId = issue.local_id ?? issue.id;
    await db.runAsync(
      `INSERT OR REPLACE INTO issues
       (id, local_id, user_id, building_id, category, status, description,
        first_reported_at, landlord_notified_at, legal_deadline_days, legal_deadline_at,
        client_updated_at, created_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
      [
        issue.id,
        localId,
        issue.user_id,
        issue.building_id ?? null,
        issue.category,
        issue.status,
        issue.description ?? null,
        issue.first_reported_at,
        issue.landlord_notified_at ?? null,
        issue.legal_deadline_days ?? null,
        issue.legal_deadline_at ?? null,
        issue.client_updated_at,
        issue.created_at,
      ],
    );
  }

  // Fetch issue_updates FIRST (we need them to map photos.update_id -> update_local_id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updates } = (await (supabase as any)
    .from('issue_updates')
    .select('*')
    .eq('user_id', userId)) as {
    data: Array<{
      id: string;
      local_id: string | null;
      issue_id: string;
      user_id: string;
      event_type: string;
      note: string | null;
      status_value: string | null;
      created_at: string;
    }> | null;
  };

  if (updates?.length) {
    for (const update of updates) {
      const localId = update.local_id ?? update.id;
      const issueRow = await db.getFirstAsync<{ local_id: string }>(
        'SELECT local_id FROM issues WHERE id = ?',
        [update.issue_id],
      );
      if (!issueRow) continue;

      await db.runAsync(
        `INSERT OR REPLACE INTO issue_updates
         (id, local_id, issue_local_id, issue_id, user_id, event_type, note, status_value, created_at, sync_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
        [
          update.id,
          localId,
          issueRow.local_id,
          update.issue_id,
          update.user_id,
          update.event_type,
          update.note ?? null,
          update.status_value ?? null,
          update.created_at,
        ],
      );
    }
  }

  // Build map: server update UUID -> local update local_id
  const updateRows = await db.getAllAsync<{ id: string; local_id: string }>(
    'SELECT id, local_id FROM issue_updates WHERE user_id = ?',
    [userId],
  );
  const updateIdToLocalId = new Map(updateRows.map((u) => [u.id, u.local_id]));

  // Fetch photos AFTER updates so we can populate update_local_id locally
  const { data: photos } = await supabase.from('photos').select('*').eq('user_id', userId);

  if (photos?.length) {
    for (const photo of photos) {
      const localId = photo.local_id ?? photo.id;

      const issueRow = await db.getFirstAsync<{ local_id: string }>(
        'SELECT local_id FROM issues WHERE id = ?',
        [photo.issue_id],
      );
      if (!issueRow) continue;

      // Map server FK -> local update local id (used by your timeline)
      const updateLocalId = photo.update_id
        ? (updateIdToLocalId.get(photo.update_id) ?? null)
        : null;

      await db.runAsync(
        `INSERT OR REPLACE INTO photos
         (id, local_id, issue_local_id, issue_id, user_id, storage_path, watermarked_path,
          taken_at, latitude, longitude, photo_hash, local_path, update_local_id, created_at, sync_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 'synced')`,
        [
          photo.id,
          localId,
          issueRow.local_id,
          photo.issue_id,
          photo.user_id,
          photo.storage_path,
          photo.watermarked_path ?? null,
          photo.taken_at,
          photo.latitude ?? null,
          photo.longitude ?? null,
          photo.photo_hash,
          updateLocalId,
          photo.created_at,
        ],
      );
    }
  }
}

/**
 * Returns entries that have exhausted all retry attempts.
 * The UI should surface these as persistent errors for the user.
 */
export async function getFailedEntries(): Promise<QueueEntry[]> {
  const db = await getDb();
  return db.getAllAsync<QueueEntry>(
    'SELECT * FROM sync_queue WHERE attempts >= ? ORDER BY id ASC',
    [MAX_ATTEMPTS],
  );
}
