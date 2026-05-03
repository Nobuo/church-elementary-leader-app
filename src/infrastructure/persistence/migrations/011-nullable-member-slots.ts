import type { Migration } from './migration.js';

export const migration011: Migration = {
  version: 11,
  description: 'Make member_id_1 and member_id_2 nullable in assignments for vacant slots',
  up(db) {
    db.exec(`
      CREATE TABLE assignments_new (
        id TEXT PRIMARY KEY,
        schedule_id TEXT NOT NULL,
        group_number INTEGER NOT NULL CHECK (group_number IN (1, 2)),
        member_id_1 TEXT,
        member_id_2 TEXT,
        member_id_3 TEXT,
        FOREIGN KEY (schedule_id) REFERENCES schedules(id),
        FOREIGN KEY (member_id_1) REFERENCES members(id),
        FOREIGN KEY (member_id_2) REFERENCES members(id),
        FOREIGN KEY (member_id_3) REFERENCES members(id)
      )
    `);
    db.exec(
      'INSERT INTO assignments_new SELECT id, schedule_id, group_number, member_id_1, member_id_2, member_id_3 FROM assignments',
    );
    db.exec('DROP TABLE assignments');
    db.exec('ALTER TABLE assignments_new RENAME TO assignments');
    db.exec('CREATE INDEX idx_assignments_schedule ON assignments(schedule_id)');
  },
  down(db) {
    // NOT NULL 制約を戻す前に、メンバー枠が NULL の行を削除する
    db.exec('DELETE FROM assignments WHERE member_id_1 IS NULL OR member_id_2 IS NULL');
    db.exec(`
      CREATE TABLE assignments_old (
        id TEXT PRIMARY KEY,
        schedule_id TEXT NOT NULL,
        group_number INTEGER NOT NULL CHECK (group_number IN (1, 2)),
        member_id_1 TEXT NOT NULL,
        member_id_2 TEXT NOT NULL,
        member_id_3 TEXT,
        FOREIGN KEY (schedule_id) REFERENCES schedules(id),
        FOREIGN KEY (member_id_1) REFERENCES members(id),
        FOREIGN KEY (member_id_2) REFERENCES members(id),
        FOREIGN KEY (member_id_3) REFERENCES members(id)
      )
    `);
    db.exec(
      'INSERT INTO assignments_old SELECT id, schedule_id, group_number, member_id_1, member_id_2, member_id_3 FROM assignments',
    );
    db.exec('DROP TABLE assignments');
    db.exec('ALTER TABLE assignments_old RENAME TO assignments');
    db.exec('CREATE INDEX idx_assignments_schedule ON assignments(schedule_id)');
  },
};
