import Database from 'better-sqlite3';

export function migration003(db: Database.Database): void {
  db.exec(`
    CREATE TABLE assignments (
      id TEXT PRIMARY KEY,
      schedule_id TEXT NOT NULL,
      group_number INTEGER NOT NULL CHECK (group_number IN (1, 2)),
      member_id_1 TEXT NOT NULL,
      member_id_2 TEXT NOT NULL,
      FOREIGN KEY (schedule_id) REFERENCES schedules(id),
      FOREIGN KEY (member_id_1) REFERENCES members(id),
      FOREIGN KEY (member_id_2) REFERENCES members(id)
    )
  `);

  db.exec(`CREATE INDEX idx_assignments_schedule ON assignments(schedule_id)`);
}
