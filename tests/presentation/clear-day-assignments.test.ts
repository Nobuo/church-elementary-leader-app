import { describe, it, expect, vi } from 'vitest';
import { Schedule } from '@domain/entities/schedule';
import { ScheduleId } from '@shared/types';

describe('clear day assignments logic', () => {
  /**
   * Extracted controller logic for testability:
   * - date < today → error
   * - schedule not found → error
   * - otherwise → delete assignments
   */
  function clearDayAssignments(
    date: string,
    today: string,
    findByDate: (d: string) => Schedule | null,
    deleteByScheduleId: (id: ScheduleId) => void,
  ): { success: boolean } | { error: string; status: number } {
    if (date < today) {
      return { error: 'Cannot clear past assignments', status: 400 };
    }
    const schedule = findByDate(date);
    if (!schedule) {
      return { error: 'Schedule not found for this date', status: 400 };
    }
    deleteByScheduleId(schedule.id);
    return { success: true };
  }

  it('rejects clearing past assignments', () => {
    const result = clearDayAssignments(
      '2026-03-10',
      '2026-03-15',
      () => null,
      () => {},
    );
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('past');
  });

  it('allows clearing today assignments', () => {
    const scheduleResult = Schedule.create('2026-03-15');
    if (!scheduleResult.ok) throw new Error('bad schedule');
    const schedule = scheduleResult.value;

    const deleteFn = vi.fn();
    const result = clearDayAssignments(
      '2026-03-15',
      '2026-03-15',
      () => schedule,
      deleteFn,
    );
    expect(result).toEqual({ success: true });
    expect(deleteFn).toHaveBeenCalledWith(schedule.id);
  });

  it('allows clearing future assignments', () => {
    const scheduleResult = Schedule.create('2026-03-22');
    if (!scheduleResult.ok) throw new Error('bad schedule');
    const schedule = scheduleResult.value;

    const deleteFn = vi.fn();
    const result = clearDayAssignments(
      '2026-03-22',
      '2026-03-15',
      () => schedule,
      deleteFn,
    );
    expect(result).toEqual({ success: true });
    expect(deleteFn).toHaveBeenCalledWith(schedule.id);
  });

  it('returns error when schedule not found', () => {
    const result = clearDayAssignments(
      '2026-03-22',
      '2026-03-15',
      () => null,
      () => {},
    );
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('Schedule not found');
  });
});
