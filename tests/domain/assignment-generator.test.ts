import { describe, it, expect } from 'vitest';
import { Member } from '@domain/entities/member';
import { Assignment } from '@domain/entities/assignment';
import { Schedule } from '@domain/entities/schedule';
import { Gender } from '@domain/value-objects/gender';
import { Language } from '@domain/value-objects/language';
import { GradeGroup } from '@domain/value-objects/grade-group';
import { MemberType } from '@domain/value-objects/member-type';
import { MemberId, createMemberId } from '@shared/types';
import { ViolationType } from '@domain/value-objects/constraint-violation';
import { generateAssignments } from '@domain/services/assignment-generator';

function makeMember(
  name: string,
  overrides: Partial<Parameters<typeof Member.create>[0]> = {},
): Member {
  const result = Member.create({
    name,
    gender: Gender.MALE,
    language: Language.BOTH,
    gradeGroup: GradeGroup.UPPER,
    memberType: MemberType.PARENT_SINGLE,
    sameGenderOnly: false,
    spouseId: null,
    availableDates: null,
    ...overrides,
  });
  if (!result.ok) throw new Error(`Failed to create member ${name}`);
  return result.value;
}

function makeSchedule(date: string): Schedule {
  const result = Schedule.create(date);
  if (!result.ok) throw new Error(`Failed to create schedule ${date}: ${result.error}`);
  return result.value;
}

describe('generateAssignments', () => {
  it('generates assignments for a month with enough members', () => {
    // 4 UPPER + 4 LOWER members with language coverage
    const members = [
      makeMember('Upper-JP-M-1', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE, gender: Gender.MALE }),
      makeMember('Upper-EN-F-1', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH, gender: Gender.FEMALE }),
      makeMember('Upper-JP-M-2', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE, gender: Gender.MALE }),
      makeMember('Upper-EN-F-2', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH, gender: Gender.FEMALE }),
      makeMember('Lower-JP-M-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE, gender: Gender.MALE }),
      makeMember('Lower-EN-F-1', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH, gender: Gender.FEMALE }),
      makeMember('Lower-JP-M-2', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE, gender: Gender.MALE }),
      makeMember('Lower-EN-F-2', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH, gender: Gender.FEMALE }),
    ];

    const schedules = [makeSchedule('2026-04-05'), makeSchedule('2026-04-12')];

    const counts = new Map<MemberId, number>();
    members.forEach((m) => counts.set(m.id, 0));

    const { assignments } = generateAssignments(schedules, members, [], counts);

    // 2 days × 2 groups = 4 assignments
    expect(assignments.length).toBe(4);

    // Each assignment should have 2 members
    for (const a of assignments) {
      expect(a.memberIds.length).toBe(2);
    }

    // Each day should have group 1 and group 2
    const day1 = assignments.filter((a) => a.scheduleId === schedules[0].id);
    const day2 = assignments.filter((a) => a.scheduleId === schedules[1].id);
    expect(day1.length).toBe(2);
    expect(day2.length).toBe(2);
    expect(day1.map((a) => a.groupNumber).sort()).toEqual([1, 2]);
  });

  it('handles language balance in groups', () => {
    const members = [
      makeMember('U-JP', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
      makeMember('U-EN', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH }),
      makeMember('L-JP', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
      makeMember('L-EN', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
    ];

    const schedules = [makeSchedule('2026-04-05')];
    const counts = new Map<MemberId, number>();
    members.forEach((m) => counts.set(m.id, 0));

    const { assignments } = generateAssignments(schedules, members, [], counts);

    // Each group should have language coverage
    for (const a of assignments) {
      const m1 = members.find((m) => m.id === a.memberIds[0])!;
      const m2 = members.find((m) => m.id === a.memberIds[1])!;
      // At least one should cover Japanese and at least one English
      const hasJP = [m1, m2].some(
        (m) => m.language === Language.JAPANESE || m.language === Language.BOTH,
      );
      const hasEN = [m1, m2].some(
        (m) => m.language === Language.ENGLISH || m.language === Language.BOTH,
      );
      expect(hasJP).toBe(true);
      expect(hasEN).toBe(true);
    }
  });

  it('excludes HELPER members on event days', () => {
    const members = [
      makeMember('U-JP-Parent', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE, memberType: MemberType.PARENT_SINGLE }),
      makeMember('U-EN-Helper', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH, memberType: MemberType.HELPER }),
      makeMember('U-EN-Parent', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH, memberType: MemberType.PARENT_SINGLE }),
      makeMember('L-JP-Parent', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE, memberType: MemberType.PARENT_SINGLE }),
      makeMember('L-EN-Helper', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH, memberType: MemberType.HELPER }),
      makeMember('L-EN-Parent', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH, memberType: MemberType.PARENT_SINGLE }),
    ];

    const schedule = makeSchedule('2026-04-05').toggleEvent();
    const counts = new Map<MemberId, number>();
    members.forEach((m) => counts.set(m.id, 0));

    const { assignments } = generateAssignments([schedule], members, [], counts);

    // No HELPER should be assigned on event day
    const helperIds = new Set(members.filter((m) => m.memberType === MemberType.HELPER).map((m) => m.id));
    for (const a of assignments) {
      for (const mid of a.memberIds) {
        expect(helperIds.has(mid)).toBe(false);
      }
    }
  });

  it('includes HELPER members on non-event days', () => {
    // Only 2 UPPER + 2 LOWER, with HELPERs needed for language coverage
    const members = [
      makeMember('U-JP', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE, memberType: MemberType.PARENT_SINGLE }),
      makeMember('U-EN-H', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH, memberType: MemberType.HELPER }),
      makeMember('L-JP', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE, memberType: MemberType.PARENT_SINGLE }),
      makeMember('L-EN-H', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH, memberType: MemberType.HELPER }),
    ];

    const schedule = makeSchedule('2026-04-05'); // not event
    const counts = new Map<MemberId, number>();
    members.forEach((m) => counts.set(m.id, 0));

    const { assignments } = generateAssignments([schedule], members, [], counts);

    // HELPERs should be assigned on normal days
    const helperIds = new Set(members.filter((m) => m.memberType === MemberType.HELPER).map((m) => m.id));
    const assignedIds = assignments.flatMap((a) => a.memberIds);
    const assignedHelpers = assignedIds.filter((id) => helperIds.has(id));
    expect(assignedHelpers.length).toBeGreaterThan(0);
  });

  it('returns no assignments when only HELPERs on event day', () => {
    const members = [
      makeMember('U-H1', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH, memberType: MemberType.HELPER }),
      makeMember('L-H1', { gradeGroup: GradeGroup.LOWER, language: Language.BOTH, memberType: MemberType.HELPER }),
    ];

    const schedule = makeSchedule('2026-04-05').toggleEvent();
    const counts = new Map<MemberId, number>();
    members.forEach((m) => counts.set(m.id, 0));

    const { assignments } = generateAssignments([schedule], members, [], counts);
    expect(assignments).toHaveLength(0);
  });

  it('prioritizes members with availableDates over unrestricted members', () => {
    // Create 3 UPPER members: one with date restriction + past pairings, two without
    // The restricted member has 2 past pairings (pair diversity penalty: +20)
    // Without priority bonus (-30), unrestricted members (score 0) would beat restricted (+20)
    // With bonus: restricted gets -30 + 20 = -10, which beats unrestricted at 0
    const restrictedUpper = Member.reconstruct({
      ...makeMember('U-Restricted', {
        gradeGroup: GradeGroup.UPPER,
        language: Language.BOTH,
      }),
      availableDates: ['2026-04-05'],
    });
    const unrestrictedUpper1 = makeMember('U-Unrestricted-1', {
      gradeGroup: GradeGroup.UPPER,
      language: Language.BOTH,
    });
    const unrestrictedUpper2 = makeMember('U-Unrestricted-2', {
      gradeGroup: GradeGroup.UPPER,
      language: Language.BOTH,
    });
    const lower1 = makeMember('L-1', { gradeGroup: GradeGroup.LOWER, language: Language.BOTH });
    const lower2 = makeMember('L-2', { gradeGroup: GradeGroup.LOWER, language: Language.BOTH });

    const members = [restrictedUpper, unrestrictedUpper1, unrestrictedUpper2, lower1, lower2];
    const schedules = [makeSchedule('2026-04-05')];
    const counts = new Map<MemberId, number>();
    members.forEach((m) => counts.set(m.id, 0));

    // Create past assignments so restricted member has pair diversity penalty with both lowers
    const pastSchedule = makeSchedule('2026-03-01');
    const existingAssignments = [
      Assignment.create(pastSchedule.id, 1, [restrictedUpper.id, lower1.id]),
      Assignment.create(pastSchedule.id, 2, [restrictedUpper.id, lower2.id]),
    ];

    const { assignments } = generateAssignments(schedules, members, existingAssignments, counts);

    // The restricted member should be assigned despite pair diversity penalty (prioritized via -30 bonus)
    const allAssignedIds = assignments.flatMap((a) => a.memberIds);
    expect(allAssignedIds).toContain(restrictedUpper.id);
  });

  it('does not override hard constraints with availableDates priority', () => {
    // Restricted member only covers Japanese, partner only covers Japanese too
    // Language balance requires English coverage, so restricted member should NOT be picked
    // if the only available pair would violate language balance
    const restrictedUpper = Member.reconstruct({
      ...makeMember('U-JP-Restricted', {
        gradeGroup: GradeGroup.UPPER,
        language: Language.JAPANESE,
      }),
      availableDates: ['2026-04-05'],
    });
    const unrestrictedUpper = makeMember('U-EN-Unrestricted', {
      gradeGroup: GradeGroup.UPPER,
      language: Language.ENGLISH,
    });
    // Only one lower member who covers Japanese only
    const lower1 = makeMember('L-JP', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE });
    const lower2 = makeMember('L-EN', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH });

    const members = [restrictedUpper, unrestrictedUpper, lower1, lower2];
    const schedules = [makeSchedule('2026-04-05')];
    const counts = new Map<MemberId, number>();
    members.forEach((m) => counts.set(m.id, 0));

    const { assignments } = generateAssignments(schedules, members, [], counts);

    // Each group must have language balance — verify
    for (const a of assignments) {
      const m1 = members.find((m) => m.id === a.memberIds[0])!;
      const m2 = members.find((m) => m.id === a.memberIds[1])!;
      const hasJP = [m1, m2].some(
        (m) => m.language === Language.JAPANESE || m.language === Language.BOTH,
      );
      const hasEN = [m1, m2].some(
        (m) => m.language === Language.ENGLISH || m.language === Language.BOTH,
      );
      expect(hasJP).toBe(true);
      expect(hasEN).toBe(true);
    }
  });

  it('groups members by grade: group 1 = UPPER, group 2 = LOWER (T1, T2)', () => {
    const members = [
      makeMember('U-JP-1', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
      makeMember('U-EN-1', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH }),
      makeMember('U-BOTH-1', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
      makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
      makeMember('L-EN-1', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
      makeMember('L-BOTH-1', { gradeGroup: GradeGroup.LOWER, language: Language.BOTH }),
    ];

    const schedule = makeSchedule('2026-04-05');
    const counts = new Map<MemberId, number>();
    members.forEach((m) => counts.set(m.id, 0));

    const { assignments } = generateAssignments([schedule], members, [], counts);
    for (const a of assignments) {
      if (a.groupNumber === 1) {
        // Group 1 = all UPPER
        for (const mid of a.memberIds) {
          const m = members.find((mem) => mem.id === mid)!;
          expect(m.gradeGroup).toBe(GradeGroup.UPPER);
        }
      } else {
        // Group 2 = all LOWER
        for (const mid of a.memberIds) {
          const m = members.find((mem) => mem.id === mid)!;
          expect(m.gradeGroup).toBe(GradeGroup.LOWER);
        }
      }
    }
  });

  it('does not cross on split-class day when each grade has enough BOTH (T3)', () => {
    const members = [
      makeMember('U-BOTH-1', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
      makeMember('U-JP-1', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
      makeMember('U-EN-1', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH }),
      makeMember('L-BOTH-1', { gradeGroup: GradeGroup.LOWER, language: Language.BOTH }),
      makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
      makeMember('L-EN-1', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
    ];

    const schedule = makeSchedule('2026-04-05').toggleSplitClass();
    const counts = new Map<MemberId, number>();
    members.forEach((m) => counts.set(m.id, 0));

    const { assignments } = generateAssignments([schedule], members, [], counts);
    for (const a of assignments) {
      const expectedGrade = a.groupNumber === 1 ? GradeGroup.UPPER : GradeGroup.LOWER;
      for (const mid of a.memberIds) {
        const m = members.find((mem) => mem.id === mid)!;
        expect(m.gradeGroup).toBe(expectedGrade);
      }
    }
  });

  it('allows BOTH members to cross from UPPER to LOWER group on split-class days when LOWER lacks bilinguals (T4)', () => {
    // UPPER: 3 BOTH members, LOWER: 0 BOTH members
    // G1 picks BOTH+JP (1 BOTH). Crossover pool adds UPPER BOTH to LOWER candidates.
    // CLASS_LANGUAGE_COVERAGE: G1(1 BOTH) + G2(needs 1 BOTH from crossover pool).
    const members = [
      makeMember('U-BOTH-1', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
      makeMember('U-BOTH-2', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
      makeMember('U-BOTH-3', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
      makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
      makeMember('L-EN-1', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
    ];

    const schedule = makeSchedule('2026-04-05').toggleSplitClass();
    const counts = new Map<MemberId, number>();
    members.forEach((m) => counts.set(m.id, 0));

    const { assignments, violations } = generateAssignments([schedule], members, [], counts);
    expect(assignments.length).toBe(2);

    // No CLASS_LANGUAGE_COVERAGE violation — G1's BOTH+BOTH satisfies the constraint
    const classViolations = violations.filter(
      (v) => v.type === ViolationType.CLASS_LANGUAGE_COVERAGE,
    );
    expect(classViolations).toHaveLength(0);
  });

  it('allows BOTH members to cross from LOWER to UPPER group on split-class days when UPPER lacks bilinguals (T6)', () => {
    // UPPER: 0 BOTH, LOWER: 3 BOTH
    const members = [
      makeMember('U-JP-1', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
      makeMember('U-EN-1', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH }),
      makeMember('L-BOTH-1', { gradeGroup: GradeGroup.LOWER, language: Language.BOTH }),
      makeMember('L-BOTH-2', { gradeGroup: GradeGroup.LOWER, language: Language.BOTH }),
      makeMember('L-BOTH-3', { gradeGroup: GradeGroup.LOWER, language: Language.BOTH }),
    ];

    const schedule = makeSchedule('2026-04-05').toggleSplitClass();
    const counts = new Map<MemberId, number>();
    members.forEach((m) => counts.set(m.id, 0));

    const { assignments } = generateAssignments([schedule], members, [], counts);
    expect(assignments.length).toBeGreaterThan(0);

    // Group 1 (UPPER) should contain at least one LOWER BOTH member (crossover)
    const group1 = assignments.find((a) => a.groupNumber === 1);
    expect(group1).toBeDefined();
    if (group1) {
      const lowerBothInGroup1 = group1.memberIds.some((mid) => {
        const m = members.find((mem) => mem.id === mid);
        return m?.gradeGroup === GradeGroup.LOWER && m?.language === Language.BOTH;
      });
      expect(lowerBothInGroup1).toBe(true);
    }
  });

  it('does not allow non-BOTH members to cross grade groups even on split-class days (T5)', () => {
    const members = [
      makeMember('U-BOTH-1', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
      makeMember('U-BOTH-2', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
      makeMember('U-BOTH-3', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
      makeMember('U-JP-1', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
      makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
      makeMember('L-EN-1', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
    ];

    const schedule = makeSchedule('2026-04-05').toggleSplitClass();
    const counts = new Map<MemberId, number>();
    members.forEach((m) => counts.set(m.id, 0));

    const { assignments } = generateAssignments([schedule], members, [], counts);

    // Non-BOTH UPPER member (U-JP-1) should never appear in group 2 (LOWER group)
    const nonBothUpper = members.find((m) => m.name === 'U-JP-1')!;
    const group2 = assignments.filter((a) => a.groupNumber === 2);
    for (const a of group2) {
      expect(a.memberIds).not.toContain(nonBothUpper.id);
    }
  });

  it('avoids pairing spouses in the same group', () => {
    const spouseId1 = createMemberId();
    const spouseId2 = createMemberId();

    // Create 6 members — enough so the algorithm has alternatives
    const m1 = Member.reconstruct({
      id: spouseId1,
      name: 'Husband',
      gender: Gender.MALE,
      language: Language.BOTH,
      gradeGroup: GradeGroup.UPPER,
      memberType: MemberType.PARENT_COUPLE,
      sameGenderOnly: false,
      spouseId: spouseId2,
      availableDates: null,
      isActive: true,
    });
    const m2 = Member.reconstruct({
      id: spouseId2,
      name: 'Wife',
      gender: Gender.FEMALE,
      language: Language.BOTH,
      gradeGroup: GradeGroup.LOWER,
      memberType: MemberType.PARENT_COUPLE,
      sameGenderOnly: false,
      spouseId: spouseId1,
      availableDates: null,
      isActive: true,
    });
    const m3 = makeMember('Other-Upper-1', {
      gradeGroup: GradeGroup.UPPER,
      language: Language.BOTH,
    });
    const m4 = makeMember('Other-Lower-1', {
      gradeGroup: GradeGroup.LOWER,
      language: Language.BOTH,
    });

    const members = [m1, m2, m3, m4];
    const schedules = [makeSchedule('2026-04-05')];
    const counts = new Map<MemberId, number>();
    members.forEach((m) => counts.set(m.id, 0));

    const { assignments } = generateAssignments(schedules, members, [], counts);

    // Spouses should not be in the same group
    for (const a of assignments) {
      const ids = a.memberIds;
      const hasSpousePair =
        (ids[0] === spouseId1 && ids[1] === spouseId2) ||
        (ids[0] === spouseId2 && ids[1] === spouseId1);
      expect(hasSpousePair).toBe(false);
    }
  });

  describe('BOTH conservation', () => {
    it('prefers BOTH+JP over BOTH+BOTH on normal days when both satisfy language balance', () => {
      const members = [
        makeMember('U-BOTH-1', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
        makeMember('U-BOTH-2', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
        makeMember('U-JP-1', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN-1', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
      ];

      const schedule = makeSchedule('2026-04-05'); // normal day
      const counts = new Map<MemberId, number>();
      members.forEach((m) => counts.set(m.id, 0));

      const { assignments } = generateAssignments([schedule], members, [], counts);
      const group1 = assignments.find((a) => a.groupNumber === 1);
      expect(group1).toBeDefined();
      if (group1) {
        const bothCount = group1.memberIds.filter((mid) => {
          const m = members.find((mem) => mem.id === mid);
          return m?.language === Language.BOTH;
        }).length;
        // Should prefer BOTH+JP (score +3) over BOTH+BOTH (score +6)
        expect(bothCount).toBe(1);
      }
    });

    it('still selects BOTH when required for language balance even with conservation penalty', () => {
      // UPPER has no EN members, so BOTH is required for English coverage
      const members = [
        makeMember('U-BOTH-1', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
        makeMember('U-JP-1', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('U-JP-2', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN-1', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
      ];

      const schedule = makeSchedule('2026-04-05');
      const counts = new Map<MemberId, number>();
      members.forEach((m) => counts.set(m.id, 0));

      const { assignments } = generateAssignments([schedule], members, [], counts);
      const group1 = assignments.find((a) => a.groupNumber === 1);
      expect(group1).toBeDefined();
      if (group1) {
        // BOTH must be selected despite conservation penalty (language balance requires it)
        const hasBoth = group1.memberIds.some((mid) => {
          const m = members.find((mem) => mem.id === mid);
          return m?.language === Language.BOTH;
        });
        expect(hasBoth).toBe(true);
      }
    });

    it('prefers BOTH+JP over BOTH+BOTH in Group 1 on split-class days (T3)', () => {
      // G1 should pick exactly 1 BOTH to conserve BOTH members
      // BOTH+JP (score 0) preferred over BOTH+BOTH (score +3)
      const members = [
        makeMember('U-BOTH-1', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
        makeMember('U-BOTH-2', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
        makeMember('U-JP-1', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('L-BOTH-1', { gradeGroup: GradeGroup.LOWER, language: Language.BOTH }),
        makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
      ];

      const schedule = makeSchedule('2026-04-05').toggleSplitClass();
      const counts = new Map<MemberId, number>();
      members.forEach((m) => counts.set(m.id, 0));

      const { assignments } = generateAssignments([schedule], members, [], counts);
      const group1 = assignments.find((a) => a.groupNumber === 1);
      expect(group1).toBeDefined();
      if (group1) {
        const bothCount = group1.memberIds.filter((mid) => {
          const m = members.find((mem) => mem.id === mid);
          return m?.language === Language.BOTH;
        }).length;
        // Group 1: BOTH+JP (score 0) preferred over BOTH+BOTH (score +3)
        expect(bothCount).toBe(1);
      }
    });

    it('Group 2 has no BOTH preference, hard constraint ensures coverage (T4)', () => {
      // G1 picks BOTH+JP (1 BOTH, score 0) over BOTH+BOTH (score +3)
      // G2 hard constraint forces 1 BOTH to meet CLASS_LANGUAGE_COVERAGE
      const members = [
        makeMember('U-BOTH-1', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
        makeMember('U-BOTH-2', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
        makeMember('U-JP-1', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('L-BOTH-1', { gradeGroup: GradeGroup.LOWER, language: Language.BOTH }),
        makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN-1', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
      ];

      const schedule = makeSchedule('2026-04-05').toggleSplitClass();
      const counts = new Map<MemberId, number>();
      members.forEach((m) => counts.set(m.id, 0));

      const { assignments, violations } = generateAssignments([schedule], members, [], counts);
      // No CLASS_LANGUAGE_COVERAGE violation
      const classViolations = violations.filter(
        (v) => v.type === ViolationType.CLASS_LANGUAGE_COVERAGE,
      );
      expect(classViolations).toHaveLength(0);

      // G2 doesn't need BOTH — L-JP + L-EN is acceptable
      const group2 = assignments.find((a) => a.groupNumber === 2);
      expect(group2).toBeDefined();
    });

    it('Group 2 hard constraint forces BOTH when G1 has only 1 BOTH (T5)', () => {
      // G1 has only 1 BOTH → G2 must provide 1 BOTH via hard constraint
      const members = [
        makeMember('U-BOTH-1', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
        makeMember('U-JP-1', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('U-EN-1', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH }),
        makeMember('L-BOTH-1', { gradeGroup: GradeGroup.LOWER, language: Language.BOTH }),
        makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN-1', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
      ];

      const schedule = makeSchedule('2026-04-05').toggleSplitClass();
      const counts = new Map<MemberId, number>();
      members.forEach((m) => counts.set(m.id, 0));

      const { assignments, violations } = generateAssignments([schedule], members, [], counts);

      // G1 picks BOTH+JP or BOTH+EN (1 BOTH, score -3)
      const group1 = assignments.find((a) => a.groupNumber === 1);
      expect(group1).toBeDefined();

      // G2 must have BOTH to meet CLASS_LANGUAGE_COVERAGE (hard constraint)
      const group2 = assignments.find((a) => a.groupNumber === 2);
      expect(group2).toBeDefined();
      if (group2) {
        const hasBoth = group2.memberIds.some((mid) => {
          const m = members.find((mem) => mem.id === mid);
          return m?.language === Language.BOTH;
        });
        expect(hasBoth).toBe(true);
      }

      // No CLASS_LANGUAGE_COVERAGE violation
      const classViolations = violations.filter(
        (v) => v.type === ViolationType.CLASS_LANGUAGE_COVERAGE,
      );
      expect(classViolations).toHaveLength(0);
    });

    it('no UPPER BOTH member repeats across 4 dates (T6)', () => {
      // 5 BOTH + 8 JP in UPPER, 2 BOTH + 4 JP + 4 EN in LOWER
      // 4 dates: 2 normal, 2 split-class
      // G1 uses exactly 1 BOTH per day → 4 slots / 5 BOTH → no repeats
      const members = [
        makeMember('U-BOTH-1', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
        makeMember('U-BOTH-2', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
        makeMember('U-BOTH-3', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
        makeMember('U-BOTH-4', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
        makeMember('U-BOTH-5', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
        makeMember('U-JP-1', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('U-JP-2', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('U-JP-3', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('U-JP-4', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('U-JP-5', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('U-JP-6', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('U-JP-7', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('U-JP-8', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('L-BOTH-1', { gradeGroup: GradeGroup.LOWER, language: Language.BOTH }),
        makeMember('L-BOTH-2', { gradeGroup: GradeGroup.LOWER, language: Language.BOTH }),
        makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-JP-2', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-JP-3', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-JP-4', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN-1', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
        makeMember('L-EN-2', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
        makeMember('L-EN-3', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
        makeMember('L-EN-4', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
      ];

      const schedules = [
        makeSchedule('2026-04-05'),
        makeSchedule('2026-04-12').toggleSplitClass(),
        makeSchedule('2026-04-19').toggleSplitClass(),
        makeSchedule('2026-04-26'),
      ];

      const counts = new Map<MemberId, number>();
      members.forEach((m) => counts.set(m.id, 0));

      const { assignments } = generateAssignments(schedules, members, [], counts);

      // Each UPPER BOTH member should be assigned at most once
      const upperBothIds = new Set(
        members.filter((m) => m.gradeGroup === GradeGroup.UPPER && m.language === Language.BOTH).map((m) => m.id),
      );
      const upperBothCounts = new Map<string, number>();
      for (const a of assignments) {
        if (a.groupNumber === 1) {
          for (const mid of a.memberIds) {
            if (upperBothIds.has(mid)) {
              upperBothCounts.set(mid, (upperBothCounts.get(mid) ?? 0) + 1);
            }
          }
        }
      }

      for (const [, count] of upperBothCounts) {
        expect(count).toBe(1);
      }
    });
  });

  describe('ANY grade group', () => {
    it('ANY member appears in both UPPER and LOWER pools (T1)', () => {
      // UPPER has its own EN, LOWER has its own EN, so ANY-EN can go either way
      const members = [
        makeMember('U-JP-1', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('U-EN-1', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH }),
        makeMember('ANY-EN-1', { gradeGroup: GradeGroup.ANY, language: Language.ENGLISH }),
        makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN-1', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
      ];

      const schedule = makeSchedule('2026-04-05');
      const anyMember = members.find((m) => m.name === 'ANY-EN-1')!;

      // ANY is in both pools. G1 picks from upperPool (U-JP-1, U-EN-1, ANY-EN-1).
      // If ANY is picked for G1 → inGroup1. If not → ANY remains in lowerPool for G2.
      let inGroup1 = false;
      let inGroup2 = false;

      for (let run = 0; run < 30; run++) {
        const runCounts = new Map<MemberId, number>();
        members.forEach((m) => runCounts.set(m.id, 0));
        const { assignments } = generateAssignments([schedule], members, [], runCounts);
        for (const a of assignments) {
          if (a.memberIds.includes(anyMember.id)) {
            if (a.groupNumber === 1) inGroup1 = true;
            if (a.groupNumber === 2) inGroup2 = true;
          }
        }
        if (inGroup1 && inGroup2) break;
      }

      expect(inGroup1).toBe(true);
      expect(inGroup2).toBe(true);
    });

    it('ANY member used in G1 is excluded from G2 on same day via usedIds (T2)', () => {
      // Only 2 UPPER + ANY + 2 LOWER — ANY will be needed for G1
      const members = [
        makeMember('U-JP-1', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('ANY-EN-1', { gradeGroup: GradeGroup.ANY, language: Language.ENGLISH }),
        makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN-1', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
      ];

      const schedule = makeSchedule('2026-04-05');

      for (let run = 0; run < 30; run++) {
        const counts = new Map<MemberId, number>();
        members.forEach((m) => counts.set(m.id, 0));
        const { assignments } = generateAssignments([schedule], members, [], counts);

        // ANY member must not appear in both groups on the same day
        const anyMember = members.find((m) => m.name === 'ANY-EN-1')!;
        const dayAssignments = assignments.filter((a) => a.scheduleId === schedule.id);
        const appearances = dayAssignments.filter((a) => a.memberIds.includes(anyMember.id));
        expect(appearances.length).toBeLessThanOrEqual(1);
      }
    });

    it('split-class day: ANY+BOTH member contributes to CLASS_LANGUAGE_COVERAGE (T3)', () => {
      // ANY-BOTH goes into both pools. With L-BOTH-1 in LOWER, G2 always has BOTH coverage
      // regardless of whether ANY-BOTH is used in G1 or G2.
      const members = [
        makeMember('U-BOTH-1', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
        makeMember('U-JP-1', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('ANY-BOTH-1', { gradeGroup: GradeGroup.ANY, language: Language.BOTH }),
        makeMember('L-BOTH-1', { gradeGroup: GradeGroup.LOWER, language: Language.BOTH }),
        makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
      ];

      const schedule = makeSchedule('2026-04-05').toggleSplitClass();

      for (let run = 0; run < 20; run++) {
        const counts = new Map<MemberId, number>();
        members.forEach((m) => counts.set(m.id, 0));

        const { violations } = generateAssignments([schedule], members, [], counts);
        const classViolations = violations.filter(
          (v) => v.type === ViolationType.CLASS_LANGUAGE_COVERAGE,
        );
        expect(classViolations).toHaveLength(0);
      }
    });

    it('existing behavior unchanged when no ANY members present (T4)', () => {
      // Same as basic test — no ANY members
      const members = [
        makeMember('U-JP-1', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('U-EN-1', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH }),
        makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN-1', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
      ];

      const schedule = makeSchedule('2026-04-05');
      const counts = new Map<MemberId, number>();
      members.forEach((m) => counts.set(m.id, 0));

      const { assignments } = generateAssignments([schedule], members, [], counts);
      expect(assignments.length).toBe(2);

      for (const a of assignments) {
        if (a.groupNumber === 1) {
          for (const mid of a.memberIds) {
            const m = members.find((mem) => mem.id === mid)!;
            expect(m.gradeGroup).toBe(GradeGroup.UPPER);
          }
        } else {
          for (const mid of a.memberIds) {
            const m = members.find((mem) => mem.id === mid)!;
            expect(m.gradeGroup).toBe(GradeGroup.LOWER);
          }
        }
      }
    });
  });

  describe('HELPER deferral', () => {
    it('prefers PARENT pair over HELPER pair when all else is equal (T1)', () => {
      // UPPER: JP-Parent, EN-Parent, EN-Helper — all count=0
      // Parent pair (JP+EN score=0) vs Helper pair (JP+ENHelper score=+5)
      const members = [
        makeMember('U-JP-Parent', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE, memberType: MemberType.PARENT_SINGLE }),
        makeMember('U-EN-Parent', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH, memberType: MemberType.PARENT_SINGLE }),
        makeMember('U-EN-Helper', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH, memberType: MemberType.HELPER }),
        makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN-1', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
      ];

      const schedule = makeSchedule('2026-04-05');
      const helperId = members.find((m) => m.name === 'U-EN-Helper')!.id;
      let helperSelectedCount = 0;
      const runs = 30;

      for (let run = 0; run < runs; run++) {
        const counts = new Map<MemberId, number>();
        members.forEach((m) => counts.set(m.id, 0));
        const { assignments } = generateAssignments([schedule], members, [], counts);
        const group1 = assignments.find((a) => a.groupNumber === 1);
        if (group1?.memberIds.includes(helperId)) {
          helperSelectedCount++;
        }
      }

      // Helper should be selected much less often than parents
      expect(helperSelectedCount).toBeLessThan(runs * 0.3);
    });

    it('selects HELPER when their count is sufficiently lower than parents (T2)', () => {
      // Helper count=0, Parents count=2 → equal distribution penalty overcomes helper deferral
      const members = [
        makeMember('U-JP-Parent', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE, memberType: MemberType.PARENT_SINGLE }),
        makeMember('U-EN-Parent', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH, memberType: MemberType.PARENT_SINGLE }),
        makeMember('U-EN-Helper', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH, memberType: MemberType.HELPER }),
        makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN-1', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
      ];

      const schedule = makeSchedule('2026-04-05');
      const helperId = members.find((m) => m.name === 'U-EN-Helper')!.id;
      let helperSelectedCount = 0;
      const runs = 30;

      for (let run = 0; run < runs; run++) {
        const counts = new Map<MemberId, number>();
        members.forEach((m) => counts.set(m.id, 0));
        // Parents have higher counts
        counts.set(members[0].id, 2);
        counts.set(members[1].id, 2);

        const { assignments } = generateAssignments([schedule], members, [], counts);
        const group1 = assignments.find((a) => a.groupNumber === 1);
        if (group1?.memberIds.includes(helperId)) {
          helperSelectedCount++;
        }
      }

      // Helper should be selected most of the time (equal distribution wins)
      expect(helperSelectedCount).toBeGreaterThan(runs * 0.7);
    });

    it('hard constraints are always respected despite helper deferral (T3)', () => {
      const members = [
        makeMember('U-BOTH-Parent', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH, memberType: MemberType.PARENT_SINGLE }),
        makeMember('U-JP-Parent', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE, memberType: MemberType.PARENT_SINGLE }),
        makeMember('U-EN-Helper', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH, memberType: MemberType.HELPER }),
        makeMember('L-BOTH-1', { gradeGroup: GradeGroup.LOWER, language: Language.BOTH }),
        makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN-1', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
      ];

      for (let run = 0; run < 50; run++) {
        const schedule = makeSchedule('2026-04-05');
        const counts = new Map<MemberId, number>();
        members.forEach((m) => counts.set(m.id, 0));
        const { assignments } = generateAssignments([schedule], members, [], counts);

        for (const a of assignments) {
          const pair = a.memberIds.map((mid) => members.find((m) => m.id === mid)!);
          const hasJP = pair.some((m) =>
            m.language === Language.JAPANESE || m.language === Language.BOTH,
          );
          const hasEN = pair.some((m) =>
            m.language === Language.ENGLISH || m.language === Language.BOTH,
          );
          expect(hasJP).toBe(true);
          expect(hasEN).toBe(true);
        }
      }
    });
  });

  describe('pool-relative distribution', () => {
    it('pool-uniform counts produce no distribution penalty bias (T1)', () => {
      // All UPPER count=3, all LOWER count=5 — within each pool, counts are equal
      // So distribution penalty should not favor any pair within the pool
      const members = [
        makeMember('U-JP-1', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('U-EN-1', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH }),
        makeMember('U-JP-2', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN-1', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
        makeMember('L-JP-2', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN-2', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
      ];

      const schedule = makeSchedule('2026-04-05');
      // UPPER all at count=3, LOWER all at count=5
      const counts = new Map<MemberId, number>();
      members.filter((m) => m.gradeGroup === GradeGroup.UPPER).forEach((m) => counts.set(m.id, 3));
      members.filter((m) => m.gradeGroup === GradeGroup.LOWER).forEach((m) => counts.set(m.id, 5));

      // Run multiple times — all valid pairs should appear (no distribution bias)
      const g2Pairs = new Set<string>();
      for (let run = 0; run < 30; run++) {
        const runCounts = new Map(counts);
        const { assignments } = generateAssignments([schedule], members, [], runCounts);
        const group2 = assignments.find((a) => a.groupNumber === 2);
        if (group2) {
          g2Pairs.add([...group2.memberIds].sort().join(','));
        }
      }

      // With 4 LOWER members (2JP+2EN), there are 4 valid JP+EN pairs
      // With no distribution bias, shuffle should produce multiple pairs
      expect(g2Pairs.size).toBeGreaterThanOrEqual(2);
    });

    it('lower count member in pool is preferred over higher count (T2)', () => {
      // UPPER: JP(count=0), EN(count=3), EN(count=0)
      // Pool min = 0, so EN(count=3) has +150 penalty, EN(count=0) has 0
      const members = [
        makeMember('U-JP', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('U-EN-High', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH }),
        makeMember('U-EN-Low', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH }),
        makeMember('L-JP', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
      ];

      const schedule = makeSchedule('2026-04-05');
      const highMember = members.find((m) => m.name === 'U-EN-High')!;
      const lowMember = members.find((m) => m.name === 'U-EN-Low')!;

      let lowSelected = 0;
      const runs = 20;
      for (let run = 0; run < runs; run++) {
        const counts = new Map<MemberId, number>();
        members.forEach((m) => counts.set(m.id, 0));
        counts.set(highMember.id, 3);

        const { assignments } = generateAssignments([schedule], members, [], counts);
        const group1 = assignments.find((a) => a.groupNumber === 1);
        if (group1?.memberIds.includes(lowMember.id)) lowSelected++;
      }

      // Low count member should be strongly preferred
      expect(lowSelected).toBeGreaterThan(runs * 0.8);
    });

    it('cross-pool count difference does not affect penalty (T3)', () => {
      // UPPER all count=2, LOWER all count=5
      // Under pool-relative: LOWER penalty = 0 (pool min = 5)
      // All LOWER members are equally likely regardless of UPPER having lower counts
      const members = [
        makeMember('U-JP', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('U-EN', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH }),
        makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN-1', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
        makeMember('L-JP-2', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN-2', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
      ];

      const schedule = makeSchedule('2026-04-05');

      const g2Pairs = new Set<string>();
      for (let run = 0; run < 30; run++) {
        const counts = new Map<MemberId, number>();
        members.filter((m) => m.gradeGroup === GradeGroup.UPPER).forEach((m) => counts.set(m.id, 2));
        members.filter((m) => m.gradeGroup === GradeGroup.LOWER).forEach((m) => counts.set(m.id, 5));

        const { assignments } = generateAssignments([schedule], members, [], counts);
        const group2 = assignments.find((a) => a.groupNumber === 2);
        if (group2) {
          g2Pairs.add([...group2.memberIds].sort().join(','));
        }
      }

      // All 4 valid JP+EN pairs should appear — no bias from cross-pool count diff
      expect(g2Pairs.size).toBeGreaterThanOrEqual(2);
    });

    it('hard constraints are always respected (T4)', () => {
      const members = [
        makeMember('U-BOTH', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
        makeMember('U-JP', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('L-BOTH', { gradeGroup: GradeGroup.LOWER, language: Language.BOTH }),
        makeMember('L-JP', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
      ];

      for (let run = 0; run < 50; run++) {
        const schedule = makeSchedule('2026-04-05');
        const counts = new Map<MemberId, number>();
        members.forEach((m) => counts.set(m.id, run % 5)); // varying counts
        const { assignments } = generateAssignments([schedule], members, [], counts);

        for (const a of assignments) {
          const pair = a.memberIds.map((mid) => members.find((m) => m.id === mid)!);
          const hasJP = pair.some((m) =>
            m.language === Language.JAPANESE || m.language === Language.BOTH,
          );
          const hasEN = pair.some((m) =>
            m.language === Language.ENGLISH || m.language === Language.BOTH,
          );
          expect(hasJP).toBe(true);
          expect(hasEN).toBe(true);
        }
      }
    });
  });

  describe('shuffle tiebreak', () => {
    it('produces different pairs across multiple runs when scores are tied (T1)', () => {
      // 4 LOWER members, all score=0 pairs: JP+EN combinations
      const members = [
        makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN-1', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
        makeMember('L-JP-2', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN-2', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
        // Need UPPER members too for Group 1
        makeMember('U-BOTH-1', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
        makeMember('U-JP-1', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
      ];

      const schedule = makeSchedule('2026-04-05');
      const selectedPairs = new Set<string>();

      for (let run = 0; run < 20; run++) {
        const counts = new Map<MemberId, number>();
        members.forEach((m) => counts.set(m.id, 0));
        const { assignments } = generateAssignments([schedule], members, [], counts);
        const group2 = assignments.find((a) => a.groupNumber === 2);
        if (group2) {
          const pairId = [...group2.memberIds].sort().join(',');
          selectedPairs.add(pairId);
        }
      }

      // With 4 valid JP+EN pairs, shuffle should produce at least 2 different pairs in 20 runs
      expect(selectedPairs.size).toBeGreaterThanOrEqual(2);
    });

    it('always respects hard constraints despite randomization (T2)', () => {
      const members = [
        makeMember('U-BOTH-1', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
        makeMember('U-JP-1', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('U-JP-2', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('L-BOTH-1', { gradeGroup: GradeGroup.LOWER, language: Language.BOTH }),
        makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN-1', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
      ];

      for (let run = 0; run < 50; run++) {
        const schedule = makeSchedule('2026-04-05');
        const counts = new Map<MemberId, number>();
        members.forEach((m) => counts.set(m.id, 0));
        const { assignments } = generateAssignments([schedule], members, [], counts);

        for (const a of assignments) {
          const pair = a.memberIds.map((mid) => members.find((m) => m.id === mid)!);
          // Language balance: each pair must cover both Japanese and English
          const hasJP = pair.some((m) =>
            m.language === Language.JAPANESE || m.language === Language.BOTH,
          );
          const hasEN = pair.some((m) =>
            m.language === Language.ENGLISH || m.language === Language.BOTH,
          );
          expect(hasJP).toBe(true);
          expect(hasEN).toBe(true);
        }
      }
    });

    it('equal distribution is maintained despite randomization (T3)', () => {
      const members = [
        makeMember('U-BOTH-1', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
        makeMember('U-BOTH-2', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
        makeMember('U-JP-1', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('U-JP-2', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('L-BOTH-1', { gradeGroup: GradeGroup.LOWER, language: Language.BOTH }),
        makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN-1', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
        makeMember('L-EN-2', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
      ];

      // Give some members higher counts — they should be less likely to be selected
      const counts = new Map<MemberId, number>();
      members.forEach((m) => counts.set(m.id, 0));
      const highCountMember = members.find((m) => m.name === 'U-JP-1')!;
      counts.set(highCountMember.id, 5);

      const schedule = makeSchedule('2026-04-05');
      let highCountSelected = 0;
      const runs = 30;

      for (let run = 0; run < runs; run++) {
        const runCounts = new Map(counts);
        const { assignments } = generateAssignments([schedule], members, [], runCounts);
        const group1 = assignments.find((a) => a.groupNumber === 1);
        if (group1?.memberIds.includes(highCountMember.id)) {
          highCountSelected++;
        }
      }

      // Member with count=5 should rarely be selected (others have count=0)
      // Equal distribution penalty: (5-0)*50 = 250 makes them very unlikely
      expect(highCountSelected).toBeLessThan(runs * 0.3);
    });
  });
});
