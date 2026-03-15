import type { AppDatabase } from '../app-database.js';

export function migration005(db: AppDatabase): void {
  db.exec(`ALTER TABLE schedules ADD COLUMN is_split_class INTEGER NOT NULL DEFAULT 0`);
}
