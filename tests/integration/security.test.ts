import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestApp, type TestApp } from './helpers/setup';

describe('Security', () => {
  let t: TestApp;

  beforeEach(() => { t = createTestApp(); });
  afterEach(() => { t.db.close(); });

  describe('Security headers (helmet)', () => {
    it('sets X-Content-Type-Options', async () => {
      const res = await t.request.get('/api/members').expect(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('sets X-Frame-Options or equivalent', async () => {
      const res = await t.request.get('/api/members').expect(200);
      // helmet sets x-frame-options by default
      expect(res.headers['x-frame-options']).toBeDefined();
    });
  });

  describe('Input validation - enum values', () => {
    it('rejects invalid gender', async () => {
      const res = await t.request.post('/api/members').send({
        name: 'Test', gender: 'ATTACK', language: 'JAPANESE',
        gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false,
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid gender/);
    });

    it('rejects invalid language', async () => {
      const res = await t.request.post('/api/members').send({
        name: 'Test', gender: 'MALE', language: 'FRENCH',
        gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false,
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid language/);
    });

    it('rejects invalid gradeGroup', async () => {
      const res = await t.request.post('/api/members').send({
        name: 'Test', gender: 'MALE', language: 'JAPANESE',
        gradeGroup: 'MIDDLE', memberType: 'PARENT_SINGLE', sameGenderOnly: false,
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid gradeGroup/);
    });

    it('rejects invalid memberType', async () => {
      const res = await t.request.post('/api/members').send({
        name: 'Test', gender: 'MALE', language: 'JAPANESE',
        gradeGroup: 'LOWER', memberType: 'ADMIN', sameGenderOnly: false,
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid memberType/);
    });

    it('accepts valid enum values', async () => {
      const res = await t.request.post('/api/members').send({
        name: 'Valid', gender: 'MALE', language: 'JAPANESE',
        gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false,
      });
      expect(res.status).toBe(201);
    });
  });

  describe('Input validation - year/month/date', () => {
    it('rejects month=13 on schedule GET', async () => {
      const res = await t.request.get('/api/schedules?year=2027&month=13');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/month/);
    });

    it('rejects year=1999 on schedule GET', async () => {
      const res = await t.request.get('/api/schedules?year=1999&month=4');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/year/);
    });

    it('rejects invalid date on by-date delete', async () => {
      const res = await t.request.delete('/api/assignments/by-date?date=not-a-date');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/date/i);
    });
  });

  describe('Input validation - name length', () => {
    it('rejects name longer than 200 characters', async () => {
      const res = await t.request.post('/api/members').send({
        name: 'A'.repeat(201), gender: 'MALE', language: 'JAPANESE',
        gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false,
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/200/);
    });

    it('accepts name with exactly 200 characters', async () => {
      const res = await t.request.post('/api/members').send({
        name: 'A'.repeat(200), gender: 'MALE', language: 'JAPANESE',
        gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false,
      });
      expect(res.status).toBe(201);
    });
  });

  describe('Global error handler', () => {
    it('does not leak stack traces in error responses', async () => {
      // Accessing a non-existent member for update should return clean error
      const res = await t.request.put('/api/members/nonexistent-id').send({ name: 'test' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
      expect(res.body.stack).toBeUndefined();
    });
  });
});
