import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestApp, seedStandardMembers, seedSchedule, type TestApp } from './helpers/setup';

describe('Export API', () => {
  let t: TestApp;
  const testYear = new Date().getFullYear() + 1;

  beforeEach(async () => {
    t = createTestApp();
    await seedStandardMembers(t.request);
    const schedules = await seedSchedule(t.request, testYear, 4);
    for (const s of schedules) {
      await t.request.post(`/api/schedules/${s.id}/toggle-split-class`).expect(200);
    }
    await t.request.post('/api/assignments/generate').send({ year: testYear, month: 4 }).expect(200);
  });
  afterEach(() => { t.db.close(); });

  describe('GET /api/assignments/export/csv', () => {
    it('4.1 exports CSV in Japanese with BOM', async () => {
      const res = await t.request
        .get(`/api/assignments/export/csv?year=${testYear}&month=4&lang=ja`)
        .expect(200);

      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('\uFEFF');
      expect(res.text).toContain('日付');
    });

    it('4.2 exports CSV in English', async () => {
      const res = await t.request
        .get(`/api/assignments/export/csv?year=${testYear}&month=4&lang=en`)
        .expect(200);

      expect(res.text).toContain('Date');
    });

    it('4.3 has correct Content-Disposition filename', async () => {
      const res = await t.request
        .get(`/api/assignments/export/csv?year=${testYear}&month=4&lang=ja`)
        .expect(200);

      expect(res.headers['content-disposition']).toContain(`schedule-${testYear}-4.csv`);
    });
  });

  describe('GET /api/assignments/export/line', () => {
    it('4.4 exports LINE text in Japanese', async () => {
      const res = await t.request
        .get(`/api/assignments/export/line?year=${testYear}&month=4&lang=ja`)
        .expect(200);

      expect(res.body).toHaveProperty('text');
      expect(res.body.text).toContain(String(testYear));
      expect(res.body.text).toContain('※ヘルパーの方で難しい日がありましたら');
    });

    it('4.5 exports LINE text in English', async () => {
      const res = await t.request
        .get(`/api/assignments/export/line?year=${testYear}&month=4&lang=en`)
        .expect(200);

      expect(res.body.text).toContain('Leader Schedule');
      expect(res.body.text).toContain('If any helper');
    });
  });
});
