/**
 * SQLite database client — singleton instance with migration runner.
 *
 * Usage:
 *   const db = await getDb();
 *   await db.runAsync('INSERT INTO issues ...', [...]);
 */

import * as SQLite from 'expo-sqlite';
import { MIGRATIONS } from './schema';

let _db: SQLite.SQLiteDatabase | null = null;
let _initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Returns the singleton SQLite database, running any pending migrations
 * on first call. Concurrent callers all wait for the same initialization
 * promise, ensuring migrations run exactly once. On failure the promise
 * is cleared so the next call can retry.
 */
export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  if (!_initPromise) {
    _initPromise = _initDb().catch((err) => {
      _initPromise = null; // allow retry on next call
      throw err;
    });
  }
  return _initPromise;
}

async function _initDb(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('tenant-guardian.db');

  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  await runMigrations(db);

  _db = db;
  return db;
}

/**
 * Runs pending migrations by executing each SQL statement individually
 * via execAsync, then recording the version in _migrations.
 *
 * We intentionally avoid wrapping DDL in withTransactionAsync because
 * expo-sqlite v14+ has known issues with multi-statement execAsync calls
 * inside explicit transactions on iOS. Running statements individually is
 * safe: all DDL uses IF NOT EXISTS / IF EXISTS guards, so retrying a
 * partially-applied migration is idempotent.
 */
async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version    INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Detect broken state: migration v1 was recorded as applied but the photos
  // table was never actually created (caused by the withTransactionAsync +
  // multi-statement execAsync bug in older expo-sqlite). Reset v1 so it re-runs.
  const v1Applied = await db.getFirstAsync<{ version: number }>(
    'SELECT version FROM _migrations WHERE version = 1',
  );
  if (v1Applied) {
    const photosExists = await db.getFirstAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='photos'",
    );
    if (!photosExists) {
      await db.runAsync('DELETE FROM _migrations WHERE version = 1');
    }
  }

  const result = await db.getFirstAsync<{ max_version: number | null }>(
    'SELECT MAX(version) as max_version FROM _migrations',
  );
  const currentVersion = result?.max_version ?? 0;

  for (const migration of MIGRATIONS) {
    if (migration.version > currentVersion) {
      // Split into individual statements and run each one separately.
      // This avoids the expo-sqlite bug where multi-statement execAsync
      // inside withTransactionAsync silently drops DDL on iOS.
      const statements = migration.sql
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      for (const stmt of statements) {
        await db.execAsync(stmt + ';');
      }

      // Record version last — if any statement above threw, this won't
      // run and the migration will be retried on next launch.
      await db.runAsync('INSERT INTO _migrations (version) VALUES (?)', [migration.version]);
    }
  }
}

/**
 * Closes the database connection. Call this only in tests or on app exit.
 */
export async function closeDb(): Promise<void> {
  if (_db) {
    await _db.closeAsync();
    _db = null;
    _initPromise = null;
  }
}
