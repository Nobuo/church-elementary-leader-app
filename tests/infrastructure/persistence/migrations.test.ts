import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { AppDatabase } from '@infrastructure/persistence/app-database';
import {
  runMigrations,
  rollbackMigrations,
  handleMigrateTarget,
} from '@infrastructure/persistence/migrations/index';

function createTestDb(): AppDatabase {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  return db;
}

function getAppliedVersions(db: AppDatabase): number[] {
  return db
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .all()
    .map((row) => (row as { version: number }).version);
}

function getTableNames(db: AppDatabase): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((row) => (row as { name: string }).name);
}

function getColumnNames(db: AppDatabase, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
    (row) => row.name,
  );
}

describe('Migration up/down roundtrip', () => {
  let db: AppDatabase;

  afterEach(() => {
    (db as unknown as Database.Database).close();
  });

  it('001: members テーブルを作成・削除・再作成できる', () => {
    db = createTestDb();
    runMigrations(db);
    expect(getTableNames(db)).toContain('members');

    rollbackMigrations(db, 0);
    expect(getTableNames(db)).not.toContain('members');

    runMigrations(db);
    expect(getTableNames(db)).toContain('members');
  });

  it('002: schedules テーブルを作成・削除・再作成できる', () => {
    db = createTestDb();
    runMigrations(db);
    expect(getTableNames(db)).toContain('schedules');

    rollbackMigrations(db, 1);
    expect(getTableNames(db)).not.toContain('schedules');

    runMigrations(db);
    expect(getTableNames(db)).toContain('schedules');
  });

  it('003: assignments テーブルを作成・削除・再作成できる', () => {
    db = createTestDb();
    runMigrations(db);
    expect(getTableNames(db)).toContain('assignments');

    rollbackMigrations(db, 2);
    expect(getTableNames(db)).not.toContain('assignments');

    runMigrations(db);
    expect(getTableNames(db)).toContain('assignments');
  });

  it('004: is_event カラムを追加・除去・再追加できる', () => {
    db = createTestDb();
    runMigrations(db);
    expect(getColumnNames(db, 'schedules')).toContain('is_event');

    rollbackMigrations(db, 3);
    expect(getColumnNames(db, 'schedules')).not.toContain('is_event');

    runMigrations(db);
    expect(getColumnNames(db, 'schedules')).toContain('is_event');
  });

  it('005: is_split_class カラムを追加・除去・再追加できる', () => {
    db = createTestDb();
    runMigrations(db);
    expect(getColumnNames(db, 'schedules')).toContain('is_split_class');

    rollbackMigrations(db, 4);
    expect(getColumnNames(db, 'schedules')).not.toContain('is_split_class');

    runMigrations(db);
    expect(getColumnNames(db, 'schedules')).toContain('is_split_class');
  });
  it('006: grade_group CHECK制約にANYを追加・除去・再追加できる', () => {
    db = createTestDb();
    runMigrations(db);

    // ANY should be accepted after migration 006
    db.prepare(
      "INSERT INTO members (id, name, gender, language, grade_group, member_type) VALUES (?, ?, ?, ?, ?, ?)",
    ).run('m-any', 'AnyHelper', 'FEMALE', 'BOTH', 'ANY', 'HELPER');
    const found = db.prepare("SELECT * FROM members WHERE id = 'm-any'").get() as Record<string, unknown>;
    expect(found.grade_group).toBe('ANY');

    // Rollback 006 — ANY members are removed
    rollbackMigrations(db, 5);
    expect(() =>
      db.prepare(
        "INSERT INTO members (id, name, gender, language, grade_group, member_type) VALUES (?, ?, ?, ?, ?, ?)",
      ).run('m-any2', 'AnyHelper2', 'FEMALE', 'BOTH', 'ANY', 'HELPER'),
    ).toThrow();

    // Re-apply
    runMigrations(db);
    db.prepare(
      "INSERT INTO members (id, name, gender, language, grade_group, member_type) VALUES (?, ?, ?, ?, ?, ?)",
    ).run('m-any3', 'AnyHelper3', 'FEMALE', 'BOTH', 'ANY', 'HELPER');
    const found2 = db.prepare("SELECT * FROM members WHERE id = 'm-any3'").get() as Record<string, unknown>;
    expect(found2.grade_group).toBe('ANY');
  });

  it('004/005: データが入っている状態でもロールバック・復元できる', () => {
    db = createTestDb();
    runMigrations(db);

    // Insert test data
    db.prepare(
      "INSERT INTO members (id, name, gender, language, grade_group, member_type) VALUES (?, ?, ?, ?, ?, ?)",
    ).run('m1', 'Test', 'MALE', 'JAPANESE', 'UPPER', 'PARENT_SINGLE');
    db.prepare(
      "INSERT INTO schedules (id, date, is_excluded, year, is_event, is_split_class) VALUES (?, ?, ?, ?, ?, ?)",
    ).run('s1', '2026-04-05', 0, 2026, 1, 1);
    db.prepare(
      "INSERT INTO assignments (id, schedule_id, group_number, member_id_1, member_id_2) VALUES (?, ?, ?, ?, ?)",
    ).run('a1', 's1', 1, 'm1', 'm1');

    // Rollback 005 (remove is_split_class)
    rollbackMigrations(db, 4);
    expect(getColumnNames(db, 'schedules')).not.toContain('is_split_class');
    const row4 = db.prepare("SELECT * FROM schedules WHERE id = 's1'").get() as Record<string, unknown>;
    expect(row4.is_event).toBe(1);

    // Rollback 004 (remove is_event)
    rollbackMigrations(db, 3);
    expect(getColumnNames(db, 'schedules')).not.toContain('is_event');
    const row3 = db.prepare("SELECT * FROM schedules WHERE id = 's1'").get() as Record<string, unknown>;
    expect(row3.date).toBe('2026-04-05');

    // Restore all
    runMigrations(db);
    expect(getColumnNames(db, 'schedules')).toContain('is_event');
    expect(getColumnNames(db, 'schedules')).toContain('is_split_class');
  });
});

describe('rollbackMigrations', () => {
  let db: AppDatabase;

  afterEach(() => {
    (db as unknown as Database.Database).close();
  });

  it('指定バージョンまでロールバックする', () => {
    db = createTestDb();
    runMigrations(db);
    expect(getAppliedVersions(db)).toEqual([1, 2, 3, 4, 5, 6]);

    rollbackMigrations(db, 3);
    expect(getAppliedVersions(db)).toEqual([1, 2, 3]);
  });

  it('schema_migrations からロールバック済みバージョンが削除される', () => {
    db = createTestDb();
    runMigrations(db);

    rollbackMigrations(db, 2);
    const versions = getAppliedVersions(db);
    expect(versions).toEqual([1, 2]);
    expect(versions).not.toContain(3);
    expect(versions).not.toContain(4);
    expect(versions).not.toContain(5);
  });

  it('ロールバック後に再度 runMigrations で復元できる', () => {
    db = createTestDb();
    runMigrations(db);

    rollbackMigrations(db, 0);
    expect(getAppliedVersions(db)).toEqual([]);

    runMigrations(db);
    expect(getAppliedVersions(db)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(getTableNames(db)).toContain('members');
    expect(getTableNames(db)).toContain('schedules');
    expect(getTableNames(db)).toContain('assignments');
  });

  it('現在バージョン以上を指定すると何もしない', () => {
    db = createTestDb();
    runMigrations(db);

    rollbackMigrations(db, 6);
    expect(getAppliedVersions(db)).toEqual([1, 2, 3, 4, 5, 6]);

    rollbackMigrations(db, 10);
    expect(getAppliedVersions(db)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('handleMigrateTarget', () => {
  let db: AppDatabase;
  const originalEnv = { ...process.env };

  afterEach(() => {
    (db as unknown as Database.Database).close();
    process.env = { ...originalEnv };
  });

  it('DB_MIGRATE_TARGET=3 でバージョン3までロールバック', () => {
    db = createTestDb();
    runMigrations(db);
    process.env.DB_MIGRATE_TARGET = '3';

    handleMigrateTarget(db);
    expect(getAppliedVersions(db)).toEqual([1, 2, 3]);
  });

  it('DB_MIGRATE_TARGET未設定で何もしない', () => {
    db = createTestDb();
    runMigrations(db);
    delete process.env.DB_MIGRATE_TARGET;

    handleMigrateTarget(db);
    expect(getAppliedVersions(db)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('無効な値でエラーをthrow', () => {
    db = createTestDb();
    runMigrations(db);
    process.env.DB_MIGRATE_TARGET = 'abc';

    expect(() => handleMigrateTarget(db)).toThrow('Invalid DB_MIGRATE_TARGET');
  });

  it('負の値でエラーをthrow', () => {
    db = createTestDb();
    runMigrations(db);
    process.env.DB_MIGRATE_TARGET = '-1';

    expect(() => handleMigrateTarget(db)).toThrow('Invalid DB_MIGRATE_TARGET');
  });
});
