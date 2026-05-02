import { Result, ok } from '@shared/result';
import { asScheduleId } from '@shared/types';
import { Schedule, getSundaysInMonth, SplitType } from '@domain/entities/schedule';
import { ScheduleRepository } from '@domain/repositories/schedule-repository';

export interface ScheduleDto {
  id: string;
  date: string;
  isExcluded: boolean;
  isEvent: boolean;
  isEbt: boolean;
  isSplitClass: boolean;
  splitType: SplitType | null;
  eventNameJa: string | null;
  eventNameEn: string | null;
  year: number;
}

function toScheduleDto(s: Schedule): ScheduleDto {
  return { id: s.id, date: s.date, isExcluded: s.isExcluded, isEvent: s.isEvent, isEbt: s.isEbt, isSplitClass: s.isSplitClass, splitType: s.splitType, eventNameJa: s.eventNameJa, eventNameEn: s.eventNameEn, year: s.year };
}

interface GenerateScheduleBatchResult {
  schedules: ScheduleDto[];
  createdCount: number;
  existingCount: number;
}

export interface GenerateFiscalYearScheduleDto extends GenerateScheduleBatchResult {}

function generateScheduleBatch(
  dates: string[],
  scheduleRepo: ScheduleRepository,
): GenerateScheduleBatchResult {
  const schedules: ScheduleDto[] = [];
  let createdCount = 0;
  let existingCount = 0;

  for (const dateStr of dates) {
    const existing = scheduleRepo.findByDate(dateStr);
    if (existing) {
      existingCount += 1;
      schedules.push(toScheduleDto(existing));
      continue;
    }

    const result = Schedule.create(dateStr);
    if (!result.ok) continue;

    scheduleRepo.save(result.value);
    createdCount += 1;
    schedules.push(toScheduleDto(result.value));
  }

  return { schedules, createdCount, existingCount };
}

export function generateMonthlySchedule(
  year: number,
  month: number,
  scheduleRepo: ScheduleRepository,
): Result<ScheduleDto[]> {
  const sundays = getSundaysInMonth(year, month);
  return ok(generateScheduleBatch(sundays, scheduleRepo).schedules);
}

export function generateFiscalYearSchedule(
  fiscalYear: number,
  scheduleRepo: ScheduleRepository,
): Result<GenerateFiscalYearScheduleDto> {
  const fiscalMonths = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
  const schedules: ScheduleDto[] = [];
  let createdCount = 0;
  let existingCount = 0;

  for (const month of fiscalMonths) {
    const calendarYear = month <= 3 ? fiscalYear + 1 : fiscalYear;
    const batch = generateScheduleBatch(getSundaysInMonth(calendarYear, month), scheduleRepo);
    schedules.push(...batch.schedules);
    createdCount += batch.createdCount;
    existingCount += batch.existingCount;
  }

  return ok({ schedules, createdCount, existingCount });
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

export function toggleEbt(
  scheduleId: string,
  scheduleRepo: ScheduleRepository,
): Result<ScheduleDto> {
  const schedule = scheduleRepo.findById(asScheduleId(scheduleId));
  if (!schedule) return { ok: false, error: 'Schedule not found' };

  const toggled = schedule.toggleEbt();
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

export function updateSplitType(
  scheduleId: string,
  splitType: SplitType,
  scheduleRepo: ScheduleRepository,
): Result<ScheduleDto> {
  const schedule = scheduleRepo.findById(asScheduleId(scheduleId));
  if (!schedule) return { ok: false, error: 'Schedule not found' };
  if (!schedule.isSplitClass) return { ok: false, error: 'Schedule is not a split class day' };

  const updated = schedule.setSplitType(splitType);
  scheduleRepo.save(updated);
  return ok(toScheduleDto(updated));
}

export function setEventName(
  scheduleId: string,
  eventNameJa: string | null,
  eventNameEn: string | null,
  scheduleRepo: ScheduleRepository,
): Result<ScheduleDto> {
  const schedule = scheduleRepo.findById(asScheduleId(scheduleId));
  if (!schedule) return { ok: false, error: 'Schedule not found' };

  const MAX_LENGTH = 100;
  if (eventNameJa && eventNameJa.length > MAX_LENGTH) {
    return { ok: false, error: 'eventNameJa must be 100 characters or less' };
  }
  if (eventNameEn && eventNameEn.length > MAX_LENGTH) {
    return { ok: false, error: 'eventNameEn must be 100 characters or less' };
  }

  const updated = schedule.setEventName(eventNameJa, eventNameEn);
  scheduleRepo.save(updated);
  return ok(toScheduleDto(updated));
}

export function listSchedules(
  year: number,
  month: number,
  scheduleRepo: ScheduleRepository,
): ScheduleDto[] {
  return scheduleRepo.findByMonth(year, month).map(toScheduleDto);
}

export function listFiscalYearSchedules(
  fiscalYear: number,
  scheduleRepo: ScheduleRepository,
): ScheduleDto[] {
  return scheduleRepo.findByFiscalYear(fiscalYear).map(toScheduleDto);
}
