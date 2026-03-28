import type { AppDatabase } from './app-database.js';
import { AssignmentId, ScheduleId, MemberId, asAssignmentId, asScheduleId, asMemberId } from '@shared/types';
import { Assignment } from '@domain/entities/assignment';
import { AssignmentRepository } from '@domain/repositories/assignment-repository';

interface AssignmentRow {
  id: string;
  schedule_id: string;
  group_number: number;
  member_id_1: string;
  member_id_2: string;
  member_id_3: string | null;
}

function rowToAssignment(row: AssignmentRow): Assignment {
  const memberIds: MemberId[] = [asMemberId(row.member_id_1), asMemberId(row.member_id_2)];
  if (row.member_id_3) {
    memberIds.push(asMemberId(row.member_id_3));
  }
  return Assignment.reconstruct({
    id: asAssignmentId(row.id),
    scheduleId: asScheduleId(row.schedule_id),
    groupNumber: row.group_number as 1 | 2,
    memberIds,
  });
}

export class SqliteAssignmentRepository implements AssignmentRepository {
  constructor(private db: AppDatabase) {}

  save(assignment: Assignment): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO assignments (id, schedule_id, group_number, member_id_1, member_id_2, member_id_3)
       VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        assignment.id,
        assignment.scheduleId,
        assignment.groupNumber,
        assignment.memberIds[0],
        assignment.memberIds[1],
        assignment.memberIds[2] ?? null,
      );
  }

  findById(id: AssignmentId): Assignment | null {
    const row = this.db.prepare('SELECT * FROM assignments WHERE id = ?').get(id) as
      | AssignmentRow
      | undefined;
    return row ? rowToAssignment(row) : null;
  }

  findByScheduleId(scheduleId: ScheduleId): Assignment[] {
    const rows = this.db
      .prepare('SELECT * FROM assignments WHERE schedule_id = ? ORDER BY group_number')
      .all(scheduleId) as AssignmentRow[];
    return rows.map(rowToAssignment);
  }

  findByScheduleIds(scheduleIds: ScheduleId[]): Assignment[] {
    if (scheduleIds.length === 0) return [];
    const placeholders = scheduleIds.map(() => '?').join(',');
    const rows = this.db
      .prepare(
        `SELECT * FROM assignments WHERE schedule_id IN (${placeholders}) ORDER BY schedule_id, group_number`,
      )
      .all(...scheduleIds) as AssignmentRow[];
    return rows.map(rowToAssignment);
  }

  findByMemberAndFiscalYear(memberId: MemberId, fiscalYear: number): Assignment[] {
    const rows = this.db
      .prepare(
        `SELECT a.* FROM assignments a
       JOIN schedules s ON a.schedule_id = s.id
       WHERE (a.member_id_1 = ? OR a.member_id_2 = ? OR a.member_id_3 = ?) AND s.year = ?
       ORDER BY s.date`,
      )
      .all(memberId, memberId, memberId, fiscalYear) as AssignmentRow[];
    return rows.map(rowToAssignment);
  }

  countByMember(memberId: MemberId, fiscalYear: number): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM assignments a
       JOIN schedules s ON a.schedule_id = s.id
       WHERE (a.member_id_1 = ? OR a.member_id_2 = ? OR a.member_id_3 = ?) AND s.year = ?`,
      )
      .get(memberId, memberId, memberId, fiscalYear) as { count: number };
    return row.count;
  }

  countAllByFiscalYear(fiscalYear: number): Map<MemberId, number> {
    const rows = this.db
      .prepare(
        `SELECT member_id, COUNT(*) as count FROM (
          SELECT a.member_id_1 as member_id FROM assignments a
          JOIN schedules s ON a.schedule_id = s.id WHERE s.year = ?
          UNION ALL
          SELECT a.member_id_2 as member_id FROM assignments a
          JOIN schedules s ON a.schedule_id = s.id WHERE s.year = ?
          UNION ALL
          SELECT a.member_id_3 as member_id FROM assignments a
          JOIN schedules s ON a.schedule_id = s.id WHERE s.year = ? AND a.member_id_3 IS NOT NULL
        ) GROUP BY member_id`,
      )
      .all(fiscalYear, fiscalYear, fiscalYear) as { member_id: string; count: number }[];
    const map = new Map<MemberId, number>();
    for (const row of rows) {
      map.set(asMemberId(row.member_id), row.count);
    }
    return map;
  }

  deleteByScheduleId(scheduleId: ScheduleId): void {
    this.db.prepare('DELETE FROM assignments WHERE schedule_id = ?').run(scheduleId);
  }

  deleteByScheduleIds(scheduleIds: ScheduleId[]): void {
    if (scheduleIds.length === 0) return;
    const placeholders = scheduleIds.map(() => '?').join(',');
    this.db
      .prepare(`DELETE FROM assignments WHERE schedule_id IN (${placeholders})`)
      .run(...scheduleIds);
  }
}
