import express, { Router, Request, Response } from 'express';
import { MemberId } from '@shared/types';
import { Member } from '@domain/entities/member';
import { MemberRepository } from '@domain/repositories/member-repository';
import { registerMember } from '@application/use-cases/register-member';
import { updateMember } from '@application/use-cases/update-member';
import { deactivateMember } from '@application/use-cases/deactivate-member';
import { listMembers } from '@application/use-cases/list-members';
import { formatMemberCsv } from '@domain/services/member-csv-formatter';
import { importMembersCsv } from '@application/use-cases/import-members-csv';

export function createMemberController(memberRepo: MemberRepository): Router {
  const router = Router();

  router.get('/', (req: Request, res: Response) => {
    const activeOnly = req.query.activeOnly !== 'false';
    const members = listMembers(memberRepo, activeOnly);
    res.json(members);
  });

  router.post('/', (req: Request, res: Response) => {
    const result = registerMember(req.body, memberRepo);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.status(201).json(result.value);
  });

  router.put('/:id', (req: Request, res: Response) => {
    const result = updateMember({ ...req.body, id: String(req.params.id) }, memberRepo);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result.value);
  });

  router.get('/export/csv', (req: Request, res: Response) => {
    const lang = (req.query.lang as string) === 'en' ? 'en' : 'ja';
    const members = memberRepo.findAll(false);
    const memberMap = new Map<MemberId, Member>();
    for (const m of members) memberMap.set(m.id, m);

    const csv = formatMemberCsv(members, memberMap, lang);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=members.csv');
    res.send(csv);
  });

  router.post('/import/csv', express.text({ type: 'text/*', limit: '5mb' }), (req: Request, res: Response) => {
    const csvContent = typeof req.body === 'string' ? req.body : '';
    if (!csvContent.trim()) {
      res.status(400).json({ error: 'CSV content is empty' });
      return;
    }
    const result = importMembersCsv(csvContent, memberRepo);
    res.json(result);
  });

  router.post('/:id/deactivate', (req: Request, res: Response) => {
    const result = deactivateMember(String(req.params.id), memberRepo);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result.value);
  });

  return router;
}
