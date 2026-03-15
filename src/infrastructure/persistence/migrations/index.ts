import type { AppDatabase } from '../app-database.js';
import { migration001 } from './001-initial-schema.js';
import { migration002 } from './002-schedules.js';
import { migration003 } from './003-assignments.js';
import { migration004 } from './004-schedule-events.js';
import { migration005 } from './005-schedule-split-class.js';

const migrations = [migration001, migration002, migration003, migration004, migration005];

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

  for (let i = 0; i < migrations.length; i++) {
    const version = i + 1;
    if (!applied.has(version)) {
      db.transaction(() => {
        migrations[i](db);
        db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(version);
      })();
    }
  }
}
