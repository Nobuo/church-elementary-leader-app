import type { AppDatabase } from '../app-database.js';
import type { Migration } from './migration.js';
import { migration001 } from './001-initial-schema.js';
import { migration002 } from './002-schedules.js';
import { migration003 } from './003-assignments.js';
import { migration004 } from './004-schedule-events.js';
import { migration005 } from './005-schedule-split-class.js';
import { migration006 } from './006-grade-group-any.js';

export type { Migration } from './migration.js';

export const migrations: Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
];

export function runMigrations(db: AppDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    db
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((row) => (row as { version: number }).version),
  );

  const pending = migrations.filter((m) => !applied.has(m.version));
  if (pending.length > 0) {
    db.exec('PRAGMA foreign_keys = OFF');
    try {
      for (const migration of pending) {
        db.transaction(() => {
          migration.up(db);
          db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(migration.version);
        })();
      }
    } finally {
      db.exec('PRAGMA foreign_keys = ON');
    }
  }
}

export function rollbackMigrations(db: AppDatabase, targetVersion: number): void {
  const applied = new Set(
    db
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((row) => (row as { version: number }).version),
  );

  if (applied.size === 0) {
    return;
  }

  const maxVersion = Math.max(...applied);
  if (targetVersion >= maxVersion) {
    return;
  }

  // Disable FK constraints for rollback (PRAGMA cannot be changed inside a transaction)
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    for (let v = maxVersion; v > targetVersion; v--) {
      if (!applied.has(v)) continue;
      const migration = migrations.find((m) => m.version === v);
      if (!migration) {
        throw new Error(`Migration version ${v} not found`);
      }
      db.transaction(() => {
        migration.down(db);
        db.prepare('DELETE FROM schema_migrations WHERE version = ?').run(v);
      })();
    }
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

export function handleMigrateTarget(db: AppDatabase): void {
  const target = process.env.DB_MIGRATE_TARGET;
  if (target !== undefined) {
    const targetVersion = parseInt(target, 10);
    if (isNaN(targetVersion) || targetVersion < 0) {
      throw new Error(`Invalid DB_MIGRATE_TARGET: ${target}`);
    }
    rollbackMigrations(db, targetVersion);
  }
}
