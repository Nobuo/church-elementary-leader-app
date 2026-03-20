import { describe, it, expect } from 'vitest';
import { generateMonthlyAssignments } from '@application/use-cases/generate-assignments';
import { Member } from '@domain/entities/member';
import { Assignment } from '@domain/entities/assignment';
import { Schedule } from '@domain/entities/schedule';
import { Gender } from '@domain/value-objects/gender';
import { Language } from '@domain/value-objects/language';
import { GradeGroup } from '@domain/value-objects/grade-group';
import { MemberType } from '@domain/value-objects/member-type';
import { ViolationType } from '@domain/value-objects/constraint-violation';
import { MemberId, ScheduleId, AssignmentId } from '@shared/types';
import { MemberRepository } from '@domain/repositories/member-repository';
import { AssignmentRepository } from '@domain/repositories/assignment-repository';
import { ScheduleRepository } from '@domain/repositories/schedule-repository';

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

function makeSchedule(date: string, overrides: Partial<{ isExcluded: boolean; isEvent: boolean; isSplitClass: boolean }> = {}): Schedule {
  const result = Schedule.create(date);
  if (!result.ok) throw new Error(`Failed to create schedule ${date}`);
  let schedule = result.value;
  if (overrides.isExcluded) schedule = schedule.setExcluded(true);
  if (overrides.isEvent) schedule = schedule.toggleEvent();
  if (overrides.isSplitClass) schedule = schedule.toggleSplitClass();
  return schedule;
}

function createRepos(
  members: Member[],
  allSchedules: Schedule[],
  existingAssignments: Assignment[],
) {
  const savedAssignments: Assignment[] = [...existingAssignments];

  const memberRepo: MemberRepository = {
    save: () => {},
    findById: (id: MemberId) => members.find((m) => m.id === id) ?? null,
    findAll: () => members,
    findBySpouseId: () => null,
  };

  const assignmentRepo: AssignmentRepository = {
    save: (a: Assignment) => { savedAssignments.push(a); },
    findById: (id: AssignmentId) => savedAssignments.find((a) => a.id === id) ?? null,
    findByScheduleId: (sid: ScheduleId) => savedAssignments.filter((a) => a.scheduleId === sid),
    findByScheduleIds: (sids: ScheduleId[]) => savedAssignments.filter((a) => sids.includes(a.scheduleId)),
    findByMemberAndFiscalYear: () => [],
    countByMember: () => 0,
    countAllByFiscalYear: () => new Map(),
    deleteByScheduleId: () => {},
    deleteByScheduleIds: (sids: ScheduleId[]) => {
      // Remove assignments for given schedule IDs
      for (let i = savedAssignments.length - 1; i >= 0; i--) {
        if (sids.includes(savedAssignments[i].scheduleId)) {
          savedAssignments.splice(i, 1);
        }
      }
    },
  };

  const scheduleRepo: ScheduleRepository = {
    save: () => {},
    findById: (id: ScheduleId) => allSchedules.find((s) => s.id === id) ?? null,
    findByDate: () => null,
    findByMonth: (year: number, month: number) =>
      allSchedules.filter((s) => {
        const d = new Date(s.date);
        return d.getFullYear() === year && d.getMonth() + 1 === month;
      }),
    findByFiscalYear: () => allSchedules,
  };

  return { memberRepo, assignmentRepo, scheduleRepo };
}

// Create enough members to generate valid assignments (4 per group minimum)
function makeMembers(): Member[] {
  return [
    makeMember('A', { gender: Gender.MALE, language: Language.BOTH, gradeGroup: GradeGroup.UPPER }),
    makeMember('B', { gender: Gender.FEMALE, language: Language.BOTH, gradeGroup: GradeGroup.UPPER }),
    makeMember('C', { gender: Gender.MALE, language: Language.BOTH, gradeGroup: GradeGroup.UPPER }),
    makeMember('D', { gender: Gender.FEMALE, language: Language.BOTH, gradeGroup: GradeGroup.UPPER }),
    makeMember('E', { gender: Gender.MALE, language: Language.BOTH, gradeGroup: GradeGroup.LOWER }),
    makeMember('F', { gender: Gender.FEMALE, language: Language.BOTH, gradeGroup: GradeGroup.LOWER }),
    makeMember('G', { gender: Gender.MALE, language: Language.BOTH, gradeGroup: GradeGroup.LOWER }),
    makeMember('H', { gender: Gender.FEMALE, language: Language.BOTH, gradeGroup: GradeGroup.LOWER }),
  ];
}

describe('generateMonthlyAssignments', () => {
  describe('totalSundays calculation for excessive count warnings', () => {
    it('does not include cleared months in totalSundays', () => {
      // April 2026 sundays: 5, 12, 19, 26
      const aprilSchedules = [
        makeSchedule('2026-04-05'),
        makeSchedule('2026-04-12'),
        makeSchedule('2026-04-19'),
        makeSchedule('2026-04-26'),
      ];
      // May 2026 sundays (schedules exist but no assignments = cleared)
      const maySchedules = [
        makeSchedule('2026-05-03'),
        makeSchedule('2026-05-10'),
        makeSchedule('2026-05-17'),
        makeSchedule('2026-05-24'),
        makeSchedule('2026-05-31'),
      ];

      const allSchedules = [...aprilSchedules, ...maySchedules];
      const members = makeMembers();

      // No existing assignments (May was cleared)
      const { memberRepo, assignmentRepo, scheduleRepo } = createRepos(members, allSchedules, []);

      const result = generateMonthlyAssignments(2026, 4, memberRepo, scheduleRepo, assignmentRepo);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // With 8 members & 4 April sundays: expected = (4 * 4) / 8 = 2.0
      // Each member gets ~2 assignments, which is within 0.5x-1.5x of 2.0
      // No excessive count warnings should appear
      const excessiveViolations = result.value.violations.filter(
        (v) => v.type === ViolationType.EXCESSIVE_COUNT,
      );

      // If May schedules were incorrectly included: expected = (9 * 4) / 8 = 4.5
      // Members with 2 assignments < 4.5 * 0.5 = 2.25 → "too few" warnings
      // So if we see "too few" warnings, the fix didn't work
      const tooFewViolations = excessiveViolations.filter(
        (v) => v.messageParams?.direction === 'tooFew',
      );
      expect(tooFewViolations).toHaveLength(0);
    });

    it('includes months with existing assignments in totalSundays', () => {
      const aprilSchedules = [
        makeSchedule('2026-04-05'),
        makeSchedule('2026-04-12'),
      ];
      const maySchedules = [
        makeSchedule('2026-05-03'),
        makeSchedule('2026-05-10'),
      ];

      const allSchedules = [...aprilSchedules, ...maySchedules];
      const members = makeMembers();

      // May has existing assignments (not cleared)
      const existingAssignments = [
        Assignment.create(maySchedules[0].id, 1, [members[0].id, members[1].id]),
        Assignment.create(maySchedules[0].id, 2, [members[4].id, members[5].id]),
        Assignment.create(maySchedules[1].id, 1, [members[2].id, members[3].id]),
        Assignment.create(maySchedules[1].id, 2, [members[6].id, members[7].id]),
      ];

      const { memberRepo, assignmentRepo, scheduleRepo } = createRepos(members, allSchedules, existingAssignments);

      const result = generateMonthlyAssignments(2026, 4, memberRepo, scheduleRepo, assignmentRepo);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // totalSundays should be 4 (2 April + 2 May with assignments)
      // expected = (4 * 4) / 8 = 2.0
      const excessiveViolations = result.value.violations.filter(
        (v) => v.type === ViolationType.EXCESSIVE_COUNT,
      );
      const tooFewViolations = excessiveViolations.filter(
        (v) => v.messageParams?.direction === 'tooFew',
      );
      expect(tooFewViolations).toHaveLength(0);
    });

    it('excludes isExcluded schedules from totalSundays', () => {
      const aprilSchedules = [
        makeSchedule('2026-04-05'),
        makeSchedule('2026-04-12', { isExcluded: true }),
        makeSchedule('2026-04-19'),
        makeSchedule('2026-04-26', { isExcluded: true }),
      ];

      const members = makeMembers();
      const { memberRepo, assignmentRepo, scheduleRepo } = createRepos(members, aprilSchedules, []);

      const result = generateMonthlyAssignments(2026, 4, memberRepo, scheduleRepo, assignmentRepo);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Only 2 non-excluded sundays → expected = (2 * 4) / 8 = 1.0
      // Members with 1 assignment are within range → no "too few"
      const excessiveViolations = result.value.violations.filter(
        (v) => v.type === ViolationType.EXCESSIVE_COUNT,
      );
      const tooFewViolations = excessiveViolations.filter(
        (v) => v.messageParams?.direction === 'tooFew',
      );
      expect(tooFewViolations).toHaveLength(0);
    });
  });
});
