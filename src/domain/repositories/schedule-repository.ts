import { ScheduleId } from '@shared/types';
import { Schedule } from '@domain/entities/schedule';

export interface ScheduleRepository {
  save(schedule: Schedule): void;
  findById(id: ScheduleId): Schedule | null;
  findByDate(date: string): Schedule | null;
  findByMonth(year: number, month: number): Schedule[];
  findByFiscalYear(fiscalYear: number): Schedule[];
}
