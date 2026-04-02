import type { Migration } from './migration.js';

export const migration010: Migration = {
  version: 10,
  description: 'Add event_name_ja and event_name_en columns to schedules',
  up(db) {
    db.exec('ALTER TABLE schedules ADD COLUMN event_name_ja TEXT DEFAULT NULL');
    db.exec('ALTER TABLE schedules ADD COLUMN event_name_en TEXT DEFAULT NULL');
  },
  down(db) {
    db.exec(`
      CREATE TABLE schedules_backup (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL UNIQUE,
        is_excluded INTEGER NOT NULL DEFAULT 0,
        year INTEGER NOT NULL,
        is_event INTEGER NOT NULL DEFAULT 0,
        is_split_class INTEGER NOT NULL DEFAULT 0,
        split_type TEXT DEFAULT NULL,
        is_ebt INTEGER NOT NULL DEFAULT 0
      )
    `);
    db.exec(
      'INSERT INTO schedules_backup SELECT id, date, is_excluded, year, is_event, is_split_class, split_type, is_ebt FROM schedules',
    );
    db.exec('DROP TABLE schedules');
    db.exec('ALTER TABLE schedules_backup RENAME TO schedules');
    db.exec('CREATE INDEX idx_schedules_year ON schedules(year)');
    db.exec('CREATE INDEX idx_schedules_date ON schedules(date)');
  },
};
