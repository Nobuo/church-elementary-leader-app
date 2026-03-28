import { Result, ok, err } from '@shared/result';
import { MemberId, ScheduleId, asMemberId, asAssignmentId } from '@shared/types';
import { Member } from '@domain/entities/member';
import { MemberRepository } from '@domain/repositories/member-repository';
import { ScheduleRepository } from '@domain/repositories/schedule-repository';
import { AssignmentRepository } from '@domain/repositories/assignment-repository';
import { generateAssignments as generateAlgorithm } from '@domain/services/assignment-generator';
import {
  checkExcessiveCount,
  checkLanguageBalanceGroup,
  checkSameGender,
  checkSpouseSameGroupMulti,
  checkMonthlyDuplicate,
  checkMinInterval,
  checkClassLanguageCoverage,
} from '@domain/services/constraint-checker';
import { MemberType } from '@domain/value-objects/member-type';
import { GradeGroup } from '@domain/value-objects/grade-group';
import { Schedule } from '@domain/entities/schedule';
import { getFiscalYear } from '@domain/value-objects/fiscal-year';
import {
  ConstraintViolation,
  ViolationType,
  Severity,
} from '@domain/value-objects/constraint-violation';

export interface AssignmentMemberDto {
  id: string;
  name: string;
  gradeGroup: string;
}

export interface AssignmentDto {
  id: string;
  scheduleId: string;
  date: string;
  groupNumber: number;
  gradeGroup: string;
  members: AssignmentMemberDto[];
}

export interface GenerateAssignmentsResult {
  assignments: AssignmentDto[];
  violations: ConstraintViolation[];
  message?: string;
}

/** Combined day = 3 slots, split day = 4 slots */
function slotsForSchedule(schedule: Schedule): number {
  return schedule.isSplitClass ? 4 : 3;
}

function assignmentGradeGroup(memberCount: number, groupNumber: number): string {
  if (memberCount === 3) return 'MIXED';
  return groupNumber === 1 ? GradeGroup.UPPER : GradeGroup.LOWER;
}

export function generateMonthlyAssignments(
  year: number,
  month: number,
  memberRepo: MemberRepository,
  scheduleRepo: ScheduleRepository,
  assignmentRepo: AssignmentRepository,
): Result<GenerateAssignmentsResult> {
  const schedules = scheduleRepo.findByMonth(year, month);
  if (schedules.length === 0) {
    return err('No schedules found for this month. Generate schedules first.');
  }

  const members = memberRepo.findAll(true);
  if (members.length < 3) {
    return err('Not enough active members (need at least 3)');
  }

  const allScheduleIds = schedules.map((s) => s.id);

  // Incremental mode: find unassigned schedules only
  const existingMonthAssignments = assignmentRepo.findByScheduleIds(allScheduleIds);
  const assignedScheduleIds = new Set(existingMonthAssignments.map((a) => a.scheduleId));
  const unassignedSchedules = schedules.filter(
    (s) => !s.isExcluded && !assignedScheduleIds.has(s.id),
  );

  // If all schedules already have assignments, do nothing
  if (unassignedSchedules.length === 0) {
    return ok({ assignments: [], violations: [], message: 'allWeeksAssigned' });
  }

  const fiscalYear = getFiscalYear(new Date(year, month - 1, 1));

  // Get all existing assignments for count calculation
  const allFiscalYearSchedules = scheduleRepo.findByFiscalYear(fiscalYear);
  const otherScheduleIds = allFiscalYearSchedules
    .filter((s) => !allScheduleIds.includes(s.id))
    .map((s) => s.id);
  const otherMonthAssignments = assignmentRepo.findByScheduleIds(otherScheduleIds);

  // Include both other-month assignments and this-month confirmed assignments
  const existingAssignmentsAll = [...otherMonthAssignments, ...existingMonthAssignments];

  // Build count map from all existing assignments
  const countMap = new Map<MemberId, number>();
  for (const m of members) {
    countMap.set(m.id, 0);
  }
  for (const a of existingAssignmentsAll) {
    for (const mid of a.memberIds) {
      countMap.set(mid, (countMap.get(mid) ?? 0) + 1);
    }
  }

  // Generate only for unassigned schedules
  const { assignments, violations } = generateAlgorithm(
    unassignedSchedules,
    members,
    existingAssignmentsAll,
    countMap,
  );

  // Check excessive counts after generation
  const updatedCountMap = new Map(countMap);
  for (const a of assignments) {
    for (const mid of a.memberIds) {
      updatedCountMap.set(mid, (updatedCountMap.get(mid) ?? 0) + 1);
    }
  }

  // Build schedule lookup for slot calculation
  const scheduleMap = new Map<ScheduleId, Schedule>();
  for (const s of allFiscalYearSchedules) {
    scheduleMap.set(s.id, s);
  }

  const otherScheduleIdsWithAssignments = new Set(
    existingAssignmentsAll.map((a) => a.scheduleId),
  );
  const newlyAssignedScheduleIds = new Set(assignments.map((a) => a.scheduleId));
  const assignedSundays = allFiscalYearSchedules.filter(
    (s) =>
      !s.isExcluded &&
      (otherScheduleIdsWithAssignments.has(s.id) || newlyAssignedScheduleIds.has(s.id)),
  );
  const totalSlots = assignedSundays.reduce((sum, s) => sum + slotsForSchedule(s), 0);
  const excessiveViolations = checkExcessiveCount(members, updatedCountMap, totalSlots);
  violations.push(...excessiveViolations);

  // Save assignments
  for (const a of assignments) {
    assignmentRepo.save(a);
  }

  // Build member lookup
  const memberMap = new Map<MemberId, Member>();
  for (const m of members) {
    memberMap.set(m.id, m);
  }

  // Build schedule date lookup
  const scheduleDateMap = new Map<ScheduleId, string>();
  for (const s of schedules) {
    scheduleDateMap.set(s.id, s.date);
  }

  const dtos: AssignmentDto[] = assignments.map((a) => ({
    id: a.id,
    scheduleId: a.scheduleId,
    date: scheduleDateMap.get(a.scheduleId) ?? '',
    groupNumber: a.groupNumber,
    gradeGroup: assignmentGradeGroup(a.memberIds.length, a.groupNumber),
    members: a.memberIds.map((mid) => ({
      id: mid,
      name: memberMap.get(mid)?.name ?? 'Unknown',
      gradeGroup: memberMap.get(mid)?.gradeGroup ?? GradeGroup.LOWER,
    })),
  }));

  return ok({ assignments: dtos, violations });
}

export interface AdjustAssignmentResult {
  assignment: AssignmentDto;
  violations: ConstraintViolation[];
}

export function adjustAssignment(
  assignmentId: string,
  oldMemberId: string,
  newMemberId: string,
  assignmentRepo: AssignmentRepository,
  memberRepo: MemberRepository,
  scheduleRepo: ScheduleRepository,
): Result<AdjustAssignmentResult> {
  const assignment = assignmentRepo.findById(asAssignmentId(assignmentId));
  if (!assignment) return err('Assignment not found');

  const newMember = memberRepo.findById(asMemberId(newMemberId));
  if (!newMember) return err('New member not found');

  // Reject HELPER on event days
  const schedule = scheduleRepo.findById(assignment.scheduleId);
  if (schedule?.isEvent && newMember.memberType === MemberType.HELPER) {
    return err('HELPER members cannot be assigned on event days');
  }

  const updated = assignment.replaceMember(asMemberId(oldMemberId), asMemberId(newMemberId));
  assignmentRepo.save(updated);

  // Look up all members for the updated assignment
  const memberLookup = new Map(
    updated.memberIds.map((mid) => [mid, memberRepo.findById(mid)] as const),
  );

  const date = schedule?.date ?? '';
  const isCombinedDay = schedule ? !schedule.isSplitClass : false;

  // Check constraints on the updated group
  const violations: ConstraintViolation[] = [];
  const groupMembers = updated.memberIds
    .map((mid) => memberLookup.get(mid) ?? null)
    .filter((m): m is Member => m !== null);

  if (groupMembers.length >= 2) {
    // Language balance (works for 2 or 3 members)
    const langViolation = checkLanguageBalanceGroup(groupMembers);
    if (langViolation) violations.push(langViolation);

    // Same-gender constraint: only for 2-member pairs (split-class day)
    if (!isCombinedDay && groupMembers.length === 2) {
      const genderViolation = checkSameGender(groupMembers[0], groupMembers[1]);
      if (genderViolation) violations.push(genderViolation);
    }

    // Spouse avoidance (works for 2 or 3 members)
    const spouseViolation = checkSpouseSameGroupMulti(groupMembers);
    if (spouseViolation) violations.push(spouseViolation);

    // Check class language coverage on split-class days
    if (schedule?.isSplitClass) {
      const sameDateAssignments = assignmentRepo.findByScheduleIds([updated.scheduleId]);
      const otherGroup = sameDateAssignments.find((a) => a.id !== updated.id);
      if (otherGroup) {
        const otherMembers = otherGroup.memberIds
          .map((mid) => memberRepo.findById(mid))
          .filter((m): m is Member => m !== null);
        const allMembers = [...groupMembers, ...otherMembers];
        const classViolations = checkClassLanguageCoverage(allMembers);
        violations.push(...classViolations);
      }
    }

    // Grade group mismatch check (only for split-class days)
    if (!isCombinedDay) {
      const expectedGrade = updated.groupNumber === 1 ? GradeGroup.UPPER : GradeGroup.LOWER;
      if (newMember.gradeGroup !== GradeGroup.ANY && newMember.gradeGroup !== expectedGrade) {
        violations.push({
          type: ViolationType.GRADE_GROUP_MISMATCH,
          severity: Severity.WARNING,
          memberIds: [asMemberId(newMemberId)],
          message: `${newMember.name} is ${newMember.gradeGroup} but assigned to ${expectedGrade} slot`,
          messageKey: 'violations.gradeGroupMismatch',
          messageParams: {
            name: newMember.name,
            registered: newMember.gradeGroup,
            assigned: expectedGrade,
          },
        });
      }
    }
  }

  // Check monthly duplicate and min interval for the new member
  if (date) {
    const fiscalYear = getFiscalYear(new Date(date));
    const allFiscalYearSchedules = scheduleRepo.findByFiscalYear(fiscalYear);
    const scheduleMonth = new Date(date).getMonth() + 1;
    const scheduleYear = new Date(date).getFullYear();
    const monthSchedules = scheduleRepo.findByMonth(scheduleYear, scheduleMonth);
    const monthScheduleIds = monthSchedules.map((s) => s.id);
    const monthAssignments = assignmentRepo.findByScheduleIds(monthScheduleIds);
    // Exclude the current assignment from duplicate check
    const otherMonthAssignments = monthAssignments.filter((a) => a.id !== updated.id);

    const newMembIdBranded = asMemberId(newMemberId);
    const dupViolation = checkMonthlyDuplicate(newMembIdBranded, otherMonthAssignments);
    if (dupViolation) violations.push(dupViolation);

    const scheduleDateMap = new Map<string, string>();
    for (const s of allFiscalYearSchedules) {
      scheduleDateMap.set(s.id, s.date);
    }
    const allAssignments = assignmentRepo.findByScheduleIds(allFiscalYearSchedules.map((s) => s.id));
    const otherAssignments = allAssignments.filter((a) => a.id !== updated.id);
    const intervalViolation = checkMinInterval(newMembIdBranded, date, otherAssignments, scheduleDateMap);
    if (intervalViolation) violations.push(intervalViolation);
  }

  const dto: AssignmentDto = {
    id: updated.id,
    scheduleId: updated.scheduleId,
    date,
    groupNumber: updated.groupNumber,
    gradeGroup: assignmentGradeGroup(updated.memberIds.length, updated.groupNumber),
    members: updated.memberIds.map((mid) => ({
      id: mid,
      name: memberLookup.get(mid)?.name ?? 'Unknown',
      gradeGroup: memberLookup.get(mid)?.gradeGroup ?? GradeGroup.LOWER,
    })),
  };

  return ok({ assignment: dto, violations });
}

export function deleteAssignments(
  year: number,
  month: number,
  scheduleRepo: ScheduleRepository,
  assignmentRepo: AssignmentRepository,
): void {
  const schedules = scheduleRepo.findByMonth(year, month);
  const scheduleIds = schedules.map((s) => s.id);
  assignmentRepo.deleteByScheduleIds(scheduleIds);
}

export function getAssignmentsForMonth(
  year: number,
  month: number,
  memberRepo: MemberRepository,
  scheduleRepo: ScheduleRepository,
  assignmentRepo: AssignmentRepository,
): AssignmentDto[] {
  const schedules = scheduleRepo.findByMonth(year, month);
  const scheduleIds = schedules.map((s) => s.id);
  const assignments = assignmentRepo.findByScheduleIds(scheduleIds);

  const members = memberRepo.findAll(false);
  const memberMap = new Map<MemberId, Member>();
  for (const m of members) {
    memberMap.set(m.id, m);
  }

  const scheduleDateMap = new Map<ScheduleId, string>();
  for (const s of schedules) {
    scheduleDateMap.set(s.id, s.date);
  }

  return assignments.map((a) => ({
    id: a.id,
    scheduleId: a.scheduleId,
    date: scheduleDateMap.get(a.scheduleId) ?? '',
    groupNumber: a.groupNumber,
    gradeGroup: assignmentGradeGroup(a.memberIds.length, a.groupNumber),
    members: a.memberIds.map((mid) => ({
      id: mid,
      name: memberMap.get(mid)?.name ?? 'Unknown',
      gradeGroup: memberMap.get(mid)?.gradeGroup ?? GradeGroup.LOWER,
    })),
  }));
}
