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

function makeSplitSchedule(date: string): Schedule {
  return makeSchedule(date).toggleSplitClass();
}

describe('generateAssignments', () => {
  describe('split-class day (2 groups × 2 members)', () => {
    it('generates assignments for a month with enough members', () => {
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

      const schedules = [makeSplitSchedule('2026-04-05'), makeSplitSchedule('2026-04-12')];
      const counts = new Map<MemberId, number>();
      members.forEach((m) => counts.set(m.id, 0));

      const { assignments } = generateAssignments(schedules, members, [], counts);

      // 2 days × 2 groups = 4 assignments
      expect(assignments.length).toBe(4);
      for (const a of assignments) {
        expect(a.memberIds.length).toBe(2);
      }

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

      const schedules = [makeSplitSchedule('2026-04-05')];
      const counts = new Map<MemberId, number>();
      members.forEach((m) => counts.set(m.id, 0));

      const { assignments } = generateAssignments(schedules, members, [], counts);

      for (const a of assignments) {
        const assignedMembers = a.memberIds.map((mid) => members.find((m) => m.id === mid)!);
        const hasJP = assignedMembers.some(
          (m) => m.language === Language.JAPANESE || m.language === Language.BOTH,
        );
        const hasEN = assignedMembers.some(
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

      const schedule = makeSplitSchedule('2026-04-05');
      const counts = new Map<MemberId, number>();
      members.forEach((m) => counts.set(m.id, 0));

      const { assignments } = generateAssignments([schedule], members, [], counts);
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

    it('does not cross on split-class day when each grade has enough BOTH (T3)', () => {
      const members = [
        makeMember('U-BOTH-1', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
        makeMember('U-JP-1', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('U-EN-1', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH }),
        makeMember('L-BOTH-1', { gradeGroup: GradeGroup.LOWER, language: Language.BOTH }),
        makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN-1', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
      ];

      const schedule = makeSplitSchedule('2026-04-05');
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
      const members = [
        makeMember('U-BOTH-1', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
        makeMember('U-BOTH-2', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
        makeMember('U-BOTH-3', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
        makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN-1', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
      ];

      const schedule = makeSplitSchedule('2026-04-05');
      const counts = new Map<MemberId, number>();
      members.forEach((m) => counts.set(m.id, 0));

      const { assignments, violations } = generateAssignments([schedule], members, [], counts);
      expect(assignments.length).toBe(2);
      const classViolations = violations.filter(
        (v) => v.type === ViolationType.CLASS_LANGUAGE_COVERAGE,
      );
      expect(classViolations).toHaveLength(0);
    });

    it('allows BOTH members to cross from LOWER to UPPER group on split-class days when UPPER lacks bilinguals (T6)', () => {
      const members = [
        makeMember('U-JP-1', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('U-EN-1', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH }),
        makeMember('L-BOTH-1', { gradeGroup: GradeGroup.LOWER, language: Language.BOTH }),
        makeMember('L-BOTH-2', { gradeGroup: GradeGroup.LOWER, language: Language.BOTH }),
        makeMember('L-BOTH-3', { gradeGroup: GradeGroup.LOWER, language: Language.BOTH }),
      ];

      const schedule = makeSplitSchedule('2026-04-05');
      const counts = new Map<MemberId, number>();
      members.forEach((m) => counts.set(m.id, 0));

      const { assignments } = generateAssignments([schedule], members, [], counts);
      expect(assignments.length).toBeGreaterThan(0);

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

      const schedule = makeSplitSchedule('2026-04-05');
      const counts = new Map<MemberId, number>();
      members.forEach((m) => counts.set(m.id, 0));

      const { assignments } = generateAssignments([schedule], members, [], counts);
      const nonBothUpper = members.find((m) => m.name === 'U-JP-1')!;
      const group2 = assignments.filter((a) => a.groupNumber === 2);
      for (const a of group2) {
        expect(a.memberIds).not.toContain(nonBothUpper.id);
      }
    });
  });

  describe('combined day (1 group × 3 members)', () => {
    it('generates 1 assignment with 3 members per combined day', () => {
      const members = [
        makeMember('M1-JP', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('M2-EN', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH }),
        makeMember('M3-BOTH', { gradeGroup: GradeGroup.LOWER, language: Language.BOTH }),
        makeMember('M4-JP', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('M5-EN', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH }),
      ];

      const schedules = [makeSchedule('2026-04-05'), makeSchedule('2026-04-12')];
      const counts = new Map<MemberId, number>();
      members.forEach((m) => counts.set(m.id, 0));

      const { assignments } = generateAssignments(schedules, members, [], counts);

      // 2 combined days × 1 group = 2 assignments
      expect(assignments.length).toBe(2);
      for (const a of assignments) {
        expect(a.memberIds.length).toBe(3);
        expect(a.groupNumber).toBe(1);
      }
    });

    it('mixes UPPER and LOWER members on combined days', () => {
      const members = [
        makeMember('U-JP', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('U-EN', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH }),
        makeMember('U-BOTH', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
        makeMember('L-JP', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
        makeMember('L-BOTH', { gradeGroup: GradeGroup.LOWER, language: Language.BOTH }),
      ];

      const schedule = makeSchedule('2026-04-05');

      // Over many runs, we should see both UPPER and LOWER in the same group
      let hasMixed = false;
      for (let run = 0; run < 20; run++) {
        const counts = new Map<MemberId, number>();
        members.forEach((m) => counts.set(m.id, 0));
        const { assignments } = generateAssignments([schedule], members, [], counts);
        const a = assignments[0];
        const grades = a.memberIds.map((mid) => members.find((m) => m.id === mid)!.gradeGroup);
        if (grades.includes(GradeGroup.UPPER) && grades.includes(GradeGroup.LOWER)) {
          hasMixed = true;
          break;
        }
      }
      expect(hasMixed).toBe(true);
    });

    it('ensures language balance in 3-member combined group', () => {
      const members = [
        makeMember('M1-JP', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('M2-EN', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
        makeMember('M3-JP', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('M4-EN', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
        makeMember('M5-BOTH', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
      ];

      const schedule = makeSchedule('2026-04-05');

      for (let run = 0; run < 30; run++) {
        const counts = new Map<MemberId, number>();
        members.forEach((m) => counts.set(m.id, 0));
        const { assignments } = generateAssignments([schedule], members, [], counts);

        for (const a of assignments) {
          const groupMembers = a.memberIds.map((mid) => members.find((m) => m.id === mid)!);
          const hasJP = groupMembers.some(
            (m) => m.language === Language.JAPANESE || m.language === Language.BOTH,
          );
          const hasEN = groupMembers.some(
            (m) => m.language === Language.ENGLISH || m.language === Language.BOTH,
          );
          expect(hasJP).toBe(true);
          expect(hasEN).toBe(true);
        }
      }
    });

    it('does NOT apply same-gender constraint on combined day (3 members)', () => {
      // sameGenderOnly member should still be placed with mixed genders in 3-member group
      const members = [
        makeMember('M1-F-SGO', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH, gender: Gender.FEMALE, sameGenderOnly: true }),
        makeMember('M2-M', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE, gender: Gender.MALE }),
        makeMember('M3-F', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH, gender: Gender.FEMALE }),
      ];

      const schedule = makeSchedule('2026-04-05');
      const counts = new Map<MemberId, number>();
      members.forEach((m) => counts.set(m.id, 0));

      const { assignments } = generateAssignments([schedule], members, [], counts);
      expect(assignments.length).toBe(1);
      expect(assignments[0].memberIds.length).toBe(3);
    });

    it('avoids spouses in the same combined group', () => {
      const spouseId1 = createMemberId();
      const spouseId2 = createMemberId();

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
      const m3 = makeMember('Other-1', { language: Language.BOTH });
      const m4 = makeMember('Other-2', { gradeGroup: GradeGroup.LOWER, language: Language.BOTH });
      const m5 = makeMember('Other-3', { language: Language.JAPANESE });

      const members = [m1, m2, m3, m4, m5];
      const schedule = makeSchedule('2026-04-05');

      let spousesTogether = 0;
      for (let run = 0; run < 30; run++) {
        const counts = new Map<MemberId, number>();
        members.forEach((m) => counts.set(m.id, 0));
        const { assignments } = generateAssignments([schedule], members, [], counts);
        for (const a of assignments) {
          if (a.memberIds.includes(spouseId1) && a.memberIds.includes(spouseId2)) {
            spousesTogether++;
          }
        }
      }
      // Spouses should almost never be together (penalty +30)
      expect(spousesTogether).toBeLessThan(3);
    });

    it('applies BOTH conservation on combined days', () => {
      const members = [
        makeMember('M1-BOTH', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
        makeMember('M2-BOTH', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
        makeMember('M3-JP', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('M4-EN', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
        makeMember('M5-JP', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('M6-EN', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
      ];

      const schedule = makeSchedule('2026-04-05');
      let bothCount0 = 0;
      let bothCount1 = 0;
      let bothCount2 = 0;
      const runs = 50;

      for (let run = 0; run < runs; run++) {
        const counts = new Map<MemberId, number>();
        members.forEach((m) => counts.set(m.id, 0));
        const { assignments } = generateAssignments([schedule], members, [], counts);
        const a = assignments[0];
        const bc = a.memberIds.filter((mid) => {
          const m = members.find((mem) => mem.id === mid);
          return m?.language === Language.BOTH;
        }).length;
        if (bc === 0) bothCount0++;
        if (bc === 1) bothCount1++;
        if (bc === 2) bothCount2++;
      }

      // BOTH conservation: fewer BOTHs preferred (each BOTH adds +3)
      // Groups with 0 or 1 BOTH should be much more common than 2
      expect(bothCount0 + bothCount1).toBeGreaterThan(bothCount2);
    });

    it('excludes HELPER members on event days (combined)', () => {
      const members = [
        makeMember('M1-JP-Parent', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE, memberType: MemberType.PARENT_SINGLE }),
        makeMember('M2-EN-Helper', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH, memberType: MemberType.HELPER }),
        makeMember('M3-EN-Parent', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH, memberType: MemberType.PARENT_SINGLE }),
        makeMember('M4-JP-Parent', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE, memberType: MemberType.PARENT_SINGLE }),
        makeMember('M5-BOTH-Parent', { gradeGroup: GradeGroup.LOWER, language: Language.BOTH, memberType: MemberType.PARENT_SINGLE }),
      ];

      const schedule = makeSchedule('2026-04-05').toggleEvent();
      const counts = new Map<MemberId, number>();
      members.forEach((m) => counts.set(m.id, 0));

      const { assignments } = generateAssignments([schedule], members, [], counts);

      const helperIds = new Set(members.filter((m) => m.memberType === MemberType.HELPER).map((m) => m.id));
      for (const a of assignments) {
        for (const mid of a.memberIds) {
          expect(helperIds.has(mid)).toBe(false);
        }
      }
    });

    it('not enough members for combined day produces violation', () => {
      const members = [
        makeMember('M1', { language: Language.BOTH }),
        makeMember('M2', { language: Language.BOTH }),
      ];

      const schedule = makeSchedule('2026-04-05');
      const counts = new Map<MemberId, number>();
      members.forEach((m) => counts.set(m.id, 0));

      const { assignments, violations } = generateAssignments([schedule], members, [], counts);
      expect(assignments.length).toBe(0);
      expect(violations.length).toBeGreaterThan(0);
    });
  });

  describe('mixed schedule (combined + split)', () => {
    it('combined days produce 3-member groups, split days produce 2-member groups', () => {
      const members = [
        makeMember('U-JP-1', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('U-EN-1', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH }),
        makeMember('U-BOTH-1', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
        makeMember('U-JP-2', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN-1', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
        makeMember('L-BOTH-1', { gradeGroup: GradeGroup.LOWER, language: Language.BOTH }),
        makeMember('L-JP-2', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
      ];

      const combinedSchedule = makeSchedule('2026-04-05');
      const splitSchedule = makeSplitSchedule('2026-04-12');
      const counts = new Map<MemberId, number>();
      members.forEach((m) => counts.set(m.id, 0));

      const { assignments } = generateAssignments([combinedSchedule, splitSchedule], members, [], counts);

      const combinedAssignments = assignments.filter((a) => a.scheduleId === combinedSchedule.id);
      const splitAssignments = assignments.filter((a) => a.scheduleId === splitSchedule.id);

      // Combined: 1 group × 3 members
      expect(combinedAssignments.length).toBe(1);
      expect(combinedAssignments[0].memberIds.length).toBe(3);
      expect(combinedAssignments[0].groupNumber).toBe(1);

      // Split: 2 groups × 2 members
      expect(splitAssignments.length).toBe(2);
      for (const a of splitAssignments) {
        expect(a.memberIds.length).toBe(2);
      }
      expect(splitAssignments.map((a) => a.groupNumber).sort()).toEqual([1, 2]);
    });

    it('no UPPER BOTH member repeats across 4 dates with mix of combined/split', () => {
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
        makeSchedule('2026-04-05'),            // combined
        makeSplitSchedule('2026-04-12'),        // split
        makeSplitSchedule('2026-04-19'),        // split
        makeSchedule('2026-04-26'),             // combined
      ];

      const counts = new Map<MemberId, number>();
      members.forEach((m) => counts.set(m.id, 0));

      const { assignments } = generateAssignments(schedules, members, [], counts);

      // UPPER BOTH members should each be assigned at most once across all groups
      const upperBothIds = new Set(
        members.filter((m) => m.gradeGroup === GradeGroup.UPPER && m.language === Language.BOTH).map((m) => m.id),
      );
      const upperBothCounts = new Map<string, number>();
      for (const a of assignments) {
        for (const mid of a.memberIds) {
          if (upperBothIds.has(mid)) {
            upperBothCounts.set(mid, (upperBothCounts.get(mid) ?? 0) + 1);
          }
        }
      }

      for (const [, count] of upperBothCounts) {
        expect(count).toBe(1);
      }
    });
  });

  describe('BOTH conservation (split-class)', () => {
    it('prefers BOTH+JP over BOTH+BOTH in Group 1 on split-class days (T3)', () => {
      const members = [
        makeMember('U-BOTH-1', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
        makeMember('U-BOTH-2', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
        makeMember('U-JP-1', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('L-BOTH-1', { gradeGroup: GradeGroup.LOWER, language: Language.BOTH }),
        makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
      ];

      const schedule = makeSplitSchedule('2026-04-05');
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
        expect(bothCount).toBe(1);
      }
    });

    it('Group 2 has no BOTH preference, hard constraint ensures coverage (T4)', () => {
      const members = [
        makeMember('U-BOTH-1', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
        makeMember('U-BOTH-2', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
        makeMember('U-JP-1', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('L-BOTH-1', { gradeGroup: GradeGroup.LOWER, language: Language.BOTH }),
        makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN-1', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
      ];

      const schedule = makeSplitSchedule('2026-04-05');
      const counts = new Map<MemberId, number>();
      members.forEach((m) => counts.set(m.id, 0));

      const { violations } = generateAssignments([schedule], members, [], counts);
      const classViolations = violations.filter(
        (v) => v.type === ViolationType.CLASS_LANGUAGE_COVERAGE,
      );
      expect(classViolations).toHaveLength(0);
    });

    it('Group 2 hard constraint forces BOTH when G1 has only 1 BOTH (T5)', () => {
      const members = [
        makeMember('U-BOTH-1', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
        makeMember('U-JP-1', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('U-EN-1', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH }),
        makeMember('L-BOTH-1', { gradeGroup: GradeGroup.LOWER, language: Language.BOTH }),
        makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN-1', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
      ];

      const schedule = makeSplitSchedule('2026-04-05');
      const counts = new Map<MemberId, number>();
      members.forEach((m) => counts.set(m.id, 0));

      const { assignments, violations } = generateAssignments([schedule], members, [], counts);

      const group2 = assignments.find((a) => a.groupNumber === 2);
      expect(group2).toBeDefined();
      if (group2) {
        const hasBoth = group2.memberIds.some((mid) => {
          const m = members.find((mem) => mem.id === mid);
          return m?.language === Language.BOTH;
        });
        expect(hasBoth).toBe(true);
      }

      const classViolations = violations.filter(
        (v) => v.type === ViolationType.CLASS_LANGUAGE_COVERAGE,
      );
      expect(classViolations).toHaveLength(0);
    });
  });

  describe('ANY grade group (split-class)', () => {
    it('ANY member appears in both UPPER and LOWER pools (T1)', () => {
      const members = [
        makeMember('U-JP-1', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('U-EN-1', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH }),
        makeMember('ANY-EN-1', { gradeGroup: GradeGroup.ANY, language: Language.ENGLISH }),
        makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN-1', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
      ];

      const schedule = makeSplitSchedule('2026-04-05');
      const anyMember = members.find((m) => m.name === 'ANY-EN-1')!;

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
      const members = [
        makeMember('U-JP-1', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('ANY-EN-1', { gradeGroup: GradeGroup.ANY, language: Language.ENGLISH }),
        makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN-1', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
      ];

      const schedule = makeSplitSchedule('2026-04-05');

      for (let run = 0; run < 30; run++) {
        const counts = new Map<MemberId, number>();
        members.forEach((m) => counts.set(m.id, 0));
        const { assignments } = generateAssignments([schedule], members, [], counts);

        const anyMember = members.find((m) => m.name === 'ANY-EN-1')!;
        const dayAssignments = assignments.filter((a) => a.scheduleId === schedule.id);
        const appearances = dayAssignments.filter((a) => a.memberIds.includes(anyMember.id));
        expect(appearances.length).toBeLessThanOrEqual(1);
      }
    });

    it('split-class day: ANY+BOTH member contributes to CLASS_LANGUAGE_COVERAGE (T3)', () => {
      const members = [
        makeMember('U-BOTH-1', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
        makeMember('U-JP-1', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('ANY-BOTH-1', { gradeGroup: GradeGroup.ANY, language: Language.BOTH }),
        makeMember('L-BOTH-1', { gradeGroup: GradeGroup.LOWER, language: Language.BOTH }),
        makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
      ];

      const schedule = makeSplitSchedule('2026-04-05');

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
      const members = [
        makeMember('U-JP-1', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('U-EN-1', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH }),
        makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN-1', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
      ];

      const schedule = makeSplitSchedule('2026-04-05');
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

  describe('HELPER deferral (split-class)', () => {
    it('defers HELPER on subsequent days after already assigned (T1)', () => {
      const members = [
        makeMember('U-JP-Parent', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE, memberType: MemberType.PARENT_SINGLE }),
        makeMember('U-EN-Parent', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH, memberType: MemberType.PARENT_SINGLE }),
        makeMember('U-JP-Parent2', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE, memberType: MemberType.PARENT_SINGLE }),
        makeMember('U-EN-Helper', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH, memberType: MemberType.HELPER }),
        makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN-1', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
        makeMember('L-JP-2', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN-2', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
      ];

      const schedules = [
        makeSplitSchedule('2026-04-05'),
        makeSplitSchedule('2026-04-12'),
      ];
      const helperId = members.find((m) => m.name === 'U-EN-Helper')!.id;
      let helperBothDaysCount = 0;
      const runs = 50;

      for (let run = 0; run < runs; run++) {
        const counts = new Map<MemberId, number>();
        members.forEach((m) => counts.set(m.id, 0));
        const { assignments } = generateAssignments(schedules, members, [], counts);
        const helperAssignments = assignments.filter(
          (a) => a.groupNumber === 1 && a.memberIds.includes(helperId),
        );
        if (helperAssignments.length === 2) {
          helperBothDaysCount++;
        }
      }

      expect(helperBothDaysCount).toBeLessThan(runs * 0.4);
    });

    it('selects HELPER when their count is sufficiently lower than parents (T2)', () => {
      const members = [
        makeMember('U-JP-Parent', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE, memberType: MemberType.PARENT_SINGLE }),
        makeMember('U-EN-Parent', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH, memberType: MemberType.PARENT_SINGLE }),
        makeMember('U-EN-Helper', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH, memberType: MemberType.HELPER }),
        makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN-1', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
      ];

      const schedule = makeSplitSchedule('2026-04-05');
      const helperId = members.find((m) => m.name === 'U-EN-Helper')!.id;
      let helperSelectedCount = 0;
      const runs = 30;

      for (let run = 0; run < runs; run++) {
        const counts = new Map<MemberId, number>();
        members.forEach((m) => counts.set(m.id, 0));
        counts.set(members[0].id, 2);
        counts.set(members[1].id, 2);

        const { assignments } = generateAssignments([schedule], members, [], counts);
        const group1 = assignments.find((a) => a.groupNumber === 1);
        if (group1?.memberIds.includes(helperId)) {
          helperSelectedCount++;
        }
      }

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
        const schedule = makeSplitSchedule('2026-04-05');
        const counts = new Map<MemberId, number>();
        members.forEach((m) => counts.set(m.id, 0));
        const { assignments } = generateAssignments([schedule], members, [], counts);

        for (const a of assignments) {
          const groupMembers = a.memberIds.map((mid) => members.find((m) => m.id === mid)!);
          const hasJP = groupMembers.some((m) =>
            m.language === Language.JAPANESE || m.language === Language.BOTH,
          );
          const hasEN = groupMembers.some((m) =>
            m.language === Language.ENGLISH || m.language === Language.BOTH,
          );
          expect(hasJP).toBe(true);
          expect(hasEN).toBe(true);
        }
      }
    });
  });

  describe('pool-relative distribution (split-class)', () => {
    it('pool-uniform counts produce no distribution penalty bias (T1)', () => {
      const members = [
        makeMember('U-JP-1', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('U-EN-1', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH }),
        makeMember('U-JP-2', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN-1', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
        makeMember('L-JP-2', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN-2', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
      ];

      const schedule = makeSplitSchedule('2026-04-05');
      const counts = new Map<MemberId, number>();
      members.filter((m) => m.gradeGroup === GradeGroup.UPPER).forEach((m) => counts.set(m.id, 3));
      members.filter((m) => m.gradeGroup === GradeGroup.LOWER).forEach((m) => counts.set(m.id, 5));

      const g2Pairs = new Set<string>();
      for (let run = 0; run < 30; run++) {
        const runCounts = new Map(counts);
        const { assignments } = generateAssignments([schedule], members, [], runCounts);
        const group2 = assignments.find((a) => a.groupNumber === 2);
        if (group2) {
          g2Pairs.add([...group2.memberIds].sort().join(','));
        }
      }

      expect(g2Pairs.size).toBeGreaterThanOrEqual(2);
    });

    it('lower count member in pool is preferred over higher count (T2)', () => {
      const members = [
        makeMember('U-JP', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('U-EN-High', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH }),
        makeMember('U-EN-Low', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH }),
        makeMember('L-JP', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
      ];

      const schedule = makeSplitSchedule('2026-04-05');
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

      expect(lowSelected).toBeGreaterThan(runs * 0.8);
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
        const schedule = makeSplitSchedule('2026-04-05');
        const counts = new Map<MemberId, number>();
        members.forEach((m) => counts.set(m.id, run % 5));
        const { assignments } = generateAssignments([schedule], members, [], counts);

        for (const a of assignments) {
          const groupMembers = a.memberIds.map((mid) => members.find((m) => m.id === mid)!);
          const hasJP = groupMembers.some((m) =>
            m.language === Language.JAPANESE || m.language === Language.BOTH,
          );
          const hasEN = groupMembers.some((m) =>
            m.language === Language.ENGLISH || m.language === Language.BOTH,
          );
          expect(hasJP).toBe(true);
          expect(hasEN).toBe(true);
        }
      }
    });
  });

  describe('schedule order shuffle', () => {
    it('produces different assignment results across multiple runs (T1)', () => {
      const members = [
        makeMember('U-JP-1', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('U-EN-1', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH }),
        makeMember('U-JP-2', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('U-EN-2', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH }),
        makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN-1', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
        makeMember('L-JP-2', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN-2', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
      ];

      const schedules = [
        makeSplitSchedule('2026-04-05'),
        makeSplitSchedule('2026-04-12'),
        makeSplitSchedule('2026-04-19'),
        makeSplitSchedule('2026-04-26'),
      ];

      const results = new Set<string>();
      for (let run = 0; run < 10; run++) {
        const counts = new Map<MemberId, number>();
        members.forEach((m) => counts.set(m.id, 0));
        const { assignments } = generateAssignments(schedules, members, [], counts);
        const fingerprint = assignments
          .map((a) => `${a.scheduleId}:${a.groupNumber}:${[...a.memberIds].sort().join(',')}`)
          .sort()
          .join('|');
        results.add(fingerprint);
      }

      expect(results.size).toBeGreaterThanOrEqual(2);
    });

    it('hard constraints are always respected despite schedule shuffle (T2)', () => {
      const members = [
        makeMember('U-BOTH', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
        makeMember('U-JP', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('L-BOTH', { gradeGroup: GradeGroup.LOWER, language: Language.BOTH }),
        makeMember('L-EN', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
      ];

      const schedules = [
        makeSplitSchedule('2026-04-05'),
        makeSplitSchedule('2026-04-12'),
        makeSplitSchedule('2026-04-19'),
      ];

      for (let run = 0; run < 50; run++) {
        const counts = new Map<MemberId, number>();
        members.forEach((m) => counts.set(m.id, 0));
        const { assignments } = generateAssignments(schedules, members, [], counts);

        for (const a of assignments) {
          const groupMembers = a.memberIds.map((mid) => members.find((m) => m.id === mid)!);
          const hasJP = groupMembers.some((m) =>
            m.language === Language.JAPANESE || m.language === Language.BOTH,
          );
          const hasEN = groupMembers.some((m) =>
            m.language === Language.ENGLISH || m.language === Language.BOTH,
          );
          expect(hasJP).toBe(true);
          expect(hasEN).toBe(true);
        }
      }
    });

    it('generates assignments for all dates (T3)', () => {
      const members = [
        makeMember('U-JP', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
        makeMember('U-EN', { gradeGroup: GradeGroup.UPPER, language: Language.ENGLISH }),
        makeMember('L-JP', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
      ];

      const schedules = [
        makeSplitSchedule('2026-04-05'),
        makeSplitSchedule('2026-04-12'),
        makeSplitSchedule('2026-04-19'),
      ];

      for (let run = 0; run < 10; run++) {
        const counts = new Map<MemberId, number>();
        members.forEach((m) => counts.set(m.id, 0));
        const { assignments } = generateAssignments(schedules, members, [], counts);

        // 3 dates × 2 groups = 6 assignments
        expect(assignments.length).toBe(6);

        for (const s of schedules) {
          const forSchedule = assignments.filter((a) => a.scheduleId === s.id);
          expect(forSchedule.length).toBe(2);
          expect(forSchedule.map((a) => a.groupNumber).sort()).toEqual([1, 2]);
        }
      }
    });
  });

  describe('shuffle tiebreak (split-class)', () => {
    it('produces different pairs across multiple runs when scores are tied (T1)', () => {
      const members = [
        makeMember('L-JP-1', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN-1', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
        makeMember('L-JP-2', { gradeGroup: GradeGroup.LOWER, language: Language.JAPANESE }),
        makeMember('L-EN-2', { gradeGroup: GradeGroup.LOWER, language: Language.ENGLISH }),
        makeMember('U-BOTH-1', { gradeGroup: GradeGroup.UPPER, language: Language.BOTH }),
        makeMember('U-JP-1', { gradeGroup: GradeGroup.UPPER, language: Language.JAPANESE }),
      ];

      const schedule = makeSplitSchedule('2026-04-05');
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
        const schedule = makeSplitSchedule('2026-04-05');
        const counts = new Map<MemberId, number>();
        members.forEach((m) => counts.set(m.id, 0));
        const { assignments } = generateAssignments([schedule], members, [], counts);

        for (const a of assignments) {
          const groupMembers = a.memberIds.map((mid) => members.find((m) => m.id === mid)!);
          const hasJP = groupMembers.some((m) =>
            m.language === Language.JAPANESE || m.language === Language.BOTH,
          );
          const hasEN = groupMembers.some((m) =>
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

      const counts = new Map<MemberId, number>();
      members.forEach((m) => counts.set(m.id, 0));
      const highCountMember = members.find((m) => m.name === 'U-JP-1')!;
      counts.set(highCountMember.id, 5);

      const schedule = makeSplitSchedule('2026-04-05');
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

      expect(highCountSelected).toBeLessThan(runs * 0.3);
    });
  });
});
