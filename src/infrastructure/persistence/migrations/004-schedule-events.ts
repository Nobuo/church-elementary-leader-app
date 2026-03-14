import Database from 'better-sqlite3';

export function migration004(db: Database.Database): void {
  db.exec(`ALTER TABLE schedules ADD COLUMN is_event INTEGER NOT NULL DEFAULT 0`);
}
