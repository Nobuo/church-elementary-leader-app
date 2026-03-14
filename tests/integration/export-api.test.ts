import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestApp, seedStandardMembers, seedSchedule, type TestApp } from './helpers/setup';

describe('Export API', () => {
  let t: TestApp;

  beforeEach(async () => {
    t = createTestApp();
    await seedStandardMembers(t.request);
    await seedSchedule(t.request, 2027, 4);
    await t.request.post('/api/assignments/generate').send({ year: 2027, month: 4 }).expect(200);
  });
  afterEach(() => { t.db.close(); });

  describe('GET /api/assignments/export/csv', () => {
    it('4.1 exports CSV in Japanese with BOM', async () => {
      const res = await t.request
        .get('/api/assignments/export/csv?year=2027&month=4&lang=ja')
        .expect(200);

      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('\uFEFF');
      expect(res.text).toContain('日付');
    });

    it('4.2 exports CSV in English', async () => {
      const res = await t.request
        .get('/api/assignments/export/csv?year=2027&month=4&lang=en')
        .expect(200);

      expect(res.text).toContain('Date');
    });

    it('4.3 has correct Content-Disposition filename', async () => {
      const res = await t.request
        .get('/api/assignments/export/csv?year=2027&month=4&lang=ja')
        .expect(200);

      expect(res.headers['content-disposition']).toContain('schedule-2027-4.csv');
    });
  });

  describe('GET /api/assignments/export/line', () => {
    it('4.4 exports LINE text in Japanese', async () => {
      const res = await t.request
        .get('/api/assignments/export/line?year=2027&month=4&lang=ja')
        .expect(200);

      expect(res.body).toHaveProperty('text');
      expect(res.body.text).toContain('2027');
      expect(res.body.text).toContain('グループ 1');
    });

    it('4.5 exports LINE text in English', async () => {
      const res = await t.request
        .get('/api/assignments/export/line?year=2027&month=4&lang=en')
        .expect(200);

      expect(res.body.text).toContain('Group 1');
      expect(res.body.text).toContain('Group 2');
    });
  });
});
