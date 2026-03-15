import Database from 'better-sqlite3';
import type { AppDatabase } from './app-database.js';
import { runMigrations } from './migrations/index.js';

export function createDatabase(path?: string): AppDatabase {
  const dbPath = path ?? process.env.DB_PATH ?? 'leader-app.db';
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}
