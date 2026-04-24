import type { Migration } from './migration.js';

export const migration012: Migration = {
  version: 12,
  description: 'Add notes column to members',
  up(db) {
    db.exec("ALTER TABLE members ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
  },
  down(db) {
    db.exec(`
      CREATE TABLE members_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        gender TEXT NOT NULL CHECK (gender IN ('MALE', 'FEMALE')),
        language TEXT NOT NULL CHECK (language IN ('JAPANESE', 'ENGLISH', 'BOTH')),
        grade_group TEXT NOT NULL CHECK (grade_group IN ('LOWER', 'UPPER', 'ANY')),
        member_type TEXT NOT NULL CHECK (member_type IN ('PARENT_COUPLE', 'PARENT_SINGLE', 'HELPER')),
        same_gender_only INTEGER NOT NULL DEFAULT 0,
        spouse_id TEXT,
        available_dates TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (spouse_id) REFERENCES members_new(id)
      );

      INSERT INTO members_new (id, name, gender, language, grade_group, member_type, same_gender_only, spouse_id, available_dates, is_active)
      SELECT id, name, gender, language, grade_group, member_type, same_gender_only, spouse_id, available_dates, is_active
      FROM members;

      DROP TABLE members;
      ALTER TABLE members_new RENAME TO members;
    `);
  },
};
