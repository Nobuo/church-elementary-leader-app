import Database from 'better-sqlite3';

export function migration005(db: Database.Database): void {
  db.exec(`ALTER TABLE schedules ADD COLUMN is_split_class INTEGER NOT NULL DEFAULT 0`);
}
