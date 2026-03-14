import { type APIRequestContext } from '@playwright/test';

const BASE = 'http://localhost:3001';

export async function resetDatabase(request: APIRequestContext) {
  await request.delete(`${BASE}/api/test/reset`);
}

const STANDARD_MEMBERS = [
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

export async function seedStandardMembers(request: APIRequestContext) {
  const created = [];
  for (const m of STANDARD_MEMBERS) {
    const res = await request.post(`${BASE}/api/members`, { data: m });
    created.push(await res.json());
  }
  return created;
}

export async function seedSchedule(request: APIRequestContext, year: number, month: number) {
  const res = await request.post(`${BASE}/api/schedules/generate`, { data: { year, month } });
  return await res.json();
}

export async function seedAssignments(request: APIRequestContext, year: number, month: number) {
  const res = await request.post(`${BASE}/api/assignments/generate`, { data: { year, month } });
  return await res.json();
}
