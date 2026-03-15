import Database from 'better-sqlite3';
import type { AppDatabase } from './app-database.js';
import { resolveDbPath, migrateOldDbIfNeeded } from '../config/data-dir.js';
import { runMigrations, handleMigrateTarget } from './migrations/index.js';

export function createDatabase(path?: string): AppDatabase {
  const dbPath = path ?? resolveDbPath();
  if (!path && !process.env.DB_PATH) {
    migrateOldDbIfNeeded(dbPath);
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  handleMigrateTarget(db);
  return db;
}
