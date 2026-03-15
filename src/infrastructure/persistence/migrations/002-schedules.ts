import type { AppDatabase } from '../app-database.js';

export function migration002(db: AppDatabase): void {
  db.exec(`
    CREATE TABLE schedules (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL UNIQUE,
      is_excluded INTEGER NOT NULL DEFAULT 0,
      year INTEGER NOT NULL
    )
  `);

  db.exec(`CREATE INDEX idx_schedules_year ON schedules(year)`);
  db.exec(`CREATE INDEX idx_schedules_date ON schedules(date)`);
}
