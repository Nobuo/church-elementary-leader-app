import { Result, ok } from '@shared/result';
import { asScheduleId } from '@shared/types';
import { Schedule, getSundaysInMonth } from '@domain/entities/schedule';
import { ScheduleRepository } from '@domain/repositories/schedule-repository';

export interface ScheduleDto {
  id: string;
  date: string;
  isExcluded: boolean;
  isEvent: boolean;
  isSplitClass: boolean;
  year: number;
}

function toScheduleDto(s: Schedule): ScheduleDto {
  return { id: s.id, date: s.date, isExcluded: s.isExcluded, isEvent: s.isEvent, isSplitClass: s.isSplitClass, year: s.year };
}

export function generateMonthlySchedule(
  year: number,
  month: number,
  scheduleRepo: ScheduleRepository,
): Result<ScheduleDto[]> {
  const sundays = getSundaysInMonth(year, month);
  const results: ScheduleDto[] = [];

  for (const dateStr of sundays) {
    const existing = scheduleRepo.findByDate(dateStr);
    if (existing) {
      results.push(toScheduleDto(existing));
      continue;
    }

    const result = Schedule.create(dateStr);
    if (!result.ok) continue;

    scheduleRepo.save(result.value);
    results.push(toScheduleDto(result.value));
  }

  return ok(results);
}

export function toggleExclusion(
  scheduleId: string,
  scheduleRepo: ScheduleRepository,
): Result<ScheduleDto> {
  const schedule = scheduleRepo.findById(asScheduleId(scheduleId));
  if (!schedule) return { ok: false, error: 'Schedule not found' };

  const toggled = schedule.toggleExclusion();
  scheduleRepo.save(toggled);
  return ok(toScheduleDto(toggled));
}

export function toggleEvent(
  scheduleId: string,
  scheduleRepo: ScheduleRepository,
): Result<ScheduleDto> {
  const schedule = scheduleRepo.findById(asScheduleId(scheduleId));
  if (!schedule) return { ok: false, error: 'Schedule not found' };

  const toggled = schedule.toggleEvent();
  scheduleRepo.save(toggled);
  return ok(toScheduleDto(toggled));
}

export function toggleSplitClass(
  scheduleId: string,
  scheduleRepo: ScheduleRepository,
): Result<ScheduleDto> {
  const schedule = scheduleRepo.findById(asScheduleId(scheduleId));
  if (!schedule) return { ok: false, error: 'Schedule not found' };

  const toggled = schedule.toggleSplitClass();
  scheduleRepo.save(toggled);
  return ok(toScheduleDto(toggled));
}

export function listSchedules(
  year: number,
  month: number,
  scheduleRepo: ScheduleRepository,
): ScheduleDto[] {
  return scheduleRepo.findByMonth(year, month).map(toScheduleDto);
}
