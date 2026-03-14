import { AssignmentId, ScheduleId, MemberId } from '@shared/types';
import { Assignment } from '@domain/entities/assignment';

export interface AssignmentRepository {
  save(assignment: Assignment): void;
  findById(id: AssignmentId): Assignment | null;
  findByScheduleId(scheduleId: ScheduleId): Assignment[];
  findByScheduleIds(scheduleIds: ScheduleId[]): Assignment[];
  findByMemberAndFiscalYear(memberId: MemberId, fiscalYear: number): Assignment[];
  countByMember(memberId: MemberId, fiscalYear: number): number;
  countAllByFiscalYear(fiscalYear: number): Map<MemberId, number>;
  deleteByScheduleId(scheduleId: ScheduleId): void;
  deleteByScheduleIds(scheduleIds: ScheduleId[]): void;
}
