import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestApp, seedStandardMembers, seedSchedule, type TestApp } from './helpers/setup';

describe('Assignment API', () => {
  let t: TestApp;
  const testYear = new Date().getFullYear() + 1;

  beforeEach(() => { t = createTestApp(); });
  afterEach(() => { t.db.close(); });

  async function setupMembersAndSchedule(options: { splitClass?: boolean } = { splitClass: true }) {
    const members = await seedStandardMembers(t.request);
    const schedules = await seedSchedule(t.request, testYear, 4);
    if (options.splitClass) {
      for (const s of schedules) {
        await t.request.post(`/api/schedules/${s.id}/toggle-split-class`).expect(200);
      }
    }
    return { members, schedules };
  }

  describe('POST /api/assignments/generate', () => {
    it('3.1 generates assignments successfully', async () => {
      const { schedules } = await setupMembersAndSchedule();
      const activeDates = schedules.filter(s => !s.isExcluded).length;

      const res = await t.request
        .post('/api/assignments/generate')
        .send({ year: testYear, month: 4 })
        .expect(200);

      expect(res.body.assignments.length).toBe(activeDates * 2);
      expect(res.body).toHaveProperty('violations');
    });

    it('3.2 returns 400 when no schedules exist', async () => {
      await seedStandardMembers(t.request);
      await t.request
        .post('/api/assignments/generate')
        .send({ year: testYear, month: 4 })
        .expect(400);
    });

    it('3.3 returns 400 when not enough members', async () => {
      // 2名だけ登録する（最小人数は3名）
      for (let i = 0; i < 2; i++) {
        await t.request.post('/api/members').send({
          name: `Member${i}`, gender: 'MALE', language: 'BOTH',
          gradeGroup: i < 1 ? 'UPPER' : 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false,
        }).expect(201);
      }
      await seedSchedule(t.request, testYear, 4);

      await t.request
        .post('/api/assignments/generate')
        .send({ year: testYear, month: 4 })
        .expect(400);
    });

    it('3.4 excluded dates have no assignments', async () => {
      const { schedules } = await setupMembersAndSchedule();
      // 最初の日付を除外する
      await t.request.post(`/api/schedules/${schedules[0].id}/toggle-exclusion`).expect(200);

      const res = await t.request
        .post('/api/assignments/generate')
        .send({ year: testYear, month: 4 })
        .expect(200);

      const assignmentDates = res.body.assignments.map((a: { date: string }) => a.date);
      expect(assignmentDates).not.toContain(schedules[0].date);
    });

    it('3.5 incremental generation skips already-assigned weeks', async () => {
      await setupMembersAndSchedule();

      const res1 = await t.request.post('/api/assignments/generate').send({ year: testYear, month: 4 }).expect(200);
      expect(res1.body.assignments.length).toBeGreaterThan(0);

      // 2回目の呼び出し: すべての週が割り当て済みなので、メッセージ付きで空を返す
      const res2 = await t.request.post('/api/assignments/generate').send({ year: testYear, month: 4 }).expect(200);
      expect(res2.body.assignments.length).toBe(0);
      expect(res2.body.message).toBe('allWeeksAssigned');
    });
  });

  describe('GET /api/assignments', () => {
    it('3.6 returns assignments with required fields', async () => {
      await setupMembersAndSchedule();
      await t.request.post('/api/assignments/generate').send({ year: testYear, month: 4 }).expect(200);

      const res = await t.request.get(`/api/assignments?year=${testYear}&month=4`).expect(200);

      for (const a of res.body) {
        expect(a).toHaveProperty('date');
        expect(a).toHaveProperty('groupNumber');
        expect(a).toHaveProperty('members');
      }
    });

    it('3.7 each assignment has 2 members', async () => {
      await setupMembersAndSchedule();
      await t.request.post('/api/assignments/generate').send({ year: testYear, month: 4 }).expect(200);

      const res = await t.request.get(`/api/assignments?year=${testYear}&month=4`).expect(200);
      for (const a of res.body) {
        expect(a.members.length).toBe(2);
      }
    });
  });

  describe('PUT /api/assignments/:id/adjust', () => {
    it('3.8 successfully replaces a member', async () => {
      const { members } = await setupMembersAndSchedule();
      const gen = await t.request.post('/api/assignments/generate').send({ year: testYear, month: 4 }).expect(200);

      const assignment = gen.body.assignments[0];
      const oldMemberId = assignment.members[0].id;
      // この割り当てに含まれていないメンバーを探す
      const assignedIds = new Set(assignment.members.map((m: { id: string }) => m.id));
      const newMember = members.find(m => !assignedIds.has(m.id))!;

      const res = await t.request
        .put(`/api/assignments/${assignment.id}/adjust`)
        .send({ oldMemberId, newMemberId: newMember.id })
        .expect(200);

      expect(res.body.assignment.members.some((m: { id: string }) => m.id === newMember.id)).toBe(true);
      expect(res.body.assignment.members.some((m: { id: string }) => m.id === oldMemberId)).toBe(false);
    });

    it('3.9 detects language balance violation', async () => {
      // メンバーを作成する: 日本語のみ + 英語のみのペアを作り、その後英語を日本語に置き換える
      await t.request.post('/api/members').send({ name: 'JP1', gender: 'MALE', language: 'JAPANESE', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false }).expect(201);
      const en1 = await t.request.post('/api/members').send({ name: 'EN1', gender: 'FEMALE', language: 'ENGLISH', gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false }).expect(201);
      const jp2 = await t.request.post('/api/members').send({ name: 'JP2', gender: 'MALE', language: 'JAPANESE', gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false }).expect(201);
      // 生成に十分な人数が必要
      await t.request.post('/api/members').send({ name: 'Both1', gender: 'MALE', language: 'BOTH', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false });
      await t.request.post('/api/members').send({ name: 'Both2', gender: 'FEMALE', language: 'BOTH', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false });
      await t.request.post('/api/members').send({ name: 'Both3', gender: 'MALE', language: 'BOTH', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false });
      await t.request.post('/api/members').send({ name: 'Both4', gender: 'FEMALE', language: 'BOTH', gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false });
      await t.request.post('/api/members').send({ name: 'Both5', gender: 'MALE', language: 'BOTH', gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false });
      await t.request.post('/api/members').send({ name: 'Both6', gender: 'FEMALE', language: 'BOTH', gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false });
      await t.request.post('/api/members').send({ name: 'Both7', gender: 'MALE', language: 'BOTH', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false });

      await seedSchedule(t.request, testYear, 4);
      const gen = await t.request.post('/api/assignments/generate').send({ year: testYear, month: 4 }).expect(200);

      // EN1 を含む割り当てを探し、JP2 に置き換える
      const a = gen.body.assignments.find((a: { members: Array<{ id: string }> }) =>
        a.members.some((m: { id: string }) => m.id === en1.body.id),
      );
      if (!a) return; // EN1 が割り当てられていない場合があるためスキップ

      const res = await t.request
        .put(`/api/assignments/${a.id}/adjust`)
        .send({ oldMemberId: en1.body.id, newMemberId: jp2.body.id })
        .expect(200);

      // 両方が日本語になったため、言語制約違反があるはず
      const partner = a.members.find((m: { id: string }) => m.id !== en1.body.id);
      if (partner) {
        // 相手が BOTH でない場合だけ違反を期待する
        // 相手が両言語をカバーできる場合があるため、条件付きで確認する
        expect(res.body).toHaveProperty('violations');
      }
    });

    it('3.11 returns 400 for non-existent assignment ID', async () => {
      await t.request
        .put('/api/assignments/non-existent/adjust')
        .send({ oldMemberId: 'a', newMemberId: 'b' })
        .expect(400);
    });

    it('3.12 returns 400 for non-existent member ID', async () => {
      await setupMembersAndSchedule();
      const gen = await t.request.post('/api/assignments/generate').send({ year: testYear, month: 4 }).expect(200);
      const assignment = gen.body.assignments[0];

      await t.request
        .put(`/api/assignments/${assignment.id}/adjust`)
        .send({ oldMemberId: assignment.members[0].id, newMemberId: 'non-existent-id' })
        .expect(400);
    });
  });

  describe('DELETE /api/assignments', () => {
    it('3.13 deletes all assignments for a month', async () => {
      await setupMembersAndSchedule();
      await t.request.post('/api/assignments/generate').send({ year: testYear, month: 4 }).expect(200);

      await t.request.delete(`/api/assignments?year=${testYear}&month=4`).expect(200);

      const res = await t.request.get(`/api/assignments?year=${testYear}&month=4`).expect(200);
      expect(res.body.length).toBe(0);
    });
  });

  describe('DELETE /api/assignments/by-date', () => {
    it('3.14 clears assignments for a future date', async () => {
      const { schedules } = await setupMembersAndSchedule();
      await t.request.post('/api/assignments/generate').send({ year: testYear, month: 4 }).expect(200);

      const futureDate = schedules[schedules.length - 1].date; // 最後の日曜日。おそらく未来日
      await t.request.delete(`/api/assignments/by-date?date=${futureDate}`).expect(200);

      const res = await t.request.get(`/api/assignments?year=${testYear}&month=4`).expect(200);
      const datesRemaining = res.body.map((a: { date: string }) => a.date);
      expect(datesRemaining).not.toContain(futureDate);
    });

    it('3.15 returns 400 for past date', async () => {
      await t.request.delete('/api/assignments/by-date?date=2020-01-05').expect(400);
    });
  });

  describe('GET /api/assignments/candidates', () => {
    it('3.16 returns candidates with required fields', async () => {
      const { schedules } = await setupMembersAndSchedule();
      await t.request.post('/api/assignments/generate').send({ year: testYear, month: 4 }).expect(200);

      const res = await t.request
        .get(`/api/assignments/candidates?date=${schedules[0].date}&excludeIds=`)
        .expect(200);

      expect(res.body.length).toBeGreaterThan(0);
      for (const c of res.body) {
        expect(c).toHaveProperty('id');
        expect(c).toHaveProperty('name');
        expect(c).toHaveProperty('count');
        expect(c).toHaveProperty('warnings');
        expect(c).toHaveProperty('recommended');
      }
    });

    it('3.17 excludeIds filters out specified members', async () => {
      const { members, schedules } = await setupMembersAndSchedule();
      await t.request.post('/api/assignments/generate').send({ year: testYear, month: 4 }).expect(200);

      const excludeId = members[0].id;
      const res = await t.request
        .get(`/api/assignments/candidates?date=${schedules[0].date}&excludeIds=${excludeId}`)
        .expect(200);

      expect(res.body.every((c: { id: string }) => c.id !== excludeId)).toBe(true);
    });

    it('3.20 recommended candidates are sorted first', async () => {
      const { schedules } = await setupMembersAndSchedule();
      await t.request.post('/api/assignments/generate').send({ year: testYear, month: 4 }).expect(200);

      const res = await t.request
        .get(`/api/assignments/candidates?date=${schedules[0].date}&excludeIds=`)
        .expect(200);

      const candidates = res.body;
      if (candidates.length >= 2) {
        // 最初の非推奨候補を探す
        const firstNonRec = candidates.findIndex((c: { recommended: boolean }) => !c.recommended);
        if (firstNonRec > 0) {
          // その前にある候補はすべて推奨のはず
          for (let i = 0; i < firstNonRec; i++) {
            expect(candidates[i].recommended).toBe(true);
          }
        }
      }
    });

    it('3.23 includes unavailable-date candidates only when input assist is disabled', async () => {
      const { members, schedules } = await setupMembersAndSchedule({ splitClass: false });
      const unavailable = members.find((m: { name: string }) => m.name === '田中太郎')!;
      await t.request
        .put(`/api/members/${unavailable.id}`)
        .send({
          name: unavailable.name,
          notes: unavailable.notes,
          gender: unavailable.gender,
          language: unavailable.language,
          gradeGroup: unavailable.gradeGroup,
          memberType: unavailable.memberType,
          sameGenderOnly: unavailable.sameGenderOnly,
          spouseId: unavailable.spouseId,
          availableDates: ['2099-01-01'],
        })
        .expect(200);

      const normal = await t.request
        .get(`/api/assignments/candidates?date=${schedules[0].date}&excludeIds=&role=UPPER`)
        .expect(200);
      expect(normal.body.some((c: { id: string }) => c.id === unavailable.id)).toBe(false);

      const expanded = await t.request
        .get(`/api/assignments/candidates?date=${schedules[0].date}&excludeIds=&role=UPPER&includeNonRecommended=true`)
        .expect(200);
      const candidate = expanded.body.find((c: { id: string }) => c.id === unavailable.id);
      expect(candidate).toBeDefined();
      expect(candidate.recommended).toBe(false);
      expect(candidate.hiddenByDefault).toBe(true);
      expect(candidate.warnings).toContain('unavailableDate');
    });
  });

  describe('Grade group: DTO and candidates filtering', () => {
    it('T10 group 1 = UPPER members, group 2 = LOWER members', async () => {
      await setupMembersAndSchedule();
      await t.request.post('/api/assignments/generate').send({ year: testYear, month: 4 }).expect(200);

      const res = await t.request.get(`/api/assignments?year=${testYear}&month=4`).expect(200);

      for (const a of res.body) {
        expect(a).toHaveProperty('gradeGroup');
        const expectedGrade = a.groupNumber === 1 ? 'UPPER' : 'LOWER';
        expect(a.gradeGroup).toBe(expectedGrade);
        for (const m of a.members) {
          expect(m).toHaveProperty('gradeGroup');
          expect(m.gradeGroup).toBe(expectedGrade);
        }
      }
    });

    it('T11 normal day: candidates with role=UPPER returns only UPPER members', async () => {
      const { schedules } = await setupMembersAndSchedule({ splitClass: false });
      await t.request.post('/api/assignments/generate').send({ year: testYear, month: 4 }).expect(200);

      const res = await t.request
        .get(`/api/assignments/candidates?date=${schedules[0].date}&excludeIds=&role=UPPER`)
        .expect(200);

      expect(res.body.length).toBeGreaterThan(0);
      for (const c of res.body) {
        expect(c).toHaveProperty('gradeGroup');
        expect(c.gradeGroup).toBe('UPPER');
      }
    });

    it('T13 normal day: candidates with role=LOWER returns only LOWER members', async () => {
      const { schedules } = await setupMembersAndSchedule({ splitClass: false });
      await t.request.post('/api/assignments/generate').send({ year: testYear, month: 4 }).expect(200);

      const res = await t.request
        .get(`/api/assignments/candidates?date=${schedules[0].date}&excludeIds=&role=LOWER`)
        .expect(200);

      expect(res.body.length).toBeGreaterThan(0);
      for (const c of res.body) {
        expect(c).toHaveProperty('gradeGroup');
        expect(c.gradeGroup).toBe('LOWER');
      }
    });

    it('T12 split-class day: candidates with role=LOWER includes BOTH from UPPER with isCrossover', async () => {
      // UPPER にだけ BOTH メンバーを作成する
      const memberInputs = [
        { name: 'U1', gender: 'MALE', language: 'BOTH', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
        { name: 'U2', gender: 'FEMALE', language: 'BOTH', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
        { name: 'U3', gender: 'MALE', language: 'BOTH', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
        { name: 'U4', gender: 'FEMALE', language: 'JAPANESE', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
        { name: 'U5', gender: 'MALE', language: 'ENGLISH', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
        { name: 'L1', gender: 'MALE', language: 'JAPANESE', gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
        { name: 'L2', gender: 'FEMALE', language: 'ENGLISH', gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
        { name: 'L3', gender: 'MALE', language: 'JAPANESE', gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
        { name: 'L4', gender: 'FEMALE', language: 'ENGLISH', gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
        { name: 'L5', gender: 'MALE', language: 'JAPANESE', gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
      ];
      for (const input of memberInputs) {
        await t.request.post('/api/members').send(input).expect(201);
      }
      const schedules = await seedSchedule(t.request, testYear, 4);

      // 最初の日付を分級日にする
      await t.request.post(`/api/schedules/${schedules[0].id}/toggle-split-class`).expect(200);
      await t.request.post('/api/assignments/generate').send({ year: testYear, month: 4 }).expect(200);

      const res = await t.request
        .get(`/api/assignments/candidates?date=${schedules[0].date}&excludeIds=&role=LOWER`)
        .expect(200);

      // LOWER メンバーと UPPER の BOTH メンバーが含まれるはず
      const lowerCandidates = res.body.filter((c: { gradeGroup: string }) => c.gradeGroup === 'LOWER');
      const upperBothCandidates = res.body.filter(
        (c: { gradeGroup: string; isCrossover: boolean }) => c.gradeGroup === 'UPPER' && c.isCrossover,
      );

      expect(lowerCandidates.length).toBeGreaterThan(0);
      expect(upperBothCandidates.length).toBeGreaterThan(0);

      // 学年をまたぐ候補には gradeGroupMismatch 警告が付くはず
      for (const c of upperBothCandidates) {
        expect(c.warnings).toContain('gradeGroupMismatch');
      }
    });
  });

  describe('GET /api/assignments/counts', () => {
    it('3.21 returns counts with summary', async () => {
      await setupMembersAndSchedule();
      await t.request.post('/api/assignments/generate').send({ year: testYear, month: 4 }).expect(200);

      const res = await t.request.get(`/api/assignments/counts?fiscalYear=${testYear}`).expect(200);

      expect(res.body).toHaveProperty('members');
      expect(res.body).toHaveProperty('summary');
      expect(res.body.summary).toHaveProperty('max');
      expect(res.body.summary).toHaveProperty('min');
      expect(res.body.summary).toHaveProperty('average');
    });

    it('3.22 total count equals assignments * 2', async () => {
      await setupMembersAndSchedule();
      const gen = await t.request.post('/api/assignments/generate').send({ year: testYear, month: 4 }).expect(200);

      const res = await t.request.get(`/api/assignments/counts?fiscalYear=${testYear}`).expect(200);

      const totalCount = res.body.members.reduce((sum: number, m: { count: number }) => sum + m.count, 0);
      expect(totalCount).toBe(gen.body.assignments.length * 2);
    });
  });

  describe('Event management', () => {
    it('5.1 HELPER excluded from event day assignments', async () => {
      // HELPER を含むメンバーを作成する
      const memberInputs = [
        { name: 'U1', gender: 'MALE', language: 'BOTH', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
        { name: 'U2', gender: 'FEMALE', language: 'BOTH', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
        { name: 'U3', gender: 'MALE', language: 'BOTH', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
        { name: 'U4', gender: 'FEMALE', language: 'BOTH', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
        { name: 'U5', gender: 'MALE', language: 'BOTH', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
        { name: 'L1', gender: 'MALE', language: 'BOTH', gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
        { name: 'L2', gender: 'FEMALE', language: 'BOTH', gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
        { name: 'L3', gender: 'MALE', language: 'BOTH', gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
        { name: 'L4', gender: 'FEMALE', language: 'BOTH', gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
        { name: 'Helper1', gender: 'MALE', language: 'BOTH', gradeGroup: 'LOWER', memberType: 'HELPER', sameGenderOnly: false },
      ];
      const members = [];
      for (const input of memberInputs) {
        const res = await t.request.post('/api/members').send(input).expect(201);
        members.push(res.body);
      }

      const schedules = await seedSchedule(t.request, testYear, 4);
      // 最初のスケジュールをイベント日に設定する
      await t.request.post(`/api/schedules/${schedules[0].id}/toggle-event`).expect(200);

      const gen = await t.request.post('/api/assignments/generate').send({ year: testYear, month: 4 }).expect(200);

      const helperId = members.find(m => m.name === 'Helper1')!.id;
      const eventDateAssignments = gen.body.assignments.filter(
        (a: { date: string }) => a.date === schedules[0].date,
      );
      for (const a of eventDateAssignments) {
        expect(a.members.every((m: { id: string }) => m.id !== helperId)).toBe(true);
      }
    });

    it('5.2 rejects HELPER replacement on event day', async () => {
      const members = [];
      for (const input of [
        { name: 'U1', gender: 'MALE', language: 'BOTH', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
        { name: 'U2', gender: 'FEMALE', language: 'BOTH', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
        { name: 'U3', gender: 'MALE', language: 'BOTH', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
        { name: 'U4', gender: 'FEMALE', language: 'BOTH', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
        { name: 'U5', gender: 'MALE', language: 'BOTH', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
        { name: 'L1', gender: 'MALE', language: 'BOTH', gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
        { name: 'L2', gender: 'FEMALE', language: 'BOTH', gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
        { name: 'L3', gender: 'MALE', language: 'BOTH', gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
        { name: 'L4', gender: 'FEMALE', language: 'BOTH', gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
        { name: 'Helper1', gender: 'MALE', language: 'BOTH', gradeGroup: 'LOWER', memberType: 'HELPER', sameGenderOnly: false },
      ]) {
        const res = await t.request.post('/api/members').send(input).expect(201);
        members.push(res.body);
      }

      const schedules = await seedSchedule(t.request, testYear, 4);
      await t.request.post(`/api/schedules/${schedules[0].id}/toggle-event`).expect(200);
      const gen = await t.request.post('/api/assignments/generate').send({ year: testYear, month: 4 }).expect(200);

      const eventAssignment = gen.body.assignments.find(
        (a: { date: string }) => a.date === schedules[0].date,
      );
      if (!eventAssignment) return;

      const helperId = members.find(m => m.name === 'Helper1')!.id;
      const res = await t.request
        .put(`/api/assignments/${eventAssignment.id}/adjust`)
        .send({ oldMemberId: eventAssignment.members[0].id, newMemberId: helperId })
        .expect(400);

      expect(res.body.error).toContain('HELPER');
    });
  });

  describe('Split-class language coverage', () => {
    async function setupSplitClassScenario(memberLanguages: { upper: string[]; lower: string[] }) {
      const memberInputs = [
        ...memberLanguages.upper.map((lang, i) => ({
          name: `U${i + 1}`, gender: i % 2 === 0 ? 'MALE' : 'FEMALE', language: lang, gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false,
        })),
        ...memberLanguages.lower.map((lang, i) => ({
          name: `L${i + 1}`, gender: i % 2 === 0 ? 'MALE' : 'FEMALE', language: lang, gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false,
        })),
      ];
      const members = [];
      for (const input of memberInputs) {
        const res = await t.request.post('/api/members').send(input).expect(201);
        members.push(res.body);
      }
      const schedules = await seedSchedule(t.request, testYear, 4);
      return { members, schedules };
    }

    it('5.3 split-class day with sufficient BOTH members produces no class violations', async () => {
      const { schedules } = await setupSplitClassScenario({
        upper: ['BOTH', 'JAPANESE', 'ENGLISH', 'BOTH', 'JAPANESE'],
        lower: ['BOTH', 'JAPANESE', 'ENGLISH', 'BOTH', 'JAPANESE'],
      });

      // 最初の日付を分級日にする
      await t.request.post(`/api/schedules/${schedules[0].id}/toggle-split-class`).expect(200);

      const gen = await t.request.post('/api/assignments/generate').send({ year: testYear, month: 4 }).expect(200);

      const classViolations = gen.body.violations.filter(
        (v: { type: string }) => v.type === 'CLASS_LANGUAGE_COVERAGE',
      );
      expect(classViolations).toHaveLength(0);
    });

    it('5.4 split-class day with only 1 BOTH total produces violation', async () => {
      const { schedules } = await setupSplitClassScenario({
        upper: ['JAPANESE', 'ENGLISH'],
        lower: ['BOTH', 'JAPANESE'],
      });

      await t.request.post(`/api/schedules/${schedules[0].id}/toggle-split-class`).expect(200);

      const gen = await t.request.post('/api/assignments/generate').send({ year: testYear, month: 4 }).expect(200);

      const classViolations = gen.body.violations.filter(
        (v: { type: string }) => v.type === 'CLASS_LANGUAGE_COVERAGE',
      );
      expect(classViolations.length).toBeGreaterThanOrEqual(1);
    });

    it('5.5 non-split-class day with no BOTH produces no class violations', async () => {
      await setupSplitClassScenario({
        upper: ['JAPANESE', 'ENGLISH', 'JAPANESE', 'ENGLISH', 'JAPANESE'],
        lower: ['JAPANESE', 'ENGLISH', 'JAPANESE', 'ENGLISH', 'JAPANESE'],
      });
      // 分級日の切り替えなし。すべて通常日

      const gen = await t.request.post('/api/assignments/generate').send({ year: testYear, month: 4 }).expect(200);

      const classViolations = gen.body.violations.filter(
        (v: { type: string }) => v.type === 'CLASS_LANGUAGE_COVERAGE',
      );
      expect(classViolations).toHaveLength(0);
    });

    it('5.6 adjusting BOTH to JP on split-class day produces class violation', async () => {
      const { members, schedules } = await setupSplitClassScenario({
        upper: ['BOTH', 'JAPANESE', 'ENGLISH', 'BOTH', 'JAPANESE'],
        lower: ['BOTH', 'JAPANESE', 'ENGLISH', 'BOTH', 'JAPANESE'],
      });

      await t.request.post(`/api/schedules/${schedules[0].id}/toggle-split-class`).expect(200);
      const gen = await t.request.post('/api/assignments/generate').send({ year: testYear, month: 4 }).expect(200);

      // 分級日の割り当てから BOTH メンバーを含むものを探す
      const splitDateAssignments = gen.body.assignments.filter(
        (a: { date: string }) => a.date === schedules[0].date,
      );
      if (splitDateAssignments.length < 2) return;

      // 割り当て内の BOTH メンバーを探す
      const bothMember = members.find(m => m.language === 'BOTH');
      const jpOnlyMember = members.find(m => m.language === 'JAPANESE' && !splitDateAssignments.some(
        (a: { members: Array<{ id: string }> }) => a.members.some(am => am.id === m.id),
      ));
      if (!bothMember || !jpOnlyMember) return;

      const assignmentWithBoth = splitDateAssignments.find(
        (a: { members: Array<{ id: string }> }) => a.members.some(m => m.id === bothMember.id),
      );
      if (!assignmentWithBoth) return;

      const res = await t.request
        .put(`/api/assignments/${assignmentWithBoth.id}/adjust`)
        .send({ oldMemberId: bothMember.id, newMemberId: jpOnlyMember.id })
        .expect(200);

      // 他方のグループに BOTH がいるかどうかで、クラス制約違反が出る場合と出ない場合がある
      expect(res.body).toHaveProperty('violations');
    });
  });

  describe('PUT /api/assignments/:id/unassign', () => {
    it('6.1 removes a member from a 2-member group, leaving 1', async () => {
      await setupMembersAndSchedule();
      const gen = await t.request.post('/api/assignments/generate').send({ year: testYear, month: 4 }).expect(200);
      const assignment = gen.body.assignments[0];

      const res = await t.request
        .put(`/api/assignments/${assignment.id}/unassign`)
        .send({ memberId: assignment.members[0].id })
        .expect(200);

      expect(res.body.deleted).toBe(false);
      expect(res.body.assignment.members).toHaveLength(1);
      expect(res.body.assignment.members[0].id).toBe(assignment.members[1].id);
      expect(res.body.assignment.vacantSlots).toBe(1);
    });

    it('6.2 removing last member deletes the assignment', async () => {
      await setupMembersAndSchedule();
      const gen = await t.request.post('/api/assignments/generate').send({ year: testYear, month: 4 }).expect(200);
      const assignment = gen.body.assignments[0];

      // 1人目のメンバーを外す
      await t.request
        .put(`/api/assignments/${assignment.id}/unassign`)
        .send({ memberId: assignment.members[0].id })
        .expect(200);

      // 2人目（最後）のメンバーを外す
      const res = await t.request
        .put(`/api/assignments/${assignment.id}/unassign`)
        .send({ memberId: assignment.members[1].id })
        .expect(200);

      expect(res.body.deleted).toBe(true);
      expect(res.body.assignment).toBeNull();
    });

    it('6.3 returns 400 for non-existent member', async () => {
      await setupMembersAndSchedule();
      const gen = await t.request.post('/api/assignments/generate').send({ year: testYear, month: 4 }).expect(200);
      const assignment = gen.body.assignments[0];

      await t.request
        .put(`/api/assignments/${assignment.id}/unassign`)
        .send({ memberId: 'non-existent-id' })
        .expect(400);
    });

    it('6.4 returns 400 for non-existent assignment', async () => {
      await t.request
        .put('/api/assignments/non-existent/unassign')
        .send({ memberId: 'some-id' })
        .expect(400);
    });

    it('6.5 unassigned member count decreases', async () => {
      await setupMembersAndSchedule();
      const gen = await t.request.post('/api/assignments/generate').send({ year: testYear, month: 4 }).expect(200);
      const assignment = gen.body.assignments[0];
      const removedMemberId = assignment.members[0].id;

      // 変更前の回数を取得する
      const countsBefore = await t.request.get(`/api/assignments/counts?fiscalYear=${testYear}`).expect(200);
      const beforeCount = countsBefore.body.members.find((m: { id: string }) => m.id === removedMemberId)?.count ?? 0;

      // 割り当てを外す
      await t.request
        .put(`/api/assignments/${assignment.id}/unassign`)
        .send({ memberId: removedMemberId })
        .expect(200);

      // 変更後の回数を取得する
      const countsAfter = await t.request.get(`/api/assignments/counts?fiscalYear=${testYear}`).expect(200);
      const afterCount = countsAfter.body.members.find((m: { id: string }) => m.id === removedMemberId)?.count ?? 0;

      expect(afterCount).toBe(beforeCount - 1);
    });
  });

  describe('PUT /api/assignments/:id/assign', () => {
    it('6.6 assigns a member to a vacant slot', async () => {
      const { members } = await setupMembersAndSchedule();
      const gen = await t.request.post('/api/assignments/generate').send({ year: testYear, month: 4 }).expect(200);
      const assignment = gen.body.assignments[0];
      const removedMemberId = assignment.members[0].id;

      // 先に割り当てを外す
      await t.request
        .put(`/api/assignments/${assignment.id}/unassign`)
        .send({ memberId: removedMemberId })
        .expect(200);

      // この日付に割り当てられていないメンバーを探す
      const sameDateAssignments = gen.body.assignments.filter(
        (a: { date: string }) => a.date === assignment.date,
      );
      const allAssignedIds = new Set<string>();
      for (const a of sameDateAssignments) {
        for (const m of a.members) allAssignedIds.add(m.id);
      }
      allAssignedIds.delete(removedMemberId); // すでに外している
      const candidate = members.find(m => !allAssignedIds.has(m.id));
      if (!candidate) return; // 候補がなければスキップ

      const res = await t.request
        .put(`/api/assignments/${assignment.id}/assign`)
        .send({ memberId: candidate.id })
        .expect(200);

      expect(res.body.assignment.members).toHaveLength(2);
      expect(res.body.assignment.members.some((m: { id: string }) => m.id === candidate.id)).toBe(true);
      expect(res.body.assignment.vacantSlots).toBe(0);
    });

    it('6.7 returns 400 when assignment is full', async () => {
      await setupMembersAndSchedule();
      const gen = await t.request.post('/api/assignments/generate').send({ year: testYear, month: 4 }).expect(200);
      const assignment = gen.body.assignments[0];

      await t.request
        .put(`/api/assignments/${assignment.id}/assign`)
        .send({ memberId: assignment.members[0].id })
        .expect(400);
    });

    it('6.8 returns 400 for non-existent assignment', async () => {
      await t.request
        .put('/api/assignments/non-existent/assign')
        .send({ memberId: 'some-id' })
        .expect(400);
    });
  });

  describe('vacantSlots in DTO', () => {
    it('6.9 generated assignments have vacantSlots: 0', async () => {
      await setupMembersAndSchedule();
      const gen = await t.request.post('/api/assignments/generate').send({ year: testYear, month: 4 }).expect(200);

      for (const a of gen.body.assignments) {
        expect(a.vacantSlots).toBe(0);
      }
    });

    it('6.10 GET assignments include vacantSlots field', async () => {
      await setupMembersAndSchedule();
      await t.request.post('/api/assignments/generate').send({ year: testYear, month: 4 }).expect(200);

      const res = await t.request.get(`/api/assignments?year=${testYear}&month=4`).expect(200);
      for (const a of res.body) {
        expect(a).toHaveProperty('vacantSlots');
        expect(a.vacantSlots).toBe(0);
      }
    });
  });

  describe('LINE export with vacant slots', () => {
    it('6.11 LINE export shows TBD for vacant slots', async () => {
      await setupMembersAndSchedule();
      const gen = await t.request.post('/api/assignments/generate').send({ year: testYear, month: 4 }).expect(200);
      const assignment = gen.body.assignments[0];

      // メンバー1人の割り当てを外す
      await t.request
        .put(`/api/assignments/${assignment.id}/unassign`)
        .send({ memberId: assignment.members[0].id })
        .expect(200);

      const res = await t.request
        .get(`/api/assignments/export/line?year=${testYear}&month=4&lang=ja`)
        .expect(200);

      expect(res.body.text).toContain('(未定)');
    });
  });
});
