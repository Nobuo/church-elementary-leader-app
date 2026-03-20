import { describe, it, expect } from 'vitest';
import { Member } from '@domain/entities/member';
import { Assignment } from '@domain/entities/assignment';
import { Schedule } from '@domain/entities/schedule';
import { Gender } from '@domain/value-objects/gender';
import { Language } from '@domain/value-objects/language';
import { GradeGroup } from '@domain/value-objects/grade-group';
import { MemberType } from '@domain/value-objects/member-type';
import { MemberId, createMemberId } from '@shared/types';
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

    const { assignments } = generateAssignments([schedule], members, [], counts);
    expect(assignments.length).toBeGreaterThan(0);

    // Group 2 (LOWER) should contain at least one UPPER BOTH member (crossover)
    const group2 = assignments.find((a) => a.groupNumber === 2);
    expect(group2).toBeDefined();
    if (group2) {
      const upperBothInGroup2 = group2.memberIds.some((mid) => {
        const m = members.find((mem) => mem.id === mid);
        return m?.gradeGroup === GradeGroup.UPPER && m?.language === Language.BOTH;
      });
      expect(upperBothInGroup2).toBe(true);
    }
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

    it('prefers BOTH+JP over BOTH+BOTH in Group 1 on split-class days', () => {
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
        // Group 1: BOTH+JP (score -1) preferred over BOTH+BOTH (score +5)
        expect(bothCount).toBe(1);
      }
    });

    it('Group 2 prefers BOTH+BOTH on split-class days for bilingual coverage', () => {
      const members = [
        makeMember('U-BOTH-1', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
        makeMember('U-JP-1', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('L-BOTH-1', { gradeGroup: GradeGroup.LOWER, language: Language.BOTH }),
        makeMember('L-BOTH-2', { gradeGroup: GradeGroup.LOWER, language: Language.BOTH }),
        makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
      ];

      const schedule = makeSchedule('2026-04-05').toggleSplitClass();
      const counts = new Map<MemberId, number>();
      members.forEach((m) => counts.set(m.id, 0));

      const { assignments } = generateAssignments([schedule], members, [], counts);
      const group2 = assignments.find((a) => a.groupNumber === 2);
      expect(group2).toBeDefined();
      if (group2) {
        const bothCount = group2.memberIds.filter((mid) => {
          const m = members.find((mem) => mem.id === mid);
          return m?.language === Language.BOTH;
        }).length;
        // Group 2: BOTH+BOTH (score -10) preferred for bilingual coverage
        expect(bothCount).toBe(2);
      }
    });

    it('no monthly duplicate when BOTH members are conserved across 4 dates', () => {
      // 5 BOTH + 8 JP in UPPER, 4 dates → should use each BOTH once
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

      // Each UPPER member should be assigned at most once
      const upperMemberCounts = new Map<string, number>();
      const upperIds = new Set(members.filter((m) => m.gradeGroup === GradeGroup.UPPER).map((m) => m.id));
      for (const a of assignments) {
        if (a.groupNumber === 1) {
          for (const mid of a.memberIds) {
            if (upperIds.has(mid)) {
              upperMemberCounts.set(mid, (upperMemberCounts.get(mid) ?? 0) + 1);
            }
          }
        }
      }

      for (const [, count] of upperMemberCounts) {
        expect(count).toBe(1);
      }
    });
  });
});
