import { MemberId } from '@shared/types';
import { Member } from '@domain/entities/member';
import { Assignment } from '@domain/entities/assignment';
import { Language, coversJapanese, coversEnglish } from '@domain/value-objects/language';
import { MemberType } from '@domain/value-objects/member-type';
import {
  ConstraintViolation,
  ViolationType,
  Severity,
} from '@domain/value-objects/constraint-violation';

export interface AssignmentContext {
  date: string;
  members: Map<MemberId, Member>;
  existingAssignmentsForMonth: Assignment[];
  assignmentCountsForYear: Map<MemberId, number>;
  pastPairs: Map<string, number>; // "id1-id2" -> count
}

export function checkAvailability(member: Member, date: string): boolean {
  return member.isAvailableOn(date);
}

export function checkLanguageBalance(
  member1: Member,
  member2: Member,
): ConstraintViolation | null {
  const hasJapanese = coversJapanese(member1.language) || coversJapanese(member2.language);
  const hasEnglish = coversEnglish(member1.language) || coversEnglish(member2.language);

  if (!hasJapanese || !hasEnglish) {
    const missing = !hasJapanese ? 'Japanese' : 'English';
    return {
      type: ViolationType.LANGUAGE_COVERAGE,
      severity: Severity.WARNING,
      memberIds: [member1.id, member2.id],
      message: `Group lacks ${missing} language coverage`,
      messageKey: 'violations.languageCoverage',
      messageParams: { missing },
    };
  }
  return null;
}

export function checkSameGender(member1: Member, member2: Member): ConstraintViolation | null {
  if (
    (member1.sameGenderOnly || member2.sameGenderOnly) &&
    member1.gender !== member2.gender
  ) {
    const constrained = member1.sameGenderOnly ? member1 : member2;
    return {
      type: ViolationType.SAME_GENDER,
      severity: Severity.WARNING,
      memberIds: [constrained.id],
      message: `${constrained.name} requires same-gender pairing`,
      messageKey: 'violations.sameGender',
      messageParams: { name: constrained.name },
    };
  }
  return null;
}

export function checkMonthlyDuplicate(
  memberId: MemberId,
  existingAssignments: Assignment[],
): ConstraintViolation | null {
  const alreadyAssigned = existingAssignments.some((a) => a.containsMember(memberId));
  if (alreadyAssigned) {
    return {
      type: ViolationType.MONTHLY_DUPLICATE,
      severity: Severity.WARNING,
      memberIds: [memberId],
      message: `Member is already assigned this month`,
      messageKey: 'violations.monthlyDuplicate',
      messageParams: {},
    };
  }
  return null;
}

export function checkSpouseSameGroup(
  member1: Member,
  member2: Member,
): ConstraintViolation | null {
  // Only applies to PARENT_COUPLE
  if (member1.memberType !== MemberType.PARENT_COUPLE) return null;
  if (member2.memberType !== MemberType.PARENT_COUPLE) return null;

  if (member1.spouseId === member2.id) {
    return {
      type: ViolationType.SPOUSE_SAME_GROUP,
      severity: Severity.WARNING,
      memberIds: [member1.id, member2.id],
      message: `Spouses ${member1.name} and ${member2.name} are in the same group`,
      messageKey: 'violations.spouseSameGroup',
      messageParams: { name1: member1.name, name2: member2.name },
    };
  }
  return null;
}

export function checkMinInterval(
  memberId: MemberId,
  date: string,
  existingAssignments: Assignment[],
  scheduleIdToDate: Map<string, string>,
): ConstraintViolation | null {
  const targetDate = new Date(date);
  const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;

  for (const assignment of existingAssignments) {
    if (!assignment.containsMember(memberId)) continue;
    const assignedDateStr = scheduleIdToDate.get(assignment.scheduleId);
    if (!assignedDateStr) continue;
    const assignedDate = new Date(assignedDateStr);
    const diff = Math.abs(targetDate.getTime() - assignedDate.getTime());
    if (diff < twoWeeksMs) {
      return {
        type: ViolationType.MIN_INTERVAL,
        severity: Severity.WARNING,
        memberIds: [memberId],
        message: `Member was assigned within the last 2 weeks`,
        messageKey: 'violations.minInterval',
        messageParams: {},
      };
    }
  }
  return null;
}

export function checkExcessiveCount(
  members: Member[],
  assignmentCounts: Map<MemberId, number>,
  totalSundays: number,
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const activeMembers = members.filter((m) => m.isActive);
  if (activeMembers.length === 0 || totalSundays === 0) return violations;

  const expectedCount = (totalSundays * 4) / activeMembers.length;

  for (const member of activeMembers) {
    const count = assignmentCounts.get(member.id) ?? 0;
    const expected = String(Math.round(expectedCount * 10) / 10);
    if (count > expectedCount * 1.5) {
      violations.push({
        type: ViolationType.EXCESSIVE_COUNT,
        severity: Severity.WARNING,
        memberIds: [member.id],
        message: `${member.name}: ${count} assignments (expected ~${expected}, too many)`,
        messageKey: 'violations.excessiveCount',
        messageParams: { name: member.name, count: String(count), expected, direction: 'tooMany' },
      });
    } else if (count < expectedCount * 0.5 && count > 0) {
      violations.push({
        type: ViolationType.EXCESSIVE_COUNT,
        severity: Severity.WARNING,
        memberIds: [member.id],
        message: `${member.name}: ${count} assignments (expected ~${expected}, too few)`,
        messageKey: 'violations.excessiveCount',
        messageParams: { name: member.name, count: String(count), expected, direction: 'tooFew' },
      });
    }
  }

  return violations;
}

export function checkClassLanguageCoverage(
  allMembers: Member[],
): ConstraintViolation[] {
  const bothCount = allMembers.filter((m) => m.language === Language.BOTH).length;
  if (bothCount < 2) {
    return [
      {
        type: ViolationType.CLASS_LANGUAGE_COVERAGE,
        severity: Severity.WARNING,
        memberIds: allMembers.map((m) => m.id),
        message: `Not enough bilingual leaders for split-class day (required: 2, actual: ${bothCount})`,
        messageKey: 'violations.classLanguageCoverage',
        messageParams: { count: String(bothCount) },
      },
    ];
  }
  return [];
}

export function checkAll(
  member1: Member,
  member2: Member,
  _context: AssignmentContext,
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  const langViolation = checkLanguageBalance(member1, member2);
  if (langViolation) violations.push(langViolation);

  const genderViolation = checkSameGender(member1, member2);
  if (genderViolation) violations.push(genderViolation);

  const spouseViolation = checkSpouseSameGroup(member1, member2);
  if (spouseViolation) violations.push(spouseViolation);

  return violations;
}
