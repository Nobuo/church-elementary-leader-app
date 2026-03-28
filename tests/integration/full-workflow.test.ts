import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestApp, seedStandardMembers, type TestApp } from './helpers/setup';

describe('Full Workflow', () => {
  let t: TestApp;

  beforeEach(() => { t = createTestApp(); });
  afterEach(() => { t.db.close(); });

  it('6.1-6.14 complete workflow: register → schedule → assign → adjust → export', async () => {
    // 6.1 Register 10 members
    const members = await seedStandardMembers(t.request);
    expect(members.length).toBe(10);

    const list = await t.request.get('/api/members?activeOnly=true').expect(200);
    expect(list.body.length).toBe(10);

    // 6.2 Register spouse link
    const husband = members[0];
    const wifeRes = await t.request.post('/api/members').send({
      name: '配偶者テスト',
      gender: 'FEMALE',
      language: 'ENGLISH',
      gradeGroup: 'LOWER',
      memberType: 'PARENT_COUPLE',
      sameGenderOnly: false,
      spouseId: husband.id,
    }).expect(201);

    const husbandCheck = await t.request.get('/api/members?activeOnly=false').expect(200);
    const h = husbandCheck.body.find((m: { id: string }) => m.id === husband.id);
    expect(h.spouseId).toBe(wifeRes.body.id);
    expect(h.memberType).toBe('PARENT_COUPLE');

    // 6.3 Generate April 2027 schedule
    const schedules = await t.request
      .post('/api/schedules/generate')
      .send({ year: 2027, month: 4 })
      .expect(200);
    expect(schedules.body.length).toBeGreaterThanOrEqual(4);

    // 6.4 Exclude one day, set one as event
    await t.request.post(`/api/schedules/${schedules.body[0].id}/toggle-exclusion`).expect(200);
    await t.request.post(`/api/schedules/${schedules.body[1].id}/toggle-event`).expect(200);

    const updatedSchedules = await t.request.get('/api/schedules?year=2027&month=4').expect(200);
    expect(updatedSchedules.body.find((s: { id: string }) => s.id === schedules.body[0].id).isExcluded).toBe(true);
    expect(updatedSchedules.body.find((s: { id: string }) => s.id === schedules.body[1].id).isEvent).toBe(true);

    // Toggle all schedules to split-class for 2-group behavior
    for (const s of schedules.body) {
      await t.request.post(`/api/schedules/${s.id}/toggle-split-class`).expect(200);
    }

    // 6.5 Generate assignments (excluded days should not have assignments)
    const gen = await t.request
      .post('/api/assignments/generate')
      .send({ year: 2027, month: 4 })
      .expect(200);

    const activeDates = schedules.body.filter((s: { id: string }) => s.id !== schedules.body[0].id).length;
    expect(gen.body.assignments.length).toBe(activeDates * 2);

    const assignmentDates = gen.body.assignments.map((a: { date: string }) => a.date);
    expect(assignmentDates).not.toContain(schedules.body[0].date);

    // 6.7 Check violations have messageKey
    for (const v of gen.body.violations) {
      expect(v).toHaveProperty('messageKey');
      expect(v).toHaveProperty('messageParams');
    }

    // 6.8 Member replacement
    const firstAssignment = gen.body.assignments[0];
    const assignedIds = new Set(firstAssignment.members.map((m: { id: string }) => m.id));
    const replacement = members.find(m => !assignedIds.has(m.id));
    if (replacement) {
      const adjustRes = await t.request
        .put(`/api/assignments/${firstAssignment.id}/adjust`)
        .send({ oldMemberId: firstAssignment.members[0].id, newMemberId: replacement.id })
        .expect(200);

      expect(adjustRes.body.assignment.members.some((m: { id: string }) => m.id === replacement.id)).toBe(true);

      // 6.9 Violations have messageKey
      for (const v of adjustRes.body.violations) {
        expect(v).toHaveProperty('messageKey');
      }
    }

    // 6.10 Assignment counts
    const counts = await t.request.get('/api/assignments/counts?fiscalYear=2027').expect(200);
    expect(counts.body.summary).toHaveProperty('max');
    expect(counts.body.summary).toHaveProperty('min');
    expect(counts.body.summary).toHaveProperty('average');
    expect(counts.body.members.length).toBeGreaterThan(0);

    // 6.11 Clear future date assignments
    const assignments = await t.request.get('/api/assignments?year=2027&month=4').expect(200);
    const lastDate = [...new Set(assignments.body.map((a: { date: string }) => a.date))].sort().pop() as string;
    await t.request.delete(`/api/assignments/by-date?date=${lastDate}`).expect(200);

    const afterClear = await t.request.get('/api/assignments?year=2027&month=4').expect(200);
    const remainingDates = afterClear.body.map((a: { date: string }) => a.date);
    expect(remainingDates).not.toContain(lastDate);
    expect(afterClear.body.length).toBeLessThan(assignments.body.length);

    // 6.12 CSV export (Japanese)
    const csv = await t.request.get('/api/assignments/export/csv?year=2027&month=4&lang=ja').expect(200);
    expect(csv.text).toContain('\uFEFF');
    expect(csv.text).toContain('日付');

    // 6.13 LINE export (English)
    const line = await t.request.get('/api/assignments/export/line?year=2027&month=4&lang=en').expect(200);
    expect(line.body.text).toContain('Group 1');
    expect(line.body.text).toContain('Group 2');

    // 6.14 Member CSV round-trip
    const csvExport = await t.request.get('/api/members/export/csv?lang=ja').expect(200);
    expect(csvExport.text).toContain('田中太郎');
  });
});
