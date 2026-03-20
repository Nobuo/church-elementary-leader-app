import { Router, Request, Response } from 'express';
import { isValidYear, isValidMonth, isValidDateString } from '@shared/validators';
import { MemberId } from '@shared/types';
import { Member } from '@domain/entities/member';
import { MemberRepository } from '@domain/repositories/member-repository';
import { ScheduleRepository } from '@domain/repositories/schedule-repository';
import { AssignmentRepository } from '@domain/repositories/assignment-repository';
import {
  generateMonthlyAssignments,
  adjustAssignment,
  deleteAssignments,
  getAssignmentsForMonth,
} from '@application/use-cases/generate-assignments';
import { getAssignmentCounts } from '@application/use-cases/get-assignment-counts';
import { MemberType } from '@domain/value-objects/member-type';
import {
  checkLanguageBalance,
  checkSameGender,
  checkSpouseSameGroup,
  checkMonthlyDuplicate,
  checkMinInterval,
} from '@domain/services/constraint-checker';
import { Language } from '@domain/value-objects/language';
import { GradeGroup } from '@domain/value-objects/grade-group';
import { getFiscalYear } from '@domain/value-objects/fiscal-year';
import { formatCsv } from '@domain/services/csv-formatter';
import { formatLineMessage } from '@domain/services/line-message-formatter';

export function createAssignmentController(
  memberRepo: MemberRepository,
  scheduleRepo: ScheduleRepository,
  assignmentRepo: AssignmentRepository,
): Router {
  const router = Router();

  router.get('/', (req: Request, res: Response) => {
    const year = parseInt(req.query.year as string);
    const month = parseInt(req.query.month as string);
    if (isNaN(year) || isNaN(month)) {
      res.status(400).json({ error: 'year and month are required' });
      return;
    }
    if (!isValidYear(year)) { res.status(400).json({ error: 'year must be between 2000 and 2100' }); return; }
    if (!isValidMonth(month)) { res.status(400).json({ error: 'month must be between 1 and 12' }); return; }
    res.json(getAssignmentsForMonth(year, month, memberRepo, scheduleRepo, assignmentRepo));
  });

  router.post('/generate', (req: Request, res: Response) => {
    const { year, month } = req.body;
    if (!year || !month) {
      res.status(400).json({ error: 'year and month are required' });
      return;
    }
    if (!isValidYear(year)) { res.status(400).json({ error: 'year must be between 2000 and 2100' }); return; }
    if (!isValidMonth(month)) { res.status(400).json({ error: 'month must be between 1 and 12' }); return; }
    const result = generateMonthlyAssignments(year, month, memberRepo, scheduleRepo, assignmentRepo);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result.value);
  });

  router.put('/:id/adjust', (req: Request, res: Response) => {
    const { oldMemberId, newMemberId } = req.body;
    const result = adjustAssignment(String(req.params.id), oldMemberId, newMemberId, assignmentRepo, memberRepo, scheduleRepo);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result.value);
  });

  router.delete('/', (req: Request, res: Response) => {
    const year = parseInt(req.query.year as string);
    const month = parseInt(req.query.month as string);
    if (isNaN(year) || isNaN(month)) {
      res.status(400).json({ error: 'year and month are required' });
      return;
    }
    if (!isValidYear(year)) { res.status(400).json({ error: 'year must be between 2000 and 2100' }); return; }
    if (!isValidMonth(month)) { res.status(400).json({ error: 'month must be between 1 and 12' }); return; }
    const now = new Date();
    if (year < now.getFullYear() || (year === now.getFullYear() && month <= now.getMonth() + 1)) {
      res.status(400).json({ error: 'Cannot clear current or past month assignments' });
      return;
    }
    deleteAssignments(year, month, scheduleRepo, assignmentRepo);
    res.json({ success: true });
  });

  router.delete('/by-date', (req: Request, res: Response) => {
    const date = req.query.date as string;
    if (!date) {
      res.status(400).json({ error: 'date is required' });
      return;
    }
    if (!isValidDateString(date)) { res.status(400).json({ error: 'Invalid date format' }); return; }
    const today = new Date().toISOString().slice(0, 10);
    if (date < today) {
      res.status(400).json({ error: 'Cannot clear past assignments' });
      return;
    }
    const schedule = scheduleRepo.findByDate(date);
    if (!schedule) {
      res.status(400).json({ error: 'Schedule not found for this date' });
      return;
    }
    assignmentRepo.deleteByScheduleId(schedule.id);
    res.json({ success: true });
  });

  router.get('/candidates', (req: Request, res: Response) => {
    const date = req.query.date as string;
    const excludeIds = ((req.query.excludeIds as string) || '').split(',').filter(Boolean);
    const partnerId = (req.query.partnerId as string) || '';
    const role = (req.query.role as string) || '';
    if (!date) {
      res.status(400).json({ error: 'date is required' });
      return;
    }
    if (!isValidDateString(date)) { res.status(400).json({ error: 'Invalid date format' }); return; }

    // Check schedule flags
    const schedule = scheduleRepo.findByDate(date);
    const isEventDay = schedule?.isEvent ?? false;
    const isSplitClass = schedule?.isSplitClass ?? false;

    const activeMembers = memberRepo.findAll(true);
    const partner = partnerId ? memberRepo.findById(partnerId as MemberId) : null;

    // Get fiscal year data for count/interval checks
    const fiscalYear = getFiscalYear(new Date(date));
    const allFiscalYearSchedules = scheduleRepo.findByFiscalYear(fiscalYear);
    const allScheduleIds = allFiscalYearSchedules.map((s) => s.id);
    const allAssignments = assignmentRepo.findByScheduleIds(allScheduleIds);

    // Monthly assignments (excluding current assignment)
    const scheduleMonth = new Date(date).getMonth() + 1;
    const scheduleYear = new Date(date).getFullYear();
    const monthSchedules = scheduleRepo.findByMonth(scheduleYear, scheduleMonth);
    const monthScheduleIds = monthSchedules.map((s) => s.id);
    const monthAssignments = assignmentRepo.findByScheduleIds(monthScheduleIds);

    // Schedule date map for interval check
    const scheduleDateMap = new Map<string, string>();
    for (const s of allFiscalYearSchedules) {
      scheduleDateMap.set(s.id, s.date);
    }

    // Count map for fiscal year
    const countMap = assignmentRepo.countAllByFiscalYear(fiscalYear);
    const activeCounts = activeMembers.map((m) => countMap.get(m.id) ?? 0);
    const avgCount = activeCounts.length > 0
      ? activeCounts.reduce((a, b) => a + b, 0) / activeCounts.length
      : 0;

    const candidates = activeMembers
      .filter((m) => !excludeIds.includes(m.id))
      .filter((m) => m.isAvailableOn(date))
      .filter((m) => !isEventDay || m.memberType !== MemberType.HELPER)
      .filter((m) => {
        if (!role || (role !== GradeGroup.UPPER && role !== GradeGroup.LOWER)) return true;
        if (m.gradeGroup === role) return true;
        if (isSplitClass && m.language === Language.BOTH) return true;
        return false;
      })
      .map((m) => {
        const warnings: string[] = [];

        // Check pair constraints with partner
        if (partner) {
          if (checkLanguageBalance(m, partner)) warnings.push('language');
          if (checkSameGender(m, partner)) warnings.push('sameGender');
          if (checkSpouseSameGroup(m, partner)) warnings.push('spouse');
        }

        // Monthly duplicate
        if (checkMonthlyDuplicate(m.id, monthAssignments)) warnings.push('monthlyDuplicate');

        // Min interval
        if (checkMinInterval(m.id, date, allAssignments, scheduleDateMap)) warnings.push('minInterval');

        // Class language coverage on split-class days
        // Approximate: we don't have full day assignment context here, so warn all
        // non-BOTH candidates. In practice, replacing with a non-BOTH member may
        // bring the total BOTH count below the required 2.
        if (isSplitClass && m.language !== Language.BOTH) {
          warnings.push('classLanguageCoverage');
        }

        // Excessive count
        const count = countMap.get(m.id) ?? 0;
        if (avgCount > 0 && count > avgCount) warnings.push('excessiveCount');

        // Grade group mismatch
        const isCrossover = role ? m.gradeGroup !== role : false;
        if (isCrossover) warnings.push('gradeGroupMismatch');

        return {
          id: m.id,
          name: m.name,
          count,
          warnings,
          recommended: warnings.length === 0,
          gradeGroup: m.gradeGroup,
          isCrossover,
        };
      });

    // Sort: recommended first, then by count ascending
    candidates.sort((a, b) => {
      if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
      if (a.warnings.length !== b.warnings.length) return a.warnings.length - b.warnings.length;
      return a.count - b.count;
    });

    res.json(candidates);
  });

  router.get('/counts', (req: Request, res: Response) => {
    const fiscalYear = parseInt(req.query.fiscalYear as string);
    if (isNaN(fiscalYear)) {
      res.status(400).json({ error: 'fiscalYear is required' });
      return;
    }
    if (!isValidYear(fiscalYear)) { res.status(400).json({ error: 'fiscalYear must be between 2000 and 2100' }); return; }
    res.json(getAssignmentCounts(fiscalYear, memberRepo, assignmentRepo));
  });

  router.get('/export/csv', (req: Request, res: Response) => {
    const year = parseInt(req.query.year as string);
    const month = parseInt(req.query.month as string);
    const lang = (req.query.lang as string) === 'en' ? 'en' : 'ja';
    if (isNaN(year) || isNaN(month)) {
      res.status(400).json({ error: 'year and month are required' });
      return;
    }
    if (!isValidYear(year)) { res.status(400).json({ error: 'year must be between 2000 and 2100' }); return; }
    if (!isValidMonth(month)) { res.status(400).json({ error: 'month must be between 1 and 12' }); return; }

    const schedules = scheduleRepo.findByMonth(year, month);
    const scheduleIds = schedules.map((s) => s.id);
    const assignments = assignmentRepo.findByScheduleIds(scheduleIds);
    const members = memberRepo.findAll(false);
    const memberMap = new Map<MemberId, Member>();
    for (const m of members) memberMap.set(m.id, m);

    const csv = formatCsv(assignments, schedules, memberMap, lang);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=schedule-${year}-${month}.csv`);
    res.send(csv);
  });

  router.get('/export/line', (req: Request, res: Response) => {
    const year = parseInt(req.query.year as string);
    const month = parseInt(req.query.month as string);
    const lang = (req.query.lang as string) === 'en' ? 'en' : 'ja';
    if (isNaN(year) || isNaN(month)) {
      res.status(400).json({ error: 'year and month are required' });
      return;
    }
    if (!isValidYear(year)) { res.status(400).json({ error: 'year must be between 2000 and 2100' }); return; }
    if (!isValidMonth(month)) { res.status(400).json({ error: 'month must be between 1 and 12' }); return; }

    const schedules = scheduleRepo.findByMonth(year, month);
    const scheduleIds = schedules.map((s) => s.id);
    const assignments = assignmentRepo.findByScheduleIds(scheduleIds);
    const members = memberRepo.findAll(false);
    const memberMap = new Map<MemberId, Member>();
    for (const m of members) memberMap.set(m.id, m);

    const text = formatLineMessage(assignments, schedules, memberMap, year, month, lang);
    res.json({ text });
  });

  return router;
}
