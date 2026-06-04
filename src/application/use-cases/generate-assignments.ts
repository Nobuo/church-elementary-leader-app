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
  notes: string;
  gradeGroup: string;
}

export interface AssignmentDto {
  id: string;
  scheduleId: string;
  date: string;
  groupNumber: number;
  gradeGroup: string;
  members: AssignmentMemberDto[];
  vacantSlots: number;
}

export interface GenerateAssignmentsResult {
  assignments: AssignmentDto[];
  violations: ConstraintViolation[];
  message?: string;
}

/** 合同日は3枠、分級日は4枠 */
function slotsForSchedule(schedule: Schedule): number {
  return schedule.isSplitClass ? 4 : 3;
}

function maxMembersForSchedule(schedule: Schedule | null | undefined): number {
  return schedule?.isSplitClass ? 2 : 3;
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

  // 差分モード: 未割り当てのスケジュールだけを探す
  const existingMonthAssignments = assignmentRepo.findByScheduleIds(allScheduleIds);
  const assignedScheduleIds = new Set(existingMonthAssignments.map((a) => a.scheduleId));
  const unassignedSchedules = schedules.filter(
    (s) => !s.isExcluded && !assignedScheduleIds.has(s.id),
  );

  // すべてのスケジュールが割り当て済みなら何もしない
  if (unassignedSchedules.length === 0) {
    return ok({ assignments: [], violations: [], message: 'allWeeksAssigned' });
  }

  const fiscalYear = getFiscalYear(new Date(year, month - 1, 1));

  // 回数計算のため既存の割り当てをすべて取得する
  const allFiscalYearSchedules = scheduleRepo.findByFiscalYear(fiscalYear);
  const otherScheduleIds = allFiscalYearSchedules
    .filter((s) => !allScheduleIds.includes(s.id))
    .map((s) => s.id);
  const otherMonthAssignments = assignmentRepo.findByScheduleIds(otherScheduleIds);

  // 他月の割り当てと当月の確定済み割り当ての両方を含める
  const existingAssignmentsAll = [...otherMonthAssignments, ...existingMonthAssignments];

  // 既存の割り当て全体から回数マップを作る
  const countMap = new Map<MemberId, number>();
  for (const m of members) {
    countMap.set(m.id, 0);
  }
  for (const a of existingAssignmentsAll) {
    for (const mid of a.memberIds) {
      countMap.set(mid, (countMap.get(mid) ?? 0) + 1);
    }
  }

  // 未割り当てのスケジュールだけを生成する
  const { assignments, violations } = generateAlgorithm(
    unassignedSchedules,
    members,
    existingAssignmentsAll,
    countMap,
    allFiscalYearSchedules,
  );

  // 生成後に割り当て回数過多を確認する
  const updatedCountMap = new Map(countMap);
  for (const a of assignments) {
    for (const mid of a.memberIds) {
      updatedCountMap.set(mid, (updatedCountMap.get(mid) ?? 0) + 1);
    }
  }

  // 枠数計算用のスケジュール検索表を作る
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

  // 割り当てを保存する
  for (const a of assignments) {
    assignmentRepo.save(a);
  }

  // メンバー検索表を作る
  const memberMap = new Map<MemberId, Member>();
  for (const m of members) {
    memberMap.set(m.id, m);
  }

  // スケジュール日付検索表を作る
  const scheduleDateMap = new Map<ScheduleId, string>();
  for (const s of schedules) {
    scheduleDateMap.set(s.id, s.date);
  }

  const dtos: AssignmentDto[] = assignments.map((a) => {
    const max = maxMembersForSchedule(scheduleMap.get(a.scheduleId));
    return {
      id: a.id,
      scheduleId: a.scheduleId,
      date: scheduleDateMap.get(a.scheduleId) ?? '',
      groupNumber: a.groupNumber,
      gradeGroup: assignmentGradeGroup(a.memberIds.length, a.groupNumber),
      members: a.memberIds.map((mid) => ({
        id: mid,
        name: memberMap.get(mid)?.name ?? 'Unknown',
        notes: memberMap.get(mid)?.notes ?? '',
        gradeGroup: memberMap.get(mid)?.gradeGroup ?? GradeGroup.LOWER,
      })),
      vacantSlots: Math.max(0, max - a.memberIds.length),
    };
  });

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

  // イベント日は HELPER を拒否する
  const schedule = scheduleRepo.findById(assignment.scheduleId);
  if (schedule?.isEvent && newMember.memberType === MemberType.HELPER) {
    return err('HELPER members cannot be assigned on event days');
  }

  const updated = assignment.replaceMember(asMemberId(oldMemberId), asMemberId(newMemberId));
  assignmentRepo.save(updated);

  // 更新後の割り当てに必要な全メンバーを取得する
  const memberLookup = new Map(
    updated.memberIds.map((mid) => [mid, memberRepo.findById(mid)] as const),
  );

  const date = schedule?.date ?? '';
  const isCombinedDay = schedule ? !schedule.isSplitClass : false;

  // 更新後のグループの制約を確認する
  const violations: ConstraintViolation[] = [];
  const groupMembers = updated.memberIds
    .map((mid) => memberLookup.get(mid) ?? null)
    .filter((m): m is Member => m !== null);

  if (groupMembers.length >= 2) {
    // 言語バランス（2人または3人で有効）
    const langViolation = checkLanguageBalanceGroup(groupMembers);
    if (langViolation) violations.push(langViolation);

    // 同性制約: 2人ペア（分級日）のみ対象
    if (!isCombinedDay && groupMembers.length === 2) {
      const genderViolation = checkSameGender(groupMembers[0], groupMembers[1]);
      if (genderViolation) violations.push(genderViolation);
    }

    // 配偶者回避（2人または3人で有効）
    const spouseViolation = checkSpouseSameGroupMulti(groupMembers);
    if (spouseViolation) violations.push(spouseViolation);

    // 分級日のクラス別言語カバーを確認する
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

    // 学年グループ不一致の確認（分級日のみ）
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

  // 新しいメンバーについて月内重複と最小間隔を確認する
  if (date) {
    const fiscalYear = getFiscalYear(new Date(date));
    const allFiscalYearSchedules = scheduleRepo.findByFiscalYear(fiscalYear);
    const scheduleMonth = new Date(date).getMonth() + 1;
    const scheduleYear = new Date(date).getFullYear();
    const monthSchedules = scheduleRepo.findByMonth(scheduleYear, scheduleMonth);
    const monthScheduleIds = monthSchedules.map((s) => s.id);
    const monthAssignments = assignmentRepo.findByScheduleIds(monthScheduleIds);
    // 重複確認から現在の割り当てを除外する
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
      notes: memberLookup.get(mid)?.notes ?? '',
      gradeGroup: memberLookup.get(mid)?.gradeGroup ?? GradeGroup.LOWER,
    })),
    vacantSlots: Math.max(0, maxMembersForSchedule(schedule) - updated.memberIds.length),
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

  const scheduleById = new Map<ScheduleId, Schedule>();
  for (const s of schedules) {
    scheduleById.set(s.id, s);
  }

  return assignments.map((a) => {
    const max = maxMembersForSchedule(scheduleById.get(a.scheduleId));
    return {
      id: a.id,
      scheduleId: a.scheduleId,
      date: scheduleDateMap.get(a.scheduleId) ?? '',
      groupNumber: a.groupNumber,
      gradeGroup: assignmentGradeGroup(a.memberIds.length, a.groupNumber),
      members: a.memberIds.map((mid) => ({
        id: mid,
        name: memberMap.get(mid)?.name ?? 'Unknown',
        notes: memberMap.get(mid)?.notes ?? '',
        gradeGroup: memberMap.get(mid)?.gradeGroup ?? GradeGroup.LOWER,
      })),
      vacantSlots: Math.max(0, max - a.memberIds.length),
    };
  });
}

export interface UnassignMemberResult {
  assignment: AssignmentDto | null;
  deleted: boolean;
}

export function unassignMember(
  assignmentId: string,
  memberId: string,
  assignmentRepo: AssignmentRepository,
  memberRepo: MemberRepository,
  scheduleRepo: ScheduleRepository,
): Result<UnassignMemberResult> {
  const assignment = assignmentRepo.findById(asAssignmentId(assignmentId));
  if (!assignment) return err('Assignment not found');

  if (!assignment.containsMember(asMemberId(memberId))) {
    return err('Member not in this assignment');
  }

  const updated = assignment.removeMember(asMemberId(memberId));

  if (updated === null) {
    assignmentRepo.deleteById(assignment.id);
    return ok({ assignment: null, deleted: true });
  }

  assignmentRepo.save(updated);

  const schedule = scheduleRepo.findById(updated.scheduleId);
  const date = schedule?.date ?? '';
  const max = maxMembersForSchedule(schedule);

  const dto: AssignmentDto = {
    id: updated.id,
    scheduleId: updated.scheduleId,
    date,
    groupNumber: updated.groupNumber,
    gradeGroup: assignmentGradeGroup(updated.memberIds.length, updated.groupNumber),
    members: updated.memberIds.map((mid) => {
      const m = memberRepo.findById(mid);
      return {
        id: mid,
        name: m?.name ?? 'Unknown',
        notes: m?.notes ?? '',
        gradeGroup: m?.gradeGroup ?? GradeGroup.LOWER,
      };
    }),
    vacantSlots: Math.max(0, max - updated.memberIds.length),
  };

  return ok({ assignment: dto, deleted: false });
}

export function assignToVacantSlot(
  assignmentId: string,
  memberId: string,
  assignmentRepo: AssignmentRepository,
  memberRepo: MemberRepository,
  scheduleRepo: ScheduleRepository,
): Result<AdjustAssignmentResult> {
  const assignment = assignmentRepo.findById(asAssignmentId(assignmentId));
  if (!assignment) return err('Assignment not found');

  const schedule = scheduleRepo.findById(assignment.scheduleId);
  const max = maxMembersForSchedule(schedule);

  if (assignment.memberIds.length >= max) {
    return err('Assignment is full');
  }

  const newMember = memberRepo.findById(asMemberId(memberId));
  if (!newMember) return err('Member not found');

  // イベント日は HELPER を拒否する
  if (schedule?.isEvent && newMember.memberType === MemberType.HELPER) {
    return err('HELPER members cannot be assigned on event days');
  }

  const updated = assignment.addMember(asMemberId(memberId), max);
  assignmentRepo.save(updated);

  const date = schedule?.date ?? '';
  const isCombinedDay = schedule ? !schedule.isSplitClass : false;

  // 更新後のグループの制約を確認する
  const violations: ConstraintViolation[] = [];
  const memberLookup = new Map(
    updated.memberIds.map((mid) => [mid, memberRepo.findById(mid)] as const),
  );
  const groupMembers = updated.memberIds
    .map((mid) => memberLookup.get(mid) ?? null)
    .filter((m): m is Member => m !== null);

  if (groupMembers.length >= 2) {
    const langViolation = checkLanguageBalanceGroup(groupMembers);
    if (langViolation) violations.push(langViolation);

    if (!isCombinedDay && groupMembers.length === 2) {
      const genderViolation = checkSameGender(groupMembers[0], groupMembers[1]);
      if (genderViolation) violations.push(genderViolation);
    }

    const spouseViolation = checkSpouseSameGroupMulti(groupMembers);
    if (spouseViolation) violations.push(spouseViolation);

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

    if (!isCombinedDay) {
      const expectedGrade = updated.groupNumber === 1 ? GradeGroup.UPPER : GradeGroup.LOWER;
      if (newMember.gradeGroup !== GradeGroup.ANY && newMember.gradeGroup !== expectedGrade) {
        violations.push({
          type: ViolationType.GRADE_GROUP_MISMATCH,
          severity: Severity.WARNING,
          memberIds: [asMemberId(memberId)],
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

  // 月内重複と最小間隔を確認する
  if (date) {
    const fiscalYear = getFiscalYear(new Date(date));
    const allFiscalYearSchedules = scheduleRepo.findByFiscalYear(fiscalYear);
    const scheduleMonth = new Date(date).getMonth() + 1;
    const scheduleYear = new Date(date).getFullYear();
    const monthSchedules = scheduleRepo.findByMonth(scheduleYear, scheduleMonth);
    const monthScheduleIds = monthSchedules.map((s) => s.id);
    const monthAssignments = assignmentRepo.findByScheduleIds(monthScheduleIds);
    const otherMonthAssignments = monthAssignments.filter((a) => a.id !== updated.id);

    const newMembIdBranded = asMemberId(memberId);
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
      notes: memberLookup.get(mid)?.notes ?? '',
      gradeGroup: memberLookup.get(mid)?.gradeGroup ?? GradeGroup.LOWER,
    })),
    vacantSlots: Math.max(0, max - updated.memberIds.length),
  };

  return ok({ assignment: dto, violations });
}
