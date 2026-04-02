import { Router, Request, Response } from 'express';
import { ScheduleRepository } from '@domain/repositories/schedule-repository';
import {
  generateMonthlySchedule,
  toggleExclusion,
  toggleEvent,
  toggleEbt,
  toggleSplitClass,
  updateSplitType,
  setEventName,
  listSchedules,
} from '@application/use-cases/generate-monthly-schedule';
import { isValidYear, isValidMonth } from '@shared/validators';

export function createScheduleController(scheduleRepo: ScheduleRepository): Router {
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
    res.json(listSchedules(year, month, scheduleRepo));
  });

  router.post('/generate', (req: Request, res: Response) => {
    const { year, month } = req.body;
    if (!year || !month) {
      res.status(400).json({ error: 'year and month are required' });
      return;
    }
    if (!isValidYear(year)) { res.status(400).json({ error: 'year must be between 2000 and 2100' }); return; }
    if (!isValidMonth(month)) { res.status(400).json({ error: 'month must be between 1 and 12' }); return; }
    const result = generateMonthlySchedule(year, month, scheduleRepo);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result.value);
  });

  router.post('/:id/toggle-exclusion', (req: Request, res: Response) => {
    const result = toggleExclusion(String(req.params.id), scheduleRepo);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result.value);
  });

  router.post('/:id/toggle-event', (req: Request, res: Response) => {
    const result = toggleEvent(String(req.params.id), scheduleRepo);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result.value);
  });

  router.post('/:id/toggle-ebt', (req: Request, res: Response) => {
    const result = toggleEbt(String(req.params.id), scheduleRepo);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result.value);
  });

  router.post('/:id/toggle-split-class', (req: Request, res: Response) => {
    const result = toggleSplitClass(String(req.params.id), scheduleRepo);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result.value);
  });

  router.put('/:id/event-name', (req: Request, res: Response) => {
    const nameJa = req.body.eventNameJa;
    const nameEn = req.body.eventNameEn;
    const normalizedJa = typeof nameJa === 'string' && nameJa.trim() !== '' ? nameJa.trim() : null;
    const normalizedEn = typeof nameEn === 'string' && nameEn.trim() !== '' ? nameEn.trim() : null;

    const result = setEventName(String(req.params.id), normalizedJa, normalizedEn, scheduleRepo);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result.value);
  });

  router.post('/:id/split-type', (req: Request, res: Response) => {
    const { splitType } = req.body;
    if (splitType !== 'standard' && splitType !== 'senior_discussion') {
      res.status(400).json({ error: 'splitType must be "standard" or "senior_discussion"' });
      return;
    }
    const result = updateSplitType(String(req.params.id), splitType, scheduleRepo);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result.value);
  });

  return router;
}
