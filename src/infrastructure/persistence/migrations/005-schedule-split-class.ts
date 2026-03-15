import type { Migration } from './migration.js';

export const migration005: Migration = {
  version: 5,
  description: 'Add is_split_class column to schedules',
  up(db) {
    db.exec('ALTER TABLE schedules ADD COLUMN is_split_class INTEGER NOT NULL DEFAULT 0');
  },
  down(db) {
    // SQLite ALTER TABLE DROP COLUMN may not be supported on older versions.
    // Use table recreation pattern for safety.
    db.exec(`
      CREATE TABLE schedules_backup (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL UNIQUE,
        is_excluded INTEGER NOT NULL DEFAULT 0,
        year INTEGER NOT NULL,
        is_event INTEGER NOT NULL DEFAULT 0
      )
    `);
    db.exec(
      'INSERT INTO schedules_backup SELECT id, date, is_excluded, year, is_event FROM schedules',
    );
    db.exec('DROP TABLE schedules');
    db.exec('ALTER TABLE schedules_backup RENAME TO schedules');
    db.exec('CREATE INDEX idx_schedules_year ON schedules(year)');
    db.exec('CREATE INDEX idx_schedules_date ON schedules(date)');
  },
};
