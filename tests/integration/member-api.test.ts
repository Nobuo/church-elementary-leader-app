import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestApp, seedStandardMembers, type TestApp } from './helpers/setup';

describe('Member API', () => {
  let t: TestApp;

  beforeEach(() => { t = createTestApp(); });
  afterEach(() => { t.db.close(); });

  describe('POST /api/members', () => {
    it('1.1 registers a member successfully', async () => {
      const res = await t.request
        .post('/api/members')
        .send({ name: 'Test', gender: 'MALE', language: 'JAPANESE', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('Test');
      expect(res.body.gender).toBe('MALE');
      expect(res.body.isActive).toBe(true);
    });

    it('1.2 returns 400 when name is empty', async () => {
      const res = await t.request
        .post('/api/members')
        .send({ name: '', gender: 'MALE', language: 'JAPANESE', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false })
        .expect(400);

      expect(res.body).toHaveProperty('error');
    });

    it('1.3 returns 400 when name is whitespace only', async () => {
      const res = await t.request
        .post('/api/members')
        .send({ name: '   ', gender: 'MALE', language: 'JAPANESE', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false })
        .expect(400);

      expect(res.body).toHaveProperty('error');
    });

    it('1.4 returns 400 for invalid memberType', async () => {
      const res = await t.request
        .post('/api/members')
        .send({ name: 'Test', gender: 'MALE', language: 'JAPANESE', gradeGroup: 'UPPER', memberType: 'PARENT_COUPLE', sameGenderOnly: false, spouseId: 'non-existent' })
        .expect(400);

      expect(res.body).toHaveProperty('error');
    });

    it('1.5 registers PARENT_COUPLE with bidirectional spouse link', async () => {
      const res1 = await t.request
        .post('/api/members')
        .send({ name: 'Husband', gender: 'MALE', language: 'JAPANESE', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false })
        .expect(201);

      const res2 = await t.request
        .post('/api/members')
        .send({ name: 'Wife', gender: 'FEMALE', language: 'ENGLISH', gradeGroup: 'LOWER', memberType: 'PARENT_COUPLE', sameGenderOnly: false, spouseId: res1.body.id })
        .expect(201);

      expect(res2.body.spouseId).toBe(res1.body.id);

      // Check reverse link
      const husband = await t.request.get(`/api/members?activeOnly=false`).expect(200);
      const h = husband.body.find((m: { id: string }) => m.id === res1.body.id);
      expect(h.spouseId).toBe(res2.body.id);
      expect(h.memberType).toBe('PARENT_COUPLE');
    });

    it('1.6 returns 400 for non-existent spouseId', async () => {
      await t.request
        .post('/api/members')
        .send({ name: 'Test', gender: 'MALE', language: 'JAPANESE', gradeGroup: 'UPPER', memberType: 'PARENT_COUPLE', sameGenderOnly: false, spouseId: 'non-existent-id' })
        .expect(400);
    });
  });

  describe('GET /api/members', () => {
    it('1.7 returns only active members by default', async () => {
      const members = await seedStandardMembers(t.request);
      // Deactivate one
      await t.request.post(`/api/members/${members[0].id}/deactivate`).expect(200);

      const res = await t.request.get('/api/members?activeOnly=true').expect(200);
      expect(res.body.length).toBe(9);
      expect(res.body.every((m: { isActive: boolean }) => m.isActive)).toBe(true);
    });

    it('1.8 returns all members when activeOnly=false', async () => {
      const members = await seedStandardMembers(t.request);
      await t.request.post(`/api/members/${members[0].id}/deactivate`).expect(200);

      const res = await t.request.get('/api/members?activeOnly=false').expect(200);
      expect(res.body.length).toBe(10);
    });
  });

  describe('PUT /api/members/:id', () => {
    it('1.9 updates member name', async () => {
      const create = await t.request
        .post('/api/members')
        .send({ name: 'Old Name', gender: 'MALE', language: 'JAPANESE', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false })
        .expect(201);

      const res = await t.request
        .put(`/api/members/${create.body.id}`)
        .send({ name: 'New Name' })
        .expect(200);

      expect(res.body.name).toBe('New Name');
    });

    it('1.10 returns 400 for non-existent ID', async () => {
      await t.request
        .put('/api/members/non-existent-id')
        .send({ name: 'Test' })
        .expect(400);
    });
  });

  describe('POST /api/members/:id/deactivate', () => {
    it('1.11 deactivates a member', async () => {
      const create = await t.request
        .post('/api/members')
        .send({ name: 'Test', gender: 'MALE', language: 'JAPANESE', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false })
        .expect(201);

      const res = await t.request.post(`/api/members/${create.body.id}/deactivate`).expect(200);
      expect(res.body.isActive).toBe(false);
    });

    it('1.12 deactivated member excluded from activeOnly list', async () => {
      const create = await t.request
        .post('/api/members')
        .send({ name: 'Test', gender: 'MALE', language: 'JAPANESE', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false })
        .expect(201);

      await t.request.post(`/api/members/${create.body.id}/deactivate`).expect(200);
      const res = await t.request.get('/api/members?activeOnly=true').expect(200);
      expect(res.body.find((m: { id: string }) => m.id === create.body.id)).toBeUndefined();
    });
  });

  describe('GET /api/members/export/csv', () => {
    it('1.13 exports CSV in Japanese with BOM', async () => {
      await seedStandardMembers(t.request);
      const res = await t.request.get('/api/members/export/csv?lang=ja').expect(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('\uFEFF');
      expect(res.text).toContain('氏名');
    });

    it('1.14 exports CSV in English', async () => {
      await seedStandardMembers(t.request);
      const res = await t.request.get('/api/members/export/csv?lang=en').expect(200);
      expect(res.text).toContain('Name');
    });
  });

  describe('POST /api/members/import/csv', () => {
    it('1.15 imports CSV to create new members', async () => {
      const csv = `Name,Gender,Language,Grade Group,Member Type,Same-gender Only,Spouse,Available Dates,Active
テスト太郎,MALE,JAPANESE,UPPER,PARENT_SINGLE,FALSE,,,TRUE`;
      const res = await t.request
        .post('/api/members/import/csv')
        .set('Content-Type', 'text/plain')
        .send(csv)
        .expect(200);

      expect(res.body.created).toBeGreaterThan(0);
    });

    it('1.16 imports CSV to update existing members', async () => {
      await seedStandardMembers(t.request);
      const csv = `Name,Gender,Language,Grade Group,Member Type,Same-gender Only,Spouse,Available Dates,Active
田中太郎,MALE,BOTH,UPPER,PARENT_SINGLE,FALSE,,,TRUE`;
      const res = await t.request
        .post('/api/members/import/csv')
        .set('Content-Type', 'text/plain')
        .send(csv)
        .expect(200);

      expect(res.body.updated).toBeGreaterThan(0);
    });

    it('1.17 returns 400 for empty CSV', async () => {
      await t.request
        .post('/api/members/import/csv')
        .set('Content-Type', 'text/plain')
        .send('')
        .expect(400);
    });
  });
});
