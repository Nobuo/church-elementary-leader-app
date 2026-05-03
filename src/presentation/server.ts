import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
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

  // セキュリティヘッダー（インライン onclick ハンドラーを完全に除去するまで CSP は無効）
  app.use(helmet({ contentSecurityPolicy: false }));

  // API ルートのレート制限（テスト環境ではスキップ）
  if (process.env.NODE_ENV !== 'test') {
    app.use(
      '/api/',
      rateLimit({
        windowMs: 60 * 1000,
        max: 100,
        standardHeaders: true,
        legacyHeaders: false,
      }),
    );
  }

  app.use(express.json());
  const publicDir = options?.staticDir ?? path.join(__dirname, '../../public');
  app.use(express.static(publicDir));

  app.use('/api/members', createMemberController(memberRepo));
  app.use('/api/schedules', createScheduleController(scheduleRepo));
  app.use('/api/assignments', createAssignmentController(memberRepo, scheduleRepo, assignmentRepo));

  // テスト専用のリセットエンドポイント
  if (process.env.NODE_ENV === 'test' && options?.db) {
    const db = options.db;
    app.delete('/api/test/reset', (_req, res) => {
      db.exec('DELETE FROM assignments; DELETE FROM schedules; DELETE FROM members;');
      res.json({ success: true });
    });
  }

  // グローバルエラーハンドラー
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err.stack);
    const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message;
    res.status(500).json({ error: message });
  });

  return app;
}
