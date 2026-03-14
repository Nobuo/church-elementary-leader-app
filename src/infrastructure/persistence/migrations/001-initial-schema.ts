import Database from 'better-sqlite3';

export function migration001(db: Database.Database): void {
  db.exec(`
    CREATE TABLE members (
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
}
