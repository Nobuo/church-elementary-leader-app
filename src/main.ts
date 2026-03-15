import { createDatabase } from '@infrastructure/persistence/database';
import { resolveDbPath } from '@infrastructure/config/data-dir';
import { SqliteMemberRepository } from '@infrastructure/persistence/sqlite-member-repository';
import { SqliteScheduleRepository } from '@infrastructure/persistence/sqlite-schedule-repository';
import { SqliteAssignmentRepository } from '@infrastructure/persistence/sqlite-assignment-repository';
import { createServer } from '@presentation/server';

const dbPath = process.env.DB_PATH ?? resolveDbPath();
const db = createDatabase(dbPath);

const memberRepo = new SqliteMemberRepository(db);
const scheduleRepo = new SqliteScheduleRepository(db);
const assignmentRepo = new SqliteAssignmentRepository(db);

const app = createServer(memberRepo, scheduleRepo, assignmentRepo, { db });

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Database: ${dbPath}`);
});
