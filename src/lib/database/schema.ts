/**
 * Local SQLite schema — mirrors the Supabase schema with added sync columns.
 *
 * Design principle: the local SQLite database is the PRIMARY store.
 * Supabase is a sync target. All writes go to SQLite first; the UI
 * reads from SQLite. The sync worker flushes pending operations to
 * Supabase when connectivity is available.
 */

/**
 * SQL DDL for all local tables.
 * Each table mirrors its Supabase counterpart plus:
 *   - sync_status: 'pending_insert' | 'pending_update' | 'synced'
 *   - local_id:    device-generated UUID (stable across sync)
 *
 * Migrations are append-only — never modify a previous version.
 */
export const MIGRATIONS: Array<{ version: number; sql: string }> = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS _migrations (
        version   INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS issues (
        id                   TEXT,
        local_id             TEXT PRIMARY KEY,
        user_id              TEXT NOT NULL,
        building_id          TEXT,
        category             TEXT NOT NULL,
        status               TEXT NOT NULL DEFAULT 'open',
        description          TEXT,
        first_reported_at    TEXT NOT NULL,
        landlord_notified_at TEXT,
        legal_deadline_days  INTEGER,
        legal_deadline_at    TEXT,
        client_updated_at    TEXT NOT NULL,
        created_at           TEXT NOT NULL,
        sync_status          TEXT NOT NULL DEFAULT 'pending_insert'
      );

      CREATE TABLE IF NOT EXISTS photos (
        id               TEXT,
        local_id         TEXT PRIMARY KEY,
        issue_local_id   TEXT NOT NULL,
        issue_id         TEXT,
        user_id          TEXT NOT NULL,
        storage_path     TEXT,
        watermarked_path TEXT,
        taken_at         TEXT NOT NULL,
        latitude         REAL,
        longitude        REAL,
        photo_hash       TEXT NOT NULL,
        local_path       TEXT,
        created_at       TEXT NOT NULL,
        sync_status      TEXT NOT NULL DEFAULT 'pending_insert',
        FOREIGN KEY (issue_local_id) REFERENCES issues(local_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS communications (
        id          TEXT,
        local_id    TEXT PRIMARY KEY,
        issue_local_id TEXT NOT NULL,
        issue_id    TEXT,
        user_id     TEXT NOT NULL,
        direction   TEXT NOT NULL,
        method      TEXT NOT NULL,
        summary     TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'pending_insert',
        FOREIGN KEY (issue_local_id) REFERENCES issues(local_id) ON DELETE CASCADE
      );

      -- Sync queue for tracking in-flight operations and retries
      CREATE TABLE IF NOT EXISTS sync_queue (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name    TEXT NOT NULL,
        local_id      TEXT NOT NULL,
        operation     TEXT NOT NULL,  -- 'insert' | 'update' | 'photo_upload'
        payload       TEXT,           -- JSON
        attempts      INTEGER NOT NULL DEFAULT 0,
        last_error    TEXT,
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        next_retry_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS sync_queue_next_retry_idx
        ON sync_queue(next_retry_at);
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS issue_updates (
        id               TEXT,
        local_id         TEXT PRIMARY KEY,
        issue_local_id   TEXT NOT NULL,
        issue_id         TEXT,
        user_id          TEXT NOT NULL,
        event_type       TEXT NOT NULL DEFAULT 'update',
        note             TEXT,
        status_value     TEXT,
        created_at       TEXT NOT NULL,
        sync_status      TEXT NOT NULL DEFAULT 'pending_insert',
        FOREIGN KEY (issue_local_id) REFERENCES issues(local_id) ON DELETE CASCADE
      );

      ALTER TABLE photos ADD COLUMN update_local_id TEXT;

      CREATE INDEX IF NOT EXISTS issue_updates_issue_idx
        ON issue_updates(issue_local_id, created_at);
    `,
  },
];
