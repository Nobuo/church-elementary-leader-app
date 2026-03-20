import { MemberId, ScheduleId } from '@shared/types';
import { Member } from '@domain/entities/member';
import { Schedule } from '@domain/entities/schedule';
import { Assignment } from '@domain/entities/assignment';
import { GradeGroup } from '@domain/value-objects/grade-group';
import { MemberType } from '@domain/value-objects/member-type';
import { Language, coversJapanese, coversEnglish } from '@domain/value-objects/language';
import {
  ConstraintViolation,
  ViolationType,
  Severity,
} from '@domain/value-objects/constraint-violation';

interface GenerationContext {
  schedules: Schedule[];
  members: Member[];
  existingAssignments: Assignment[];
  assignmentCounts: Map<MemberId, number>;
  scheduleIdToDate: Map<ScheduleId, string>;
}

interface GenerationResult {
  assignments: Assignment[];
  violations: ConstraintViolation[];
}

function pairKey(a: MemberId, b: MemberId): string {
  return [a, b].sort().join('-');
}

interface ClassContext {
  group1Members: [Member, Member];
}

/**
 * Score a candidate pair for a group assignment.
 * Lower score = better candidate.
 */
function scorePair(
  member1: Member,
  member2: Member,
  context: GenerationContext,
  monthAssignments: Assignment[],
  dayAssignments: Assignment[],
  pastPairCounts: Map<string, number>,
  classContext?: ClassContext,
  isSplitClassDay?: boolean,
): { score: number; violations: ConstraintViolation[] } {
  let score = 0;
  const violations: ConstraintViolation[] = [];

  // HARD: Language balance - each group needs both Japanese and English coverage
  const hasJapanese = coversJapanese(member1.language) || coversJapanese(member2.language);
  const hasEnglish = coversEnglish(member1.language) || coversEnglish(member2.language);
  if (!hasJapanese || !hasEnglish) {
    score += 100000; // effectively impossible
  }

  // HARD: Class language coverage (split-class days only)
  if (classContext) {
    const allFour = [...classContext.group1Members, member1, member2];
    const bothCount = allFour.filter((m) => m.language === Language.BOTH).length;
    if (bothCount < 2) {
      score += 100000;
      violations.push({
        type: ViolationType.CLASS_LANGUAGE_COVERAGE,
        severity: Severity.WARNING,
        memberIds: allFour.map((m) => m.id),
        message: `Not enough bilingual leaders for split-class day (required: 2, actual: ${bothCount})`,
        messageKey: 'violations.classLanguageCoverage',
        messageParams: { count: String(bothCount) },
      });
    }
  }

  // BOTH conservation: prevent unnecessary consumption of bilingual members
  if (!isSplitClassDay) {
    // Non-split-class: general BOTH conservation
    for (const m of [member1, member2]) {
      if (m.language === Language.BOTH) {
        score += 3;
      }
    }
  } else if (!classContext) {
    // Split-class Group 1: mild single-BOTH preference, penalize double-BOTH
    const bothInPair = [member1, member2].filter((m) => m.language === Language.BOTH).length;
    if (bothInPair === 1) score -= 1;
    if (bothInPair === 2) score += 5;
  }

  // Split-class day Group 2: prefer BOTH for bilingual coverage
  if (classContext) {
    for (const m of [member1, member2]) {
      if (m.language === Language.BOTH) {
        score -= 5;
      }
    }
  }

  // HARD: Same-gender constraint
  if (
    (member1.sameGenderOnly || member2.sameGenderOnly) &&
    member1.gender !== member2.gender
  ) {
    score += 100000;
    violations.push({
      type: ViolationType.SAME_GENDER,
      severity: Severity.WARNING,
      memberIds: [member1.id, member2.id],
      message: `Same-gender constraint violated for ${member1.name} or ${member2.name}`,
      messageKey: 'violations.sameGenderViolated',
      messageParams: { name1: member1.name, name2: member2.name },
    });
  }

  // Available-dates priority: members with date restrictions get a bonus
  for (const m of [member1, member2]) {
    if (m.availableDates && m.availableDates.length > 0) {
      score -= 30;
    }
  }

  // SOFT: Monthly duplicate (100 penalty per member already assigned this month)
  for (const m of [member1, member2]) {
    const alreadyAssigned = monthAssignments.some((a) => a.containsMember(m.id));
    if (alreadyAssigned) {
      score += 100;
    }
  }

  // Equal distribution (50 per assignment count difference from minimum)
  const counts = context.assignmentCounts;
  const minCount = Math.min(...context.members.filter((m) => m.isActive).map((m) => counts.get(m.id) ?? 0));
  for (const m of [member1, member2]) {
    const memberCount = counts.get(m.id) ?? 0;
    score += (memberCount - minCount) * 50;
  }

  // SOFT: Spouse avoidance (30 penalty) — only for PARENT_COUPLE
  if (
    member1.memberType === MemberType.PARENT_COUPLE &&
    member2.memberType === MemberType.PARENT_COUPLE &&
    member1.spouseId === member2.id
  ) {
    score += 30;
  }

  // Spouse on same day different group (30 penalty) — only for PARENT_COUPLE
  for (const dayAssignment of dayAssignments) {
    for (const m of [member1, member2]) {
      if (m.memberType !== MemberType.PARENT_COUPLE) continue;
      if (m.spouseId && dayAssignment.containsMember(m.spouseId)) {
        score += 30;
      }
    }
  }

  // Pair diversity (10 penalty per previous pairing)
  const pk = pairKey(member1.id, member2.id);
  const pairCount = pastPairCounts.get(pk) ?? 0;
  score += pairCount * 10;

  return { score, violations };
}

export function generateAssignments(
  schedules: Schedule[],
  allMembers: Member[],
  existingAssignmentsAll: Assignment[],
  assignmentCounts: Map<MemberId, number>,
): GenerationResult {
  const activeMembers = allMembers.filter((m) => m.isActive);
  const allAssignments: Assignment[] = [];
  const allViolations: ConstraintViolation[] = [];

  // Build schedule-to-date map
  const scheduleIdToDate = new Map<ScheduleId, string>();
  for (const s of schedules) {
    scheduleIdToDate.set(s.id, s.date);
  }
  // Build past pair counts from existing assignments
  const pastPairCounts = new Map<string, number>();
  for (const a of existingAssignmentsAll) {
    const pk = pairKey(a.memberIds[0], a.memberIds[1]);
    pastPairCounts.set(pk, (pastPairCounts.get(pk) ?? 0) + 1);
  }

  // Copy counts so we can update during generation
  const counts = new Map(assignmentCounts);
  for (const m of activeMembers) {
    if (!counts.has(m.id)) counts.set(m.id, 0);
  }

  const activeDates = schedules.filter((s) => !s.isExcluded).sort((a, b) => a.date.localeCompare(b.date));

  const monthAssignments: Assignment[] = [];

  const context: GenerationContext = {
    schedules,
    members: activeMembers,
    existingAssignments: existingAssignmentsAll,
    assignmentCounts: counts,
    scheduleIdToDate,
  };

  for (const schedule of activeDates) {
    const dateStr = schedule.date;
    const dayAssignments: Assignment[] = [];

    // Get available members for this date
    // On event days, exclude HELPER members
    const available = activeMembers
      .filter((m) => m.isAvailableOn(dateStr))
      .filter((m) => !schedule.isEvent || m.memberType !== MemberType.HELPER);

    const upperBase = available.filter((m) => m.gradeGroup === GradeGroup.UPPER);
    const lowerBase = available.filter((m) => m.gradeGroup === GradeGroup.LOWER);

    // On split-class days, allow bilingual (BOTH) members to cross grade boundaries
    let upperMembers = upperBase;
    let lowerMembers = lowerBase;
    if (schedule.isSplitClass) {
      const upperBothCount = upperBase.filter((m) => m.language === Language.BOTH).length;
      const lowerBothCount = lowerBase.filter((m) => m.language === Language.BOTH).length;
      if (lowerBothCount < 1 && upperBothCount > 2) {
        lowerMembers = [
          ...lowerBase,
          ...upperBase.filter((m) => m.language === Language.BOTH),
        ];
      }
      if (upperBothCount < 1 && lowerBothCount > 2) {
        upperMembers = [
          ...upperBase,
          ...lowerBase.filter((m) => m.language === Language.BOTH),
        ];
      }
    }

    if (upperMembers.length < 2 || lowerMembers.length < 2) {
      allViolations.push({
        type: ViolationType.UNEQUAL_COUNT,
        severity: Severity.WARNING,
        memberIds: [],
        message: `Not enough members for ${dateStr}: ${upperMembers.length} upper, ${lowerMembers.length} lower`,
        messageKey: 'violations.notEnoughMembers',
        messageParams: { date: dateStr, upper: String(upperMembers.length), lower: String(lowerMembers.length) },
      });
      // Try with whatever we have
      if (upperMembers.length < 1 || lowerMembers.length < 1) continue;
    }

    // Group 1 (UPPER): pick 2 from upperPool
    const group1Result = pickBestPairSameGrade(
      upperMembers,
      context,
      monthAssignments,
      dayAssignments,
      pastPairCounts,
      undefined,
      schedule.isSplitClass,
    );

    if (group1Result) {
      const assignment1 = Assignment.create(schedule.id, 1, [
        group1Result.member1.id,
        group1Result.member2.id,
      ]);
      dayAssignments.push(assignment1);
      monthAssignments.push(assignment1);
      allAssignments.push(assignment1);
      allViolations.push(...group1Result.violations);

      // Update counts
      counts.set(group1Result.member1.id, (counts.get(group1Result.member1.id) ?? 0) + 1);
      counts.set(group1Result.member2.id, (counts.get(group1Result.member2.id) ?? 0) + 1);

      // Update pair counts
      const pk = pairKey(group1Result.member1.id, group1Result.member2.id);
      pastPairCounts.set(pk, (pastPairCounts.get(pk) ?? 0) + 1);

      // Group 2 (LOWER): pick 2 from lowerPool, excluding members used in Group 1
      const usedIds = new Set([group1Result.member1.id, group1Result.member2.id]);
      const remainingLower = lowerMembers.filter((m) => !usedIds.has(m.id));

      // On split-class days, pass class context so Group 2 considers bilingual coverage
      const group2ClassContext = schedule.isSplitClass
        ? { group1Members: [group1Result.member1, group1Result.member2] as [Member, Member] }
        : undefined;

      const group2Result = pickBestPairSameGrade(
        remainingLower,
        context,
        monthAssignments,
        dayAssignments,
        pastPairCounts,
        group2ClassContext,
        schedule.isSplitClass,
      );

      if (group2Result) {
        const assignment2 = Assignment.create(schedule.id, 2, [
          group2Result.member1.id,
          group2Result.member2.id,
        ]);
        dayAssignments.push(assignment2);
        monthAssignments.push(assignment2);
        allAssignments.push(assignment2);
        allViolations.push(...group2Result.violations);

        counts.set(group2Result.member1.id, (counts.get(group2Result.member1.id) ?? 0) + 1);
        counts.set(group2Result.member2.id, (counts.get(group2Result.member2.id) ?? 0) + 1);

        const pk2 = pairKey(group2Result.member1.id, group2Result.member2.id);
        pastPairCounts.set(pk2, (pastPairCounts.get(pk2) ?? 0) + 1);
      } else {
        allViolations.push({
          type: ViolationType.UNEQUAL_COUNT,
          severity: Severity.WARNING,
          memberIds: [],
          message: `Could not form group 2 for ${dateStr}`,
          messageKey: 'violations.cannotFormGroup',
          messageParams: { group: '2', date: dateStr },
        });
      }
    } else {
      allViolations.push({
        type: ViolationType.UNEQUAL_COUNT,
        severity: Severity.WARNING,
        memberIds: [],
        message: `Could not form group 1 for ${dateStr}`,
        messageKey: 'violations.cannotFormGroup',
        messageParams: { group: '1', date: dateStr },
      });
    }
  }

  return { assignments: allAssignments, violations: allViolations };
}

interface PairResult {
  member1: Member;
  member2: Member;
  violations: ConstraintViolation[];
}

function pickBestPairSameGrade(
  candidates: Member[],
  context: GenerationContext,
  monthAssignments: Assignment[],
  dayAssignments: Assignment[],
  pastPairCounts: Map<string, number>,
  classContext?: ClassContext,
  isSplitClassDay?: boolean,
): PairResult | null {
  if (candidates.length < 2) return null;

  let bestScore = Infinity;
  let bestPair: PairResult | null = null;

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const { score, violations } = scorePair(
        candidates[i],
        candidates[j],
        context,
        monthAssignments,
        dayAssignments,
        pastPairCounts,
        classContext,
        isSplitClassDay,
      );

      if (score < bestScore) {
        bestScore = score;
        bestPair = { member1: candidates[i], member2: candidates[j], violations };
      }
    }
  }

  return bestPair;
}
