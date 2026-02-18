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

/**
 * Returns the singleton SQLite database, running any pending migrations
 * on first call.
 */
export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;

  const db = await SQLite.openDatabaseAsync('tenant-guardian.db');

  // Enable WAL mode for better concurrent read performance
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  await runMigrations(db);

  _db = db;
  return db;
}

async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  // Ensure the migrations table exists first
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version    INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const result = await db.getFirstAsync<{ max_version: number | null }>(
    'SELECT MAX(version) as max_version FROM _migrations',
  );
  const currentVersion = result?.max_version ?? 0;

  for (const migration of MIGRATIONS) {
    if (migration.version > currentVersion) {
      await db.withTransactionAsync(async () => {
        await db.execAsync(migration.sql);
        await db.runAsync('INSERT INTO _migrations (version) VALUES (?)', [migration.version]);
      });
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
  }
}
