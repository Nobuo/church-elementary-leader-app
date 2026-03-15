import Database from 'better-sqlite3';
import { ScheduleId, asScheduleId } from '@shared/types';
import { Schedule } from '@domain/entities/schedule';
import { ScheduleRepository } from '@domain/repositories/schedule-repository';

interface ScheduleRow {
  id: string;
  date: string;
  is_excluded: number;
  is_event: number;
  is_split_class: number;
  year: number;
}

function rowToSchedule(row: ScheduleRow): Schedule {
  return Schedule.reconstruct({
    id: asScheduleId(row.id),
    date: row.date,
    isExcluded: row.is_excluded === 1,
    isEvent: row.is_event === 1,
    isSplitClass: row.is_split_class === 1,
    year: row.year,
  });
}

export class SqliteScheduleRepository implements ScheduleRepository {
  constructor(private db: Database.Database) {}

  save(schedule: Schedule): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO schedules (id, date, is_excluded, is_event, is_split_class, year)
       VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(schedule.id, schedule.date, schedule.isExcluded ? 1 : 0, schedule.isEvent ? 1 : 0, schedule.isSplitClass ? 1 : 0, schedule.year);
  }

  findById(id: ScheduleId): Schedule | null {
    const row = this.db.prepare('SELECT * FROM schedules WHERE id = ?').get(id) as
      | ScheduleRow
      | undefined;
    return row ? rowToSchedule(row) : null;
  }

  findByDate(date: string): Schedule | null {
    const row = this.db.prepare('SELECT * FROM schedules WHERE date = ?').get(date) as
      | ScheduleRow
      | undefined;
    return row ? rowToSchedule(row) : null;
  }

  findByMonth(year: number, month: number): Schedule[] {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const rows = this.db
      .prepare('SELECT * FROM schedules WHERE date LIKE ? ORDER BY date')
      .all(`${prefix}%`) as ScheduleRow[];
    return rows.map(rowToSchedule);
  }

  findByFiscalYear(fiscalYear: number): Schedule[] {
    const rows = this.db
      .prepare('SELECT * FROM schedules WHERE year = ? ORDER BY date')
      .all(fiscalYear) as ScheduleRow[];
    return rows.map(rowToSchedule);
  }
}
