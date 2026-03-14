import { Router, Request, Response } from 'express';
import { ScheduleRepository } from '@domain/repositories/schedule-repository';
import {
  generateMonthlySchedule,
  toggleExclusion,
  toggleEvent,
  listSchedules,
} from '@application/use-cases/generate-monthly-schedule';

export function createScheduleController(scheduleRepo: ScheduleRepository): Router {
  const router = Router();

  router.get('/', (req: Request, res: Response) => {
    const year = parseInt(req.query.year as string);
    const month = parseInt(req.query.month as string);
    if (isNaN(year) || isNaN(month)) {
      res.status(400).json({ error: 'year and month are required' });
      return;
    }
    res.json(listSchedules(year, month, scheduleRepo));
  });

  router.post('/generate', (req: Request, res: Response) => {
    const { year, month } = req.body;
    if (!year || !month) {
      res.status(400).json({ error: 'year and month are required' });
      return;
    }
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

  return router;
}
