import Database from 'better-sqlite3';
import { runMigrations } from '@infrastructure/persistence/migrations/index';
import { SqliteMemberRepository } from '@infrastructure/persistence/sqlite-member-repository';
import { SqliteScheduleRepository } from '@infrastructure/persistence/sqlite-schedule-repository';
import { SqliteAssignmentRepository } from '@infrastructure/persistence/sqlite-assignment-repository';
import { createServer } from '@presentation/server';
import type { Express } from 'express';
import request from 'supertest';

export interface TestApp {
  app: Express;
  db: Database.Database;
  request: ReturnType<typeof request>;
}

export function createTestApp(): TestApp {
  const db = new Database(':memory:');
  runMigrations(db);
  const memberRepo = new SqliteMemberRepository(db);
  const scheduleRepo = new SqliteScheduleRepository(db);
  const assignmentRepo = new SqliteAssignmentRepository(db);
  const app = createServer(memberRepo, scheduleRepo, assignmentRepo);
  return { app, db, request: request(app) };
}

export interface MemberInput {
  name: string;
  gender: string;
  language: string;
  gradeGroup: string;
  memberType: string;
  sameGenderOnly: boolean;
  spouseId?: string | null;
}

const STANDARD_MEMBERS: MemberInput[] = [
  { name: '田中太郎', gender: 'MALE', language: 'JAPANESE', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
  { name: 'John Smith', gender: 'MALE', language: 'ENGLISH', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
  { name: '佐藤花子', gender: 'FEMALE', language: 'BOTH', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
  { name: 'Jane Doe', gender: 'FEMALE', language: 'ENGLISH', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
  { name: '山田一郎', gender: 'MALE', language: 'JAPANESE', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
  { name: '鈴木二郎', gender: 'MALE', language: 'JAPANESE', gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
  { name: 'Emily Brown', gender: 'FEMALE', language: 'ENGLISH', gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
  { name: '高橋三郎', gender: 'MALE', language: 'BOTH', gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
  { name: 'Bob Wilson', gender: 'MALE', language: 'ENGLISH', gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
  { name: '伊藤美咲', gender: 'FEMALE', language: 'JAPANESE', gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
];

export async function seedStandardMembers(r: ReturnType<typeof request>) {
  const members = [];
  for (const input of STANDARD_MEMBERS) {
    const res = await r.post('/api/members').send(input).expect(201);
    members.push(res.body);
  }
  return members;
}

export async function seedSchedule(r: ReturnType<typeof request>, year: number, month: number) {
  const res = await r.post('/api/schedules/generate').send({ year, month }).expect(200);
  return res.body as Array<{ id: string; date: string; isExcluded: boolean; isEvent: boolean }>;
}

export async function seedAssignments(r: ReturnType<typeof request>, year: number, month: number) {
  const res = await r.post('/api/assignments/generate').send({ year, month }).expect(200);
  return res.body;
}
