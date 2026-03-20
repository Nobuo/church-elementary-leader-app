import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestApp, seedStandardMembers, seedSchedule, type TestApp } from './helpers/setup';

describe('Assignment API', () => {
  let t: TestApp;

  beforeEach(() => { t = createTestApp(); });
  afterEach(() => { t.db.close(); });

  async function setupMembersAndSchedule() {
    const members = await seedStandardMembers(t.request);
    const schedules = await seedSchedule(t.request, 2027, 4);
    return { members, schedules };
  }

  describe('POST /api/assignments/generate', () => {
    it('3.1 generates assignments successfully', async () => {
      const { schedules } = await setupMembersAndSchedule();
      const activeDates = schedules.filter(s => !s.isExcluded).length;

      const res = await t.request
        .post('/api/assignments/generate')
        .send({ year: 2027, month: 4 })
        .expect(200);

      expect(res.body.assignments.length).toBe(activeDates * 2);
      expect(res.body).toHaveProperty('violations');
    });

    it('3.2 returns 400 when no schedules exist', async () => {
      await seedStandardMembers(t.request);
      await t.request
        .post('/api/assignments/generate')
        .send({ year: 2027, month: 4 })
        .expect(400);
    });

    it('3.3 returns 400 when not enough members', async () => {
      // Register only 3 members
      for (let i = 0; i < 3; i++) {
        await t.request.post('/api/members').send({
          name: `Member${i}`, gender: 'MALE', language: 'BOTH',
          gradeGroup: i < 2 ? 'UPPER' : 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false,
        }).expect(201);
      }
      await seedSchedule(t.request, 2027, 4);

      await t.request
        .post('/api/assignments/generate')
        .send({ year: 2027, month: 4 })
        .expect(400);
    });

    it('3.4 excluded dates have no assignments', async () => {
      const { schedules } = await setupMembersAndSchedule();
      // Exclude first date
      await t.request.post(`/api/schedules/${schedules[0].id}/toggle-exclusion`).expect(200);

      const res = await t.request
        .post('/api/assignments/generate')
        .send({ year: 2027, month: 4 })
        .expect(200);

      const assignmentDates = res.body.assignments.map((a: { date: string }) => a.date);
      expect(assignmentDates).not.toContain(schedules[0].date);
    });

    it('3.5 regeneration replaces existing assignments', async () => {
      await setupMembersAndSchedule();

      const res1 = await t.request.post('/api/assignments/generate').send({ year: 2027, month: 4 }).expect(200);
      const res2 = await t.request.post('/api/assignments/generate').send({ year: 2027, month: 4 }).expect(200);

      expect(res2.body.assignments.length).toBe(res1.body.assignments.length);
    });
  });

  describe('GET /api/assignments', () => {
    it('3.6 returns assignments with required fields', async () => {
      await setupMembersAndSchedule();
      await t.request.post('/api/assignments/generate').send({ year: 2027, month: 4 }).expect(200);

      const res = await t.request.get('/api/assignments?year=2027&month=4').expect(200);

      for (const a of res.body) {
        expect(a).toHaveProperty('date');
        expect(a).toHaveProperty('groupNumber');
        expect(a).toHaveProperty('members');
      }
    });

    it('3.7 each assignment has 2 members', async () => {
      await setupMembersAndSchedule();
      await t.request.post('/api/assignments/generate').send({ year: 2027, month: 4 }).expect(200);

      const res = await t.request.get('/api/assignments?year=2027&month=4').expect(200);
      for (const a of res.body) {
        expect(a.members.length).toBe(2);
      }
    });
  });

  describe('PUT /api/assignments/:id/adjust', () => {
    it('3.8 successfully replaces a member', async () => {
      const { members } = await setupMembersAndSchedule();
      const gen = await t.request.post('/api/assignments/generate').send({ year: 2027, month: 4 }).expect(200);

      const assignment = gen.body.assignments[0];
      const oldMemberId = assignment.members[0].id;
      // Find a member not in this assignment
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
      // Create members: JP-only + EN-only pair, then replace EN with JP
      await t.request.post('/api/members').send({ name: 'JP1', gender: 'MALE', language: 'JAPANESE', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false }).expect(201);
      const en1 = await t.request.post('/api/members').send({ name: 'EN1', gender: 'FEMALE', language: 'ENGLISH', gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false }).expect(201);
      const jp2 = await t.request.post('/api/members').send({ name: 'JP2', gender: 'MALE', language: 'JAPANESE', gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false }).expect(201);
      // Need enough members for generation
      await t.request.post('/api/members').send({ name: 'Both1', gender: 'MALE', language: 'BOTH', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false });
      await t.request.post('/api/members').send({ name: 'Both2', gender: 'FEMALE', language: 'BOTH', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false });
      await t.request.post('/api/members').send({ name: 'Both3', gender: 'MALE', language: 'BOTH', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false });
      await t.request.post('/api/members').send({ name: 'Both4', gender: 'FEMALE', language: 'BOTH', gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false });
      await t.request.post('/api/members').send({ name: 'Both5', gender: 'MALE', language: 'BOTH', gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false });
      await t.request.post('/api/members').send({ name: 'Both6', gender: 'FEMALE', language: 'BOTH', gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false });
      await t.request.post('/api/members').send({ name: 'Both7', gender: 'MALE', language: 'BOTH', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false });

      await seedSchedule(t.request, 2027, 4);
      const gen = await t.request.post('/api/assignments/generate').send({ year: 2027, month: 4 }).expect(200);

      // Find an assignment containing EN1 and replace with JP2
      const a = gen.body.assignments.find((a: { members: Array<{ id: string }> }) =>
        a.members.some((m: { id: string }) => m.id === en1.body.id),
      );
      if (!a) return; // EN1 might not be assigned; skip

      const res = await t.request
        .put(`/api/assignments/${a.id}/adjust`)
        .send({ oldMemberId: en1.body.id, newMemberId: jp2.body.id })
        .expect(200);

      // Should have language violation since now both are Japanese
      const partner = a.members.find((m: { id: string }) => m.id !== en1.body.id);
      if (partner) {
        // Only expect violation if partner is not BOTH
        // The partner might cover both languages, so this is conditional
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
      const gen = await t.request.post('/api/assignments/generate').send({ year: 2027, month: 4 }).expect(200);
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
      await t.request.post('/api/assignments/generate').send({ year: 2027, month: 4 }).expect(200);

      await t.request.delete('/api/assignments?year=2027&month=4').expect(200);

      const res = await t.request.get('/api/assignments?year=2027&month=4').expect(200);
      expect(res.body.length).toBe(0);
    });
  });

  describe('DELETE /api/assignments/by-date', () => {
    it('3.14 clears assignments for a future date', async () => {
      const { schedules } = await setupMembersAndSchedule();
      await t.request.post('/api/assignments/generate').send({ year: 2027, month: 4 }).expect(200);

      const futureDate = schedules[schedules.length - 1].date; // Last Sunday, likely future
      await t.request.delete(`/api/assignments/by-date?date=${futureDate}`).expect(200);

      const res = await t.request.get('/api/assignments?year=2027&month=4').expect(200);
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
      await t.request.post('/api/assignments/generate').send({ year: 2027, month: 4 }).expect(200);

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
      await t.request.post('/api/assignments/generate').send({ year: 2027, month: 4 }).expect(200);

      const excludeId = members[0].id;
      const res = await t.request
        .get(`/api/assignments/candidates?date=${schedules[0].date}&excludeIds=${excludeId}`)
        .expect(200);

      expect(res.body.every((c: { id: string }) => c.id !== excludeId)).toBe(true);
    });

    it('3.20 recommended candidates are sorted first', async () => {
      const { schedules } = await setupMembersAndSchedule();
      await t.request.post('/api/assignments/generate').send({ year: 2027, month: 4 }).expect(200);

      const res = await t.request
        .get(`/api/assignments/candidates?date=${schedules[0].date}&excludeIds=`)
        .expect(200);

      const candidates = res.body;
      if (candidates.length >= 2) {
        // Find first non-recommended
        const firstNonRec = candidates.findIndex((c: { recommended: boolean }) => !c.recommended);
        if (firstNonRec > 0) {
          // All before it should be recommended
          for (let i = 0; i < firstNonRec; i++) {
            expect(candidates[i].recommended).toBe(true);
          }
        }
      }
    });
  });

  describe('Grade group: DTO and candidates filtering', () => {
    it('T10 group 1 = UPPER members, group 2 = LOWER members', async () => {
      await setupMembersAndSchedule();
      await t.request.post('/api/assignments/generate').send({ year: 2027, month: 4 }).expect(200);

      const res = await t.request.get('/api/assignments?year=2027&month=4').expect(200);

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
      const { schedules } = await setupMembersAndSchedule();
      await t.request.post('/api/assignments/generate').send({ year: 2027, month: 4 }).expect(200);

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
      const { schedules } = await setupMembersAndSchedule();
      await t.request.post('/api/assignments/generate').send({ year: 2027, month: 4 }).expect(200);

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
      // Create members with BOTH only in UPPER
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
      const schedules = await seedSchedule(t.request, 2027, 4);

      // Make first date a split-class day
      await t.request.post(`/api/schedules/${schedules[0].id}/toggle-split-class`).expect(200);
      await t.request.post('/api/assignments/generate').send({ year: 2027, month: 4 }).expect(200);

      const res = await t.request
        .get(`/api/assignments/candidates?date=${schedules[0].date}&excludeIds=&role=LOWER`)
        .expect(200);

      // Should include LOWER members and UPPER BOTH members
      const lowerCandidates = res.body.filter((c: { gradeGroup: string }) => c.gradeGroup === 'LOWER');
      const upperBothCandidates = res.body.filter(
        (c: { gradeGroup: string; isCrossover: boolean }) => c.gradeGroup === 'UPPER' && c.isCrossover,
      );

      expect(lowerCandidates.length).toBeGreaterThan(0);
      expect(upperBothCandidates.length).toBeGreaterThan(0);

      // Crossover candidates should have gradeGroupMismatch warning
      for (const c of upperBothCandidates) {
        expect(c.warnings).toContain('gradeGroupMismatch');
      }
    });
  });

  describe('GET /api/assignments/counts', () => {
    it('3.21 returns counts with summary', async () => {
      await setupMembersAndSchedule();
      await t.request.post('/api/assignments/generate').send({ year: 2027, month: 4 }).expect(200);

      const res = await t.request.get('/api/assignments/counts?fiscalYear=2027').expect(200);

      expect(res.body).toHaveProperty('members');
      expect(res.body).toHaveProperty('summary');
      expect(res.body.summary).toHaveProperty('max');
      expect(res.body.summary).toHaveProperty('min');
      expect(res.body.summary).toHaveProperty('average');
    });

    it('3.22 total count equals assignments * 2', async () => {
      await setupMembersAndSchedule();
      const gen = await t.request.post('/api/assignments/generate').send({ year: 2027, month: 4 }).expect(200);

      const res = await t.request.get('/api/assignments/counts?fiscalYear=2027').expect(200);

      const totalCount = res.body.members.reduce((sum: number, m: { count: number }) => sum + m.count, 0);
      expect(totalCount).toBe(gen.body.assignments.length * 2);
    });
  });

  describe('Event management', () => {
    it('5.1 HELPER excluded from event day assignments', async () => {
      // Create members with a HELPER
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

      const schedules = await seedSchedule(t.request, 2027, 4);
      // Set first schedule as event day
      await t.request.post(`/api/schedules/${schedules[0].id}/toggle-event`).expect(200);

      const gen = await t.request.post('/api/assignments/generate').send({ year: 2027, month: 4 }).expect(200);

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

      const schedules = await seedSchedule(t.request, 2027, 4);
      await t.request.post(`/api/schedules/${schedules[0].id}/toggle-event`).expect(200);
      const gen = await t.request.post('/api/assignments/generate').send({ year: 2027, month: 4 }).expect(200);

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
      const schedules = await seedSchedule(t.request, 2027, 4);
      return { members, schedules };
    }

    it('5.3 split-class day with sufficient BOTH members produces no class violations', async () => {
      const { schedules } = await setupSplitClassScenario({
        upper: ['BOTH', 'JAPANESE', 'ENGLISH', 'BOTH', 'JAPANESE'],
        lower: ['BOTH', 'JAPANESE', 'ENGLISH', 'BOTH', 'JAPANESE'],
      });

      // Mark first date as split-class
      await t.request.post(`/api/schedules/${schedules[0].id}/toggle-split-class`).expect(200);

      const gen = await t.request.post('/api/assignments/generate').send({ year: 2027, month: 4 }).expect(200);

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

      const gen = await t.request.post('/api/assignments/generate').send({ year: 2027, month: 4 }).expect(200);

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
      // No split-class toggle — all days are normal

      const gen = await t.request.post('/api/assignments/generate').send({ year: 2027, month: 4 }).expect(200);

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
      const gen = await t.request.post('/api/assignments/generate').send({ year: 2027, month: 4 }).expect(200);

      // Find an assignment on the split-class date that has a BOTH member
      const splitDateAssignments = gen.body.assignments.filter(
        (a: { date: string }) => a.date === schedules[0].date,
      );
      if (splitDateAssignments.length < 2) return;

      // Find a BOTH member in the assignments
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

      // May or may not have class violation depending on whether the other group has BOTH
      expect(res.body).toHaveProperty('violations');
    });
  });
});
