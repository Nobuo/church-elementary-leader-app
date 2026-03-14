import { MemberRepository } from '@domain/repositories/member-repository';
import { AssignmentRepository } from '@domain/repositories/assignment-repository';

export interface AssignmentCountDto {
  id: string;
  name: string;
  count: number;
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
}

export function getAssignmentCounts(
  fiscalYear: number,
  memberRepo: MemberRepository,
  assignmentRepo: AssignmentRepository,
): AssignmentCountsResult {
  const members = memberRepo.findAll(false);
  const countMap = assignmentRepo.countAllByFiscalYear(fiscalYear);

  const memberCounts: AssignmentCountDto[] = members
    .filter((m) => m.isActive || (countMap.get(m.id) ?? 0) > 0)
    .map((m) => ({
      id: m.id,
      name: m.name,
      count: countMap.get(m.id) ?? 0,
    }))
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
  };
}
