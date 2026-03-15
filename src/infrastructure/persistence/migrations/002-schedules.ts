import type { Migration } from './migration.js';

export const migration002: Migration = {
  version: 2,
  description: 'Create schedules table',
  up(db) {
    db.exec(`
      CREATE TABLE schedules (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL UNIQUE,
        is_excluded INTEGER NOT NULL DEFAULT 0,
        year INTEGER NOT NULL
      )
    `);
    db.exec('CREATE INDEX idx_schedules_year ON schedules(year)');
    db.exec('CREATE INDEX idx_schedules_date ON schedules(date)');
  },
  down(db) {
    db.exec('DROP INDEX IF EXISTS idx_schedules_year');
    db.exec('DROP INDEX IF EXISTS idx_schedules_date');
    db.exec('DROP TABLE IF EXISTS schedules');
  },
};
