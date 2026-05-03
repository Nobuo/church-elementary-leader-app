import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestApp, type TestApp } from './helpers/setup';

describe('Schedule API', () => {
  let t: TestApp;
  const testYear = new Date().getFullYear() + 1;

  beforeEach(() => { t = createTestApp(); });
  afterEach(() => { t.db.close(); });

  describe('POST /api/schedules/generate', () => {
    it('2.1 generates schedule for April', async () => {
      const res = await t.request
        .post('/api/schedules/generate')
        .send({ year: testYear, month: 4 })
        .expect(200);

      expect(res.body.length).toBeGreaterThanOrEqual(4);
      expect(res.body.length).toBeLessThanOrEqual(5);
      // すべての日付が4月の日曜日であるはず
      for (const s of res.body) {
        const d = new Date(s.date);
        expect(d.getDay()).toBe(0); // 日曜日
        expect(d.getMonth()).toBe(3); // 4月（0始まり）
        expect(d.getFullYear()).toBe(testYear);
      }
    });

    it('2.2 regeneration is idempotent', async () => {
      const res1 = await t.request.post('/api/schedules/generate').send({ year: testYear, month: 4 }).expect(200);
      const res2 = await t.request.post('/api/schedules/generate').send({ year: testYear, month: 4 }).expect(200);
      expect(res2.body.length).toBe(res1.body.length);
    });

    it('2.3 returns 400 when year/month missing', async () => {
      await t.request.post('/api/schedules/generate').send({}).expect(400);
    });
  });

  describe('POST /api/schedules/generate-fiscal-year', () => {
    it('generates schedules for the full fiscal year', async () => {
      const fiscalYear = testYear;

      const res = await t.request
        .post('/api/schedules/generate-fiscal-year')
        .send({ fiscalYear })
        .expect(200);

      expect(res.body.schedules.length).toBeGreaterThanOrEqual(52);
      expect(res.body.schedules.every((s: { date: string }) => new Date(s.date).getDay() === 0)).toBe(true);
      expect(res.body.createdCount).toBeGreaterThanOrEqual(52);
      expect(res.body.existingCount).toBe(0);

      const april = await t.request.get(`/api/schedules?year=${fiscalYear}&month=4`).expect(200);
      const march = await t.request.get(`/api/schedules?year=${fiscalYear + 1}&month=3`).expect(200);
      expect(april.body.length).toBeGreaterThanOrEqual(4);
      expect(march.body.length).toBeGreaterThanOrEqual(4);
    });

    it('is idempotent for the same fiscal year', async () => {
      const fiscalYear = testYear;
      const res1 = await t.request.post('/api/schedules/generate-fiscal-year').send({ fiscalYear }).expect(200);
      const res2 = await t.request.post('/api/schedules/generate-fiscal-year').send({ fiscalYear }).expect(200);
      expect(res2.body.schedules).toHaveLength(res1.body.schedules.length);
      expect(res2.body.createdCount).toBe(0);
      expect(res2.body.existingCount).toBe(res1.body.schedules.length);
    });

    it('returns 400 when fiscalYear is missing', async () => {
      await t.request.post('/api/schedules/generate-fiscal-year').send({}).expect(400);
    });
  });

  describe('GET /api/schedules', () => {
    it('2.4 returns schedules after generation', async () => {
      await t.request.post('/api/schedules/generate').send({ year: testYear, month: 4 }).expect(200);
      const res = await t.request.get(`/api/schedules?year=${testYear}&month=4`).expect(200);
      expect(res.body.length).toBeGreaterThanOrEqual(4);
    });

    it('2.5 returns empty array for ungenerated month', async () => {
      const res = await t.request.get(`/api/schedules?year=${testYear}&month=5`).expect(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('GET /api/schedules/fiscal-year', () => {
    it('returns all schedules for the fiscal year', async () => {
      await t.request.post('/api/schedules/generate-fiscal-year').send({ fiscalYear: testYear }).expect(200);
      const res = await t.request.get(`/api/schedules/fiscal-year?fiscalYear=${testYear}`).expect(200);
      expect(res.body.length).toBeGreaterThanOrEqual(52);
      expect(res.body.every((s: { year: number }) => s.year === testYear)).toBe(true);
    });

    it('returns 400 when fiscalYear is missing', async () => {
      await t.request.get('/api/schedules/fiscal-year').expect(400);
    });
  });

  describe('POST /api/schedules/:id/toggle-exclusion', () => {
    it('2.6 toggles exclusion on', async () => {
      const schedules = await t.request.post('/api/schedules/generate').send({ year: testYear, month: 4 }).expect(200);
      const id = schedules.body[0].id;

      const res = await t.request.post(`/api/schedules/${id}/toggle-exclusion`).expect(200);
      expect(res.body.isExcluded).toBe(true);
    });

    it('2.7 toggles exclusion off', async () => {
      const schedules = await t.request.post('/api/schedules/generate').send({ year: testYear, month: 4 }).expect(200);
      const id = schedules.body[0].id;

      await t.request.post(`/api/schedules/${id}/toggle-exclusion`).expect(200);
      const res = await t.request.post(`/api/schedules/${id}/toggle-exclusion`).expect(200);
      expect(res.body.isExcluded).toBe(false);
    });

    it('2.8 returns 400 for non-existent ID', async () => {
      await t.request.post('/api/schedules/non-existent/toggle-exclusion').expect(400);
    });
  });

  describe('POST /api/schedules/:id/toggle-event', () => {
    it('2.9 toggles event on', async () => {
      const schedules = await t.request.post('/api/schedules/generate').send({ year: testYear, month: 4 }).expect(200);
      const id = schedules.body[0].id;

      const res = await t.request.post(`/api/schedules/${id}/toggle-event`).expect(200);
      expect(res.body.isEvent).toBe(true);
    });

    it('2.10 toggles event off', async () => {
      const schedules = await t.request.post('/api/schedules/generate').send({ year: testYear, month: 4 }).expect(200);
      const id = schedules.body[0].id;

      await t.request.post(`/api/schedules/${id}/toggle-event`).expect(200);
      const res = await t.request.post(`/api/schedules/${id}/toggle-event`).expect(200);
      expect(res.body.isEvent).toBe(false);
    });

    it('2.11 returns 400 for non-existent ID', async () => {
      await t.request.post('/api/schedules/non-existent/toggle-event').expect(400);
    });
  });

  describe('POST /api/schedules/:id/toggle-ebt', () => {
    it('toggles EBT on', async () => {
      const schedules = await t.request.post('/api/schedules/generate').send({ year: testYear, month: 4 }).expect(200);
      const id = schedules.body[0].id;

      const res = await t.request.post(`/api/schedules/${id}/toggle-ebt`).expect(200);
      expect(res.body.isEbt).toBe(true);
    });

    it('toggles EBT off', async () => {
      const schedules = await t.request.post('/api/schedules/generate').send({ year: testYear, month: 4 }).expect(200);
      const id = schedules.body[0].id;

      await t.request.post(`/api/schedules/${id}/toggle-ebt`).expect(200);
      const res = await t.request.post(`/api/schedules/${id}/toggle-ebt`).expect(200);
      expect(res.body.isEbt).toBe(false);
    });

    it('returns 400 for non-existent ID', async () => {
      await t.request.post('/api/schedules/non-existent/toggle-ebt').expect(400);
    });
  });

  describe('POST /api/schedules/:id/toggle-split-class', () => {
    it('2.12 toggles split-class on', async () => {
      const schedules = await t.request.post('/api/schedules/generate').send({ year: testYear, month: 4 }).expect(200);
      const id = schedules.body[0].id;

      const res = await t.request.post(`/api/schedules/${id}/toggle-split-class`).expect(200);
      expect(res.body.isSplitClass).toBe(true);
    });

    it('2.13 toggles split-class off', async () => {
      const schedules = await t.request.post('/api/schedules/generate').send({ year: testYear, month: 4 }).expect(200);
      const id = schedules.body[0].id;

      await t.request.post(`/api/schedules/${id}/toggle-split-class`).expect(200);
      const res = await t.request.post(`/api/schedules/${id}/toggle-split-class`).expect(200);
      expect(res.body.isSplitClass).toBe(false);
    });

    it('2.14 isSplitClass appears in GET response', async () => {
      const schedules = await t.request.post('/api/schedules/generate').send({ year: testYear, month: 4 }).expect(200);
      const id = schedules.body[0].id;
      await t.request.post(`/api/schedules/${id}/toggle-split-class`).expect(200);

      const res = await t.request.get(`/api/schedules?year=${testYear}&month=4`).expect(200);
      const updated = res.body.find((s: { id: string }) => s.id === id);
      expect(updated.isSplitClass).toBe(true);
    });

    it('2.15 returns 400 for non-existent ID', async () => {
      await t.request.post('/api/schedules/non-existent/toggle-split-class').expect(400);
    });
  });

  describe('PUT /api/schedules/:id/event-name', () => {
    it('saves both eventNameJa and eventNameEn', async () => {
      const schedules = await t.request.post('/api/schedules/generate').send({ year: testYear, month: 4 }).expect(200);
      const id = schedules.body[0].id;

      const res = await t.request
        .put(`/api/schedules/${id}/event-name`)
        .send({ eventNameJa: 'クリスマス会', eventNameEn: 'Christmas Party' })
        .expect(200);
      expect(res.body.eventNameJa).toBe('クリスマス会');
      expect(res.body.eventNameEn).toBe('Christmas Party');
    });

    it('saves only one language, other is null', async () => {
      const schedules = await t.request.post('/api/schedules/generate').send({ year: testYear, month: 4 }).expect(200);
      const id = schedules.body[0].id;

      const res = await t.request
        .put(`/api/schedules/${id}/event-name`)
        .send({ eventNameJa: 'テスト' })
        .expect(200);
      expect(res.body.eventNameJa).toBe('テスト');
      expect(res.body.eventNameEn).toBeNull();
    });

    it('converts empty string to null', async () => {
      const schedules = await t.request.post('/api/schedules/generate').send({ year: testYear, month: 4 }).expect(200);
      const id = schedules.body[0].id;

      const res = await t.request
        .put(`/api/schedules/${id}/event-name`)
        .send({ eventNameJa: '', eventNameEn: '  ' })
        .expect(200);
      expect(res.body.eventNameJa).toBeNull();
      expect(res.body.eventNameEn).toBeNull();
    });

    it('eventName appears in GET response', async () => {
      const schedules = await t.request.post('/api/schedules/generate').send({ year: testYear, month: 4 }).expect(200);
      const id = schedules.body[0].id;
      await t.request
        .put(`/api/schedules/${id}/event-name`)
        .send({ eventNameJa: 'テスト', eventNameEn: 'Test' })
        .expect(200);

      const res = await t.request.get(`/api/schedules?year=${testYear}&month=4`).expect(200);
      const updated = res.body.find((s: { id: string }) => s.id === id);
      expect(updated.eventNameJa).toBe('テスト');
      expect(updated.eventNameEn).toBe('Test');
    });

    it('returns 400 for non-existent ID', async () => {
      await t.request
        .put('/api/schedules/non-existent/event-name')
        .send({ eventNameJa: 'テスト' })
        .expect(400);
    });

    it('returns 400 when eventNameJa exceeds 100 characters', async () => {
      const schedules = await t.request.post('/api/schedules/generate').send({ year: testYear, month: 4 }).expect(200);
      const id = schedules.body[0].id;

      await t.request
        .put(`/api/schedules/${id}/event-name`)
        .send({ eventNameJa: 'あ'.repeat(101) })
        .expect(400);
    });

    it('returns 400 when eventNameEn exceeds 100 characters', async () => {
      const schedules = await t.request.post('/api/schedules/generate').send({ year: testYear, month: 4 }).expect(200);
      const id = schedules.body[0].id;

      await t.request
        .put(`/api/schedules/${id}/event-name`)
        .send({ eventNameEn: 'a'.repeat(101) })
        .expect(400);
    });
  });
});
