import Database from 'better-sqlite3';
import { runMigrations } from './migrations/index.js';

export function createDatabase(path?: string): Database.Database {
  const dbPath = path ?? process.env.DB_PATH ?? 'mach-leader.db';
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}
