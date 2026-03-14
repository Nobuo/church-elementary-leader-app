import { ScheduleId, createScheduleId } from '@shared/types';
import { Result, ok, err } from '@shared/result';
import { getFiscalYear } from '@domain/value-objects/fiscal-year';

export interface ScheduleProps {
  readonly id: ScheduleId;
  readonly date: string; // ISO date string (YYYY-MM-DD)
  readonly isExcluded: boolean;
  readonly isEvent: boolean;
  readonly year: number; // fiscal year
}

export class Schedule {
  readonly id: ScheduleId;
  readonly date: string;
  readonly isExcluded: boolean;
  readonly isEvent: boolean;
  readonly year: number;

  private constructor(props: ScheduleProps) {
    this.id = props.id;
    this.date = props.date;
    this.isExcluded = props.isExcluded;
    this.isEvent = props.isEvent;
    this.year = props.year;
  }

  static create(date: string): Result<Schedule> {
    const d = new Date(date);
    if (d.getDay() !== 0) {
      return err('Schedule date must be a Sunday');
    }

    return ok(
      new Schedule({
        id: createScheduleId(),
        date,
        isExcluded: false,
        isEvent: false,
        year: getFiscalYear(d),
      }),
    );
  }

  static reconstruct(props: ScheduleProps): Schedule {
    return new Schedule(props);
  }

  toggleExclusion(): Schedule {
    return new Schedule({
      ...this,
      isExcluded: !this.isExcluded,
    });
  }

  setExcluded(excluded: boolean): Schedule {
    return new Schedule({
      ...this,
      isExcluded: excluded,
    });
  }

  toggleEvent(): Schedule {
    return new Schedule({
      ...this,
      isEvent: !this.isEvent,
    });
  }
}

export function getSundaysInMonth(year: number, month: number): string[] {
  const sundays: string[] = [];
  const date = new Date(year, month - 1, 1);

  while (date.getMonth() === month - 1) {
    if (date.getDay() === 0) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      sundays.push(`${y}-${m}-${d}`);
    }
    date.setDate(date.getDate() + 1);
  }

  return sundays;
}
