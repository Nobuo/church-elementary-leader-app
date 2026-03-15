import type { AppDatabase } from '../app-database.js';

export function migration004(db: AppDatabase): void {
  db.exec(`ALTER TABLE schedules ADD COLUMN is_event INTEGER NOT NULL DEFAULT 0`);
}
