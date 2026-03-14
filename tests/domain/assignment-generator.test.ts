import { describe, it, expect } from 'vitest';
import { Member } from '@domain/entities/member';
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
});
