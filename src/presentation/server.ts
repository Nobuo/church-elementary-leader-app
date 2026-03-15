import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import type { AppDatabase } from '@infrastructure/persistence/app-database';
import { MemberRepository } from '@domain/repositories/member-repository';
import { ScheduleRepository } from '@domain/repositories/schedule-repository';
import { AssignmentRepository } from '@domain/repositories/assignment-repository';
import { createMemberController } from './controllers/member-controller.js';
import { createScheduleController } from './controllers/schedule-controller.js';
import { createAssignmentController } from './controllers/assignment-controller.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ServerOptions {
  db?: AppDatabase;
  staticDir?: string;
}

export function createServer(
  memberRepo: MemberRepository,
  scheduleRepo: ScheduleRepository,
  assignmentRepo: AssignmentRepository,
  options?: ServerOptions,
) {
  const app = express();

  app.use(express.json());
  const publicDir = options?.staticDir ?? path.join(__dirname, '../../public');
  app.use(express.static(publicDir));

  app.use('/api/members', createMemberController(memberRepo));
  app.use('/api/schedules', createScheduleController(scheduleRepo));
  app.use('/api/assignments', createAssignmentController(memberRepo, scheduleRepo, assignmentRepo));

  // Test-only reset endpoint
  if (process.env.NODE_ENV === 'test' && options?.db) {
    const db = options.db;
    app.delete('/api/test/reset', (_req, res) => {
      db.exec('DELETE FROM assignments; DELETE FROM schedules; DELETE FROM members;');
      res.json({ success: true });
    });
  }

  return app;
}
