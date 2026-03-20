import { Result, ok, err } from '@shared/result';
import { MemberId, ScheduleId, asMemberId, asAssignmentId } from '@shared/types';
import { Member } from '@domain/entities/member';
import { MemberRepository } from '@domain/repositories/member-repository';
import { ScheduleRepository } from '@domain/repositories/schedule-repository';
import { AssignmentRepository } from '@domain/repositories/assignment-repository';
import { generateAssignments as generateAlgorithm } from '@domain/services/assignment-generator';
import {
  checkExcessiveCount,
  checkLanguageBalance,
  checkSameGender,
  checkSpouseSameGroup,
  checkMonthlyDuplicate,
  checkMinInterval,
  checkClassLanguageCoverage,
} from '@domain/services/constraint-checker';
import { MemberType } from '@domain/value-objects/member-type';
import { GradeGroup } from '@domain/value-objects/grade-group';
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
  role: string;
}

export interface AssignmentDto {
  id: string;
  scheduleId: string;
  date: string;
  groupNumber: number;
  members: AssignmentMemberDto[];
}

export interface GenerateAssignmentsResult {
  assignments: AssignmentDto[];
  violations: ConstraintViolation[];
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
  if (members.length < 4) {
    return err('Not enough active members (need at least 4)');
  }

  const fiscalYear = getFiscalYear(new Date(year, month - 1, 1));

  // Delete existing assignments for this month
  const scheduleIds = schedules.map((s) => s.id);
  assignmentRepo.deleteByScheduleIds(scheduleIds);

  // Get all existing assignments for count calculation
  const allFiscalYearSchedules = scheduleRepo.findByFiscalYear(fiscalYear);
  const otherScheduleIds = allFiscalYearSchedules
    .filter((s) => !scheduleIds.includes(s.id))
    .map((s) => s.id);
  const existingAssignments = assignmentRepo.findByScheduleIds(otherScheduleIds);

  // Build count map
  const countMap = new Map<MemberId, number>();
  for (const m of members) {
    countMap.set(m.id, 0);
  }
  for (const a of existingAssignments) {
    for (const mid of a.memberIds) {
      countMap.set(mid, (countMap.get(mid) ?? 0) + 1);
    }
  }

  const { assignments, violations } = generateAlgorithm(
    schedules,
    members,
    existingAssignments,
    countMap,
  );

  // Check excessive counts after generation
  const updatedCountMap = new Map(countMap);
  for (const a of assignments) {
    for (const mid of a.memberIds) {
      updatedCountMap.set(mid, (updatedCountMap.get(mid) ?? 0) + 1);
    }
  }
  const allFiscalYearSundays = allFiscalYearSchedules.filter((s) => !s.isExcluded);
  const excessiveViolations = checkExcessiveCount(members, updatedCountMap, allFiscalYearSundays.length);
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
    members: a.memberIds.map((mid, idx) => ({
      id: mid,
      name: memberMap.get(mid)?.name ?? 'Unknown',
      gradeGroup: memberMap.get(mid)?.gradeGroup ?? GradeGroup.LOWER,
      role: idx === 0 ? GradeGroup.UPPER : GradeGroup.LOWER,
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
  const m1 = memberLookup.get(updated.memberIds[0]) ?? null;
  const m2 = memberLookup.get(updated.memberIds[1]) ?? null;

  const date = schedule?.date ?? '';

  // Check constraints on the new pair
  const violations: ConstraintViolation[] = [];
  if (m1 && m2) {
    const langViolation = checkLanguageBalance(m1, m2);
    if (langViolation) violations.push(langViolation);
    const genderViolation = checkSameGender(m1, m2);
    if (genderViolation) violations.push(genderViolation);
    const spouseViolation = checkSpouseSameGroup(m1, m2);
    if (spouseViolation) violations.push(spouseViolation);

    // Check class language coverage on split-class days
    if (schedule?.isSplitClass) {
      const sameDateAssignments = assignmentRepo.findByScheduleIds([updated.scheduleId]);
      const otherGroup = sameDateAssignments.find((a) => a.id !== updated.id);
      if (otherGroup) {
        const otherM1 = memberRepo.findById(otherGroup.memberIds[0]);
        const otherM2 = memberRepo.findById(otherGroup.memberIds[1]);
        if (otherM1 && otherM2) {
          const allMembers = [m1, m2, otherM1, otherM2];
          const classViolations = checkClassLanguageCoverage(allMembers);
          violations.push(...classViolations);
        }
      }
    }

    // Grade group mismatch check
    const roleIndex = updated.memberIds.indexOf(asMemberId(newMemberId));
    const expectedGrade = roleIndex === 0 ? GradeGroup.UPPER : GradeGroup.LOWER;
    if (newMember.gradeGroup !== expectedGrade) {
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
    members: updated.memberIds.map((mid, idx) => ({
      id: mid,
      name: memberLookup.get(mid)?.name ?? 'Unknown',
      gradeGroup: memberLookup.get(mid)?.gradeGroup ?? GradeGroup.LOWER,
      role: idx === 0 ? GradeGroup.UPPER : GradeGroup.LOWER,
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
    members: a.memberIds.map((mid, idx) => ({
      id: mid,
      name: memberMap.get(mid)?.name ?? 'Unknown',
      gradeGroup: memberMap.get(mid)?.gradeGroup ?? GradeGroup.LOWER,
      role: idx === 0 ? GradeGroup.UPPER : GradeGroup.LOWER,
    })),
  }));
}
