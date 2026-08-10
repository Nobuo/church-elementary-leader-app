import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestApp, seedStandardMembers, seedSchedule, seedAssignments, type TestApp } from './helpers/setup';

describe('Bulk clear assignments', () => {
  let t: TestApp;

  beforeEach(async () => {
    t = createTestApp();
    await seedStandardMembers(t.request);
  });
  afterEach(() => { t.close(); });

  it('clears all assignments for a future month', async () => {
    // 常に未来日になるよう、十分先の月を使う
    await seedSchedule(t.request, 2099, 4);
    await seedAssignments(t.request, 2099, 4);

    // 割り当てが存在することを確認する
    const before = await t.request.get('/api/assignments?year=2099&month=4').expect(200);
    expect(before.body.length).toBeGreaterThan(0);

    // 一括クリア
    await t.request.delete('/api/assignments?year=2099&month=4').expect(200);

    // すべてクリアされたことを確認する
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
    // 単一日付のクリア（by-date）は独立して動作するはず
    await seedSchedule(t.request, 2099, 5);
    await seedAssignments(t.request, 2099, 5);

    const before = await t.request.get('/api/assignments?year=2099&month=5').expect(200);
    expect(before.body.length).toBeGreaterThan(0);

    // 割り当てから特定の日付を取得する
    const date = before.body[0].date;
    await t.request.delete(`/api/assignments/by-date?date=${date}`).expect(200);

    const after = await t.request.get('/api/assignments?year=2099&month=5').expect(200);
    expect(after.body.length).toBeLessThan(before.body.length);
  });
});
