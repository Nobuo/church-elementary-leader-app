import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestApp, seedStandardMembers, seedSchedule, seedAssignments, type TestApp } from './helpers/setup';

describe('Bulk clear assignments', () => {
  let t: TestApp;

  beforeEach(async () => {
    t = createTestApp();
    await seedStandardMembers(t.request);
  });
  afterEach(() => { t.db.close(); });

  it('clears all assignments for a future month', async () => {
    // Use a far-future month to ensure it's always future
    await seedSchedule(t.request, 2099, 4);
    await seedAssignments(t.request, 2099, 4);

    // Verify assignments exist
    const before = await t.request.get('/api/assignments?year=2099&month=4').expect(200);
    expect(before.body.length).toBeGreaterThan(0);

    // Bulk clear
    await t.request.delete('/api/assignments?year=2099&month=4').expect(200);

    // Verify all cleared
    const after = await t.request.get('/api/assignments?year=2099&month=4').expect(200);
    expect(after.body.length).toBe(0);
  });

  it('rejects bulk clear for current month', async () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const res = await t.request.delete(`/api/assignments?year=${year}&month=${month}`).expect(400);
    expect(res.body.error).toContain('Cannot clear current or past month');
  });

  it('rejects bulk clear for past month', async () => {
    const res = await t.request.delete('/api/assignments?year=2020&month=1').expect(400);
    expect(res.body.error).toContain('Cannot clear current or past month');
  });

  it('does not affect single-date clear for future dates', async () => {
    // Single-date clear (by-date) should still work independently
    await seedSchedule(t.request, 2099, 5);
    await seedAssignments(t.request, 2099, 5);

    const before = await t.request.get('/api/assignments?year=2099&month=5').expect(200);
    expect(before.body.length).toBeGreaterThan(0);

    // Get a specific date from the assignments
    const date = before.body[0].date;
    await t.request.delete(`/api/assignments/by-date?date=${date}`).expect(200);

    const after = await t.request.get('/api/assignments?year=2099&month=5').expect(200);
    expect(after.body.length).toBeLessThan(before.body.length);
  });
});
