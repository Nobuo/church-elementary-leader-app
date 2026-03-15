/**
 * Bun entry point for compiled binary.
 * Uses bun:sqlite instead of better-sqlite3.
 */
import path from 'path';
import { Database } from 'bun:sqlite';
import type { AppDatabase } from '@infrastructure/persistence/app-database';
import { runMigrations } from '@infrastructure/persistence/migrations/index';
import { SqliteMemberRepository } from '@infrastructure/persistence/sqlite-member-repository';
import { SqliteScheduleRepository } from '@infrastructure/persistence/sqlite-schedule-repository';
import { SqliteAssignmentRepository } from '@infrastructure/persistence/sqlite-assignment-repository';
import { createServer } from '@presentation/server';

const dbPath = process.env.DB_PATH ?? 'leader-app.db';
const db = new Database(dbPath) as unknown as AppDatabase;
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
runMigrations(db);

const memberRepo = new SqliteMemberRepository(db);
const scheduleRepo = new SqliteScheduleRepository(db);
const assignmentRepo = new SqliteAssignmentRepository(db);

// In compiled binary, public/ is next to the executable
const staticDir = path.join(path.dirname(process.execPath), 'public');
const app = createServer(memberRepo, scheduleRepo, assignmentRepo, { staticDir });

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
