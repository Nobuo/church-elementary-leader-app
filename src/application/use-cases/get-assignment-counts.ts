import { MemberRepository } from '@domain/repositories/member-repository';
import { AssignmentRepository } from '@domain/repositories/assignment-repository';
import { ScheduleRepository } from '@domain/repositories/schedule-repository';

export interface AssignmentCountDto {
  id: string;
  name: string;
  count: number;
  assignedDates?: { date: string; groupNumber: number }[];
}

export interface AssignmentCountSummary {
  max: { count: number; memberName: string };
  min: { count: number; memberName: string };
  average: number;
}

export interface AssignmentCountsResult {
  fiscalYear: number;
  summary: AssignmentCountSummary;
  members: AssignmentCountDto[];
  unassignedWeeks: number;
}

export function getAssignmentCounts(
  fiscalYear: number,
  memberRepo: MemberRepository,
  assignmentRepo: AssignmentRepository,
  scheduleRepo?: ScheduleRepository,
): AssignmentCountsResult {
  const members = memberRepo.findAll(false);
  const countMap = assignmentRepo.countAllByFiscalYear(fiscalYear);

  // Gather specific assignment dates for each member
  let unassignedWeeks = 0;
  const memberDatesMap = new Map<string, { date: string; groupNumber: number }[]>();

  if (scheduleRepo) {
    const allSchedules = scheduleRepo.findByFiscalYear(fiscalYear);
    const activeSchedules = allSchedules.filter((s) => !s.isExcluded);
    const activeScheduleIds = activeSchedules.map((s) => s.id);
    const allAssignments = assignmentRepo.findByScheduleIds(activeScheduleIds);

    const scheduleDateMap = new Map<string, string>();
    for (const s of activeSchedules) {
      scheduleDateMap.set(s.id, s.date);
    }

    for (const a of allAssignments) {
      const date = scheduleDateMap.get(a.scheduleId);
      if (!date) continue;
      for (const mid of a.memberIds) {
        if (!memberDatesMap.has(mid)) {
          memberDatesMap.set(mid, []);
        }
        memberDatesMap.get(mid)!.push({ date, groupNumber: a.groupNumber });
      }
    }

    const assignedScheduleIds = new Set(allAssignments.map((a) => a.scheduleId));
    unassignedWeeks = activeSchedules.filter(
      (s) => !assignedScheduleIds.has(s.id),
    ).length;
  }

  const memberCounts: AssignmentCountDto[] = members
    .filter((m) => m.isActive || (countMap.get(m.id) ?? 0) > 0)
    .map((m) => {
      const assignedDates = memberDatesMap.get(m.id) ?? [];
      assignedDates.sort((a, b) => a.date.localeCompare(b.date));
      return {
        id: m.id,
        name: m.name,
        count: countMap.get(m.id) ?? 0,
        assignedDates,
      };
    })
    .sort((a, b) => b.count - a.count);

  if (memberCounts.length === 0) {
    return {
      fiscalYear,
      summary: {
        max: { count: 0, memberName: '' },
        min: { count: 0, memberName: '' },
        average: 0,
      },
      members: [],
      unassignedWeeks,
    };
  }

  const maxMember = memberCounts[0];
  const minMember = memberCounts[memberCounts.length - 1];
  const totalCount = memberCounts.reduce((sum, m) => sum + m.count, 0);

  return {
    fiscalYear,
    summary: {
      max: { count: maxMember.count, memberName: maxMember.name },
      min: { count: minMember.count, memberName: minMember.name },
      average: Math.round((totalCount / memberCounts.length) * 10) / 10,
    },
    members: memberCounts,
    unassignedWeeks,
  };
}
