import type { Migration } from './migration.js';

export const migration007: Migration = {
  version: 7,
  description: 'Add member_id_3 column to assignments for combined-day 3-member groups',
  up(db) {
    db.exec('ALTER TABLE assignments ADD COLUMN member_id_3 TEXT DEFAULT NULL');
  },
  down(db) {
    // SQLite cannot DROP COLUMN in older versions, so recreate the table
    db.exec(`
      CREATE TABLE assignments_old (
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
    db.exec(
      'INSERT INTO assignments_old (id, schedule_id, group_number, member_id_1, member_id_2) SELECT id, schedule_id, group_number, member_id_1, member_id_2 FROM assignments',
    );
    db.exec('DROP TABLE assignments');
    db.exec('ALTER TABLE assignments_old RENAME TO assignments');
    db.exec('CREATE INDEX idx_assignments_schedule ON assignments(schedule_id)');
  },
};
