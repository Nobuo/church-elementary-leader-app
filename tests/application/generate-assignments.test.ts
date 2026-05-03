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
      // 指定したスケジュールIDの割り当てを削除する
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

// 有効な割り当てを生成できるだけのメンバーを作成する（各グループ最低4名）
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
      // 2026年4月の日曜日: 5日、12日、19日、26日
      const aprilSchedules = [
        makeSchedule('2026-04-05'),
        makeSchedule('2026-04-12'),
        makeSchedule('2026-04-19'),
        makeSchedule('2026-04-26'),
      ];
      // 2026年5月の日曜日（スケジュールは存在するが割り当てなし = クリア済み）
      const maySchedules = [
        makeSchedule('2026-05-03'),
        makeSchedule('2026-05-10'),
        makeSchedule('2026-05-17'),
        makeSchedule('2026-05-24'),
        makeSchedule('2026-05-31'),
      ];

      const allSchedules = [...aprilSchedules, ...maySchedules];
      const members = makeMembers();

      // 既存の割り当てなし（5月はクリア済み）
      const { memberRepo, assignmentRepo, scheduleRepo } = createRepos(members, allSchedules, []);

      const result = generateMonthlyAssignments(2026, 4, memberRepo, scheduleRepo, assignmentRepo);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // 8名・4月の日曜日4回の場合: 期待値 = (4 * 4) / 8 = 2.0
      // 各メンバーは約2回割り当てられ、2.0の0.5〜1.5倍の範囲に収まる
      // 割り当て回数過多の警告は出ないはず
      const excessiveViolations = result.value.violations.filter(
        (v) => v.type === ViolationType.EXCESSIVE_COUNT,
      );

      // 5月のスケジュールを誤って含めた場合: 期待値 = (9 * 4) / 8 = 4.5
      // 割り当て2回のメンバーは 4.5 * 0.5 = 2.25 未満なので「少なすぎ」警告になる
      // そのため「少なすぎ」警告が出た場合、この修正は効いていない
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

      // 5月には既存の割り当てがある（クリアされていない）
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

      // totalSundays は4になるはず（4月2回 + 割り当て済みの5月2回）
      // 期待値 = (4 * 4) / 8 = 2.0
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

      // 除外されていない日曜日は2回だけ → 期待値 = (2 * 4) / 8 = 1.0
      // 割り当て1回のメンバーは範囲内 →「少なすぎ」ではない
      const excessiveViolations = result.value.violations.filter(
        (v) => v.type === ViolationType.EXCESSIVE_COUNT,
      );
      const tooFewViolations = excessiveViolations.filter(
        (v) => v.messageParams?.direction === 'tooFew',
      );
      expect(tooFewViolations).toHaveLength(0);
    });
  });

  describe('incremental generation', () => {
    it('generates only for unassigned schedules, preserving confirmed weeks', () => {
      const aprilSchedules = [
        makeSchedule('2026-04-05', { isSplitClass: true }),
        makeSchedule('2026-04-12', { isSplitClass: true }),
        makeSchedule('2026-04-19', { isSplitClass: true }),
        makeSchedule('2026-04-26', { isSplitClass: true }),
      ];
      const members = makeMembers();

      // 1週目と2週目は割り当て済み（確定済み）
      const confirmedAssignments = [
        Assignment.create(aprilSchedules[0].id, 1, [members[0].id, members[4].id]),
        Assignment.create(aprilSchedules[0].id, 2, [members[1].id, members[5].id]),
        Assignment.create(aprilSchedules[1].id, 1, [members[2].id, members[6].id]),
        Assignment.create(aprilSchedules[1].id, 2, [members[3].id, members[7].id]),
      ];

      const { memberRepo, assignmentRepo, scheduleRepo } = createRepos(
        members, aprilSchedules, confirmedAssignments,
      );

      const result = generateMonthlyAssignments(2026, 4, memberRepo, scheduleRepo, assignmentRepo);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // 未割り当ての2週だけに新しい割り当てが作られるはず（2グループ × 2週 = 4）
      expect(result.value.assignments).toHaveLength(4);

      // 確定済みの割り当ては残っているはず
      const week1Assignments = assignmentRepo.findByScheduleIds([aprilSchedules[0].id]);
      expect(week1Assignments).toHaveLength(2);
      expect(week1Assignments[0].memberIds).toContain(members[0].id);

      const week2Assignments = assignmentRepo.findByScheduleIds([aprilSchedules[1].id]);
      expect(week2Assignments).toHaveLength(2);
      expect(week2Assignments[0].memberIds).toContain(members[2].id);
    });

    it('returns allWeeksAssigned message when all weeks have assignments', () => {
      const aprilSchedules = [
        makeSchedule('2026-04-05', { isSplitClass: true }),
        makeSchedule('2026-04-12', { isSplitClass: true }),
      ];
      const members = makeMembers();

      // すべての週が割り当て済み
      const allAssigned = [
        Assignment.create(aprilSchedules[0].id, 1, [members[0].id, members[4].id]),
        Assignment.create(aprilSchedules[0].id, 2, [members[1].id, members[5].id]),
        Assignment.create(aprilSchedules[1].id, 1, [members[2].id, members[6].id]),
        Assignment.create(aprilSchedules[1].id, 2, [members[3].id, members[7].id]),
      ];

      const { memberRepo, assignmentRepo, scheduleRepo } = createRepos(
        members, aprilSchedules, allAssigned,
      );

      const result = generateMonthlyAssignments(2026, 4, memberRepo, scheduleRepo, assignmentRepo);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.assignments).toHaveLength(0);
      expect(result.value.message).toBe('allWeeksAssigned');
    });

    it('considers confirmed weeks in assignment counts for fairness', () => {
      const aprilSchedules = [
        makeSchedule('2026-04-05', { isSplitClass: true }),
        makeSchedule('2026-04-12', { isSplitClass: true }),
        makeSchedule('2026-04-19', { isSplitClass: true }),
        makeSchedule('2026-04-26', { isSplitClass: true }),
      ];
      const members = makeMembers();

      // メンバーAとEは1週目に割り当て済み（確定済み）
      const confirmedAssignments = [
        Assignment.create(aprilSchedules[0].id, 1, [members[0].id, members[4].id]),
        Assignment.create(aprilSchedules[0].id, 2, [members[1].id, members[5].id]),
      ];

      const { memberRepo, assignmentRepo, scheduleRepo } = createRepos(
        members, aprilSchedules, confirmedAssignments,
      );

      const result = generateMonthlyAssignments(2026, 4, memberRepo, scheduleRepo, assignmentRepo);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // 未割り当て3週 × 2グループ = 新規割り当て6件
      expect(result.value.assignments).toHaveLength(6);

      // 確定済みの割り当ては削除されていないはず
      const week1Assignments = assignmentRepo.findByScheduleIds([aprilSchedules[0].id]);
      expect(week1Assignments).toHaveLength(2);
    });

    it('generates all weeks when no existing assignments (same as before)', () => {
      const aprilSchedules = [
        makeSchedule('2026-04-05', { isSplitClass: true }),
        makeSchedule('2026-04-12', { isSplitClass: true }),
        makeSchedule('2026-04-19', { isSplitClass: true }),
        makeSchedule('2026-04-26', { isSplitClass: true }),
      ];
      const members = makeMembers();

      const { memberRepo, assignmentRepo, scheduleRepo } = createRepos(
        members, aprilSchedules, [],
      );

      const result = generateMonthlyAssignments(2026, 4, memberRepo, scheduleRepo, assignmentRepo);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // 4週すべて × 2グループ = 割り当て8件
      expect(result.value.assignments).toHaveLength(8);
      expect(result.value.message).toBeUndefined();
    });
  });
});
