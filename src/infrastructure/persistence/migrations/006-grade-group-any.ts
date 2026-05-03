import type { Migration } from './migration.js';

export const migration006: Migration = {
  version: 6,
  description: 'Add ANY to grade_group CHECK constraint',
  up(db) {
    // SQLite では CHECK 制約を ALTER できないため、テーブルを再作成する
    // up() 呼び出し前に runMigrations が外部キー制約を無効化している
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
        FOREIGN KEY (spouse_id) REFERENCES members(id)
      )
    `);
    db.exec('INSERT INTO members_new SELECT * FROM members');
    db.exec('DROP TABLE members');
    db.exec('ALTER TABLE members_new RENAME TO members');
  },
  down(db) {
    db.exec(`
      CREATE TABLE members_old (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        gender TEXT NOT NULL CHECK (gender IN ('MALE', 'FEMALE')),
        language TEXT NOT NULL CHECK (language IN ('JAPANESE', 'ENGLISH', 'BOTH')),
        grade_group TEXT NOT NULL CHECK (grade_group IN ('LOWER', 'UPPER')),
        member_type TEXT NOT NULL CHECK (member_type IN ('PARENT_COUPLE', 'PARENT_SINGLE', 'HELPER')),
        same_gender_only INTEGER NOT NULL DEFAULT 0,
        spouse_id TEXT,
        available_dates TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (spouse_id) REFERENCES members(id)
      )
    `);
    db.exec("INSERT INTO members_old SELECT * FROM members WHERE grade_group != 'ANY'");
    db.exec('DROP TABLE members');
    db.exec('ALTER TABLE members_old RENAME TO members');
  },
};
