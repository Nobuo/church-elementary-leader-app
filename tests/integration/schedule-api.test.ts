import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestApp, type TestApp } from './helpers/setup';

describe('Schedule API', () => {
  let t: TestApp;

  beforeEach(() => { t = createTestApp(); });
  afterEach(() => { t.db.close(); });

  describe('POST /api/schedules/generate', () => {
    it('2.1 generates schedule for April 2027', async () => {
      const res = await t.request
        .post('/api/schedules/generate')
        .send({ year: 2027, month: 4 })
        .expect(200);

      expect(res.body.length).toBeGreaterThanOrEqual(4);
      expect(res.body.length).toBeLessThanOrEqual(5);
      // All dates should be Sundays in April 2027
      for (const s of res.body) {
        const d = new Date(s.date);
        expect(d.getDay()).toBe(0); // Sunday
        expect(d.getMonth()).toBe(3); // April (0-indexed)
        expect(d.getFullYear()).toBe(2027);
      }
    });

    it('2.2 regeneration is idempotent', async () => {
      const res1 = await t.request.post('/api/schedules/generate').send({ year: 2027, month: 4 }).expect(200);
      const res2 = await t.request.post('/api/schedules/generate').send({ year: 2027, month: 4 }).expect(200);
      expect(res2.body.length).toBe(res1.body.length);
    });

    it('2.3 returns 400 when year/month missing', async () => {
      await t.request.post('/api/schedules/generate').send({}).expect(400);
    });
  });

  describe('GET /api/schedules', () => {
    it('2.4 returns schedules after generation', async () => {
      await t.request.post('/api/schedules/generate').send({ year: 2027, month: 4 }).expect(200);
      const res = await t.request.get('/api/schedules?year=2027&month=4').expect(200);
      expect(res.body.length).toBeGreaterThanOrEqual(4);
    });

    it('2.5 returns empty array for ungenerated month', async () => {
      const res = await t.request.get('/api/schedules?year=2027&month=5').expect(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('POST /api/schedules/:id/toggle-exclusion', () => {
    it('2.6 toggles exclusion on', async () => {
      const schedules = await t.request.post('/api/schedules/generate').send({ year: 2027, month: 4 }).expect(200);
      const id = schedules.body[0].id;

      const res = await t.request.post(`/api/schedules/${id}/toggle-exclusion`).expect(200);
      expect(res.body.isExcluded).toBe(true);
    });

    it('2.7 toggles exclusion off', async () => {
      const schedules = await t.request.post('/api/schedules/generate').send({ year: 2027, month: 4 }).expect(200);
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
      const schedules = await t.request.post('/api/schedules/generate').send({ year: 2027, month: 4 }).expect(200);
      const id = schedules.body[0].id;

      const res = await t.request.post(`/api/schedules/${id}/toggle-event`).expect(200);
      expect(res.body.isEvent).toBe(true);
    });

    it('2.10 toggles event off', async () => {
      const schedules = await t.request.post('/api/schedules/generate').send({ year: 2027, month: 4 }).expect(200);
      const id = schedules.body[0].id;

      await t.request.post(`/api/schedules/${id}/toggle-event`).expect(200);
      const res = await t.request.post(`/api/schedules/${id}/toggle-event`).expect(200);
      expect(res.body.isEvent).toBe(false);
    });

    it('2.11 returns 400 for non-existent ID', async () => {
      await t.request.post('/api/schedules/non-existent/toggle-event').expect(400);
    });
  });
});
