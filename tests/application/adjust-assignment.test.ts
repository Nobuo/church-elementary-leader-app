import { describe, it, expect } from 'vitest';
import { adjustAssignment } from '@application/use-cases/generate-assignments';
import { Member } from '@domain/entities/member';
import { Assignment } from '@domain/entities/assignment';
import { Schedule } from '@domain/entities/schedule';
import { Gender } from '@domain/value-objects/gender';
import { Language } from '@domain/value-objects/language';
import { GradeGroup } from '@domain/value-objects/grade-group';
import { MemberType } from '@domain/value-objects/member-type';
import { MemberId, ScheduleId, AssignmentId, createMemberId } from '@shared/types';
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

function createRepos(
  members: Member[],
  assignments: Assignment[],
  schedules: Schedule[],
) {
  const memberRepo: MemberRepository = {
    save: () => {},
    findById: (id: MemberId) => members.find((m) => m.id === id) ?? null,
    findAll: () => members,
    findBySpouseId: () => null,
  };

  const assignmentRepo: AssignmentRepository = {
    save: () => {},
    findById: (id: AssignmentId) => assignments.find((a) => a.id === id) ?? null,
    findByScheduleId: (sid: ScheduleId) => assignments.filter((a) => a.scheduleId === sid),
    findByScheduleIds: (sids: ScheduleId[]) => assignments.filter((a) => sids.includes(a.scheduleId)),
    findByMemberAndFiscalYear: () => [],
    countByMember: () => 0,
    countAllByFiscalYear: () => new Map(),
    deleteByScheduleId: () => {},
    deleteByScheduleIds: () => {},
  };

  const scheduleRepo: ScheduleRepository = {
    save: () => {},
    findById: (id: ScheduleId) => schedules.find((s) => s.id === id) ?? null,
    findByDate: () => null,
    findByMonth: (year: number, month: number) =>
      schedules.filter((s) => {
        const d = new Date(s.date);
        return d.getFullYear() === year && d.getMonth() + 1 === month;
      }),
    findByFiscalYear: () => schedules,
  };

  return { memberRepo, assignmentRepo, scheduleRepo };
}

describe('adjustAssignment', () => {
  it('returns language violation when replacing creates imbalanced pair', () => {
    const m1 = makeMember('JP1', { language: Language.JAPANESE });
    const m2 = makeMember('EN1', { language: Language.ENGLISH });
    const m3 = makeMember('JP2', { language: Language.JAPANESE }); // replacement - same language as m1

    const scheduleResult = Schedule.create('2026-04-05');
    if (!scheduleResult.ok) throw new Error('bad schedule');
    const schedule = scheduleResult.value;

    const assignment = Assignment.create(schedule.id, 1, [m1.id, m2.id]);
    const { memberRepo, assignmentRepo, scheduleRepo } = createRepos(
      [m1, m2, m3],
      [assignment],
      [schedule],
    );

    const result = adjustAssignment(
      assignment.id,
      m2.id, // replace EN1
      m3.id, // with JP2
      assignmentRepo,
      memberRepo,
      scheduleRepo,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.violations.length).toBeGreaterThan(0);
      expect(result.value.violations.some((v) => v.message.includes('language'))).toBe(true);
    }
  });

  it('returns spouse violation when replacing creates spouse pair', () => {
    const spouseId = createMemberId();
    const m1 = Member.reconstruct({
      id: createMemberId(),
      name: 'Husband',
      gender: Gender.MALE,
      language: Language.BOTH,
      gradeGroup: GradeGroup.UPPER,
      memberType: MemberType.PARENT_COUPLE,
      sameGenderOnly: false,
      spouseId,
      availableDates: null,
      isActive: true,
    });
    const m2 = makeMember('Other', { language: Language.BOTH, gradeGroup: GradeGroup.UPPER });
    const m3 = Member.reconstruct({
      id: spouseId,
      name: 'Wife',
      gender: Gender.FEMALE,
      language: Language.BOTH,
      gradeGroup: GradeGroup.UPPER,
      memberType: MemberType.PARENT_COUPLE,
      sameGenderOnly: false,
      spouseId: m1.id,
      availableDates: null,
      isActive: true,
    });

    const scheduleResult = Schedule.create('2026-04-05');
    if (!scheduleResult.ok) throw new Error('bad schedule');
    const schedule = scheduleResult.value;

    const assignment = Assignment.create(schedule.id, 1, [m1.id, m2.id]);
    const { memberRepo, assignmentRepo, scheduleRepo } = createRepos(
      [m1, m2, m3],
      [assignment],
      [schedule],
    );

    const result = adjustAssignment(
      assignment.id,
      m2.id,
      m3.id, // replace with spouse
      assignmentRepo,
      memberRepo,
      scheduleRepo,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.violations.some((v) => v.message.includes('Spouses'))).toBe(true);
    }
  });

  it('rejects HELPER replacement on event day', () => {
    const m1 = makeMember('JP1', { language: Language.JAPANESE });
    const m2 = makeMember('EN1', { language: Language.ENGLISH });
    const m3 = makeMember('Helper1', { language: Language.ENGLISH, memberType: MemberType.HELPER });

    const scheduleResult = Schedule.create('2026-04-05');
    if (!scheduleResult.ok) throw new Error('bad schedule');
    const schedule = scheduleResult.value.toggleEvent(); // event day

    const assignment = Assignment.create(schedule.id, 1, [m1.id, m2.id]);
    const { memberRepo, assignmentRepo, scheduleRepo } = createRepos(
      [m1, m2, m3],
      [assignment],
      [schedule],
    );

    const result = adjustAssignment(
      assignment.id,
      m2.id,
      m3.id, // replace with HELPER on event day
      assignmentRepo,
      memberRepo,
      scheduleRepo,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('HELPER');
    }
  });

  it('returns no violations for a valid replacement', () => {
    const m1 = makeMember('JP1', { language: Language.JAPANESE, gradeGroup: GradeGroup.UPPER });
    const m2 = makeMember('EN1', { language: Language.ENGLISH, gradeGroup: GradeGroup.UPPER });
    const m3 = makeMember('EN2', { language: Language.ENGLISH, gradeGroup: GradeGroup.UPPER }); // valid replacement

    const scheduleResult = Schedule.create('2026-04-05');
    if (!scheduleResult.ok) throw new Error('bad schedule');
    const schedule = scheduleResult.value;

    // groupNumber=1 → UPPER group, all members are UPPER
    const assignment = Assignment.create(schedule.id, 1, [m1.id, m2.id]);
    const { memberRepo, assignmentRepo, scheduleRepo } = createRepos(
      [m1, m2, m3],
      [assignment],
      [schedule],
    );

    const result = adjustAssignment(
      assignment.id,
      m2.id,
      m3.id,
      assignmentRepo,
      memberRepo,
      scheduleRepo,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.violations).toHaveLength(0);
      expect(result.value.assignment.members.map((m) => m.name)).toContain('EN2');
    }
  });

  it('returns GRADE_GROUP_MISMATCH warning when replacing with different grade group', () => {
    const m1 = makeMember('Lower1', { language: Language.BOTH, gradeGroup: GradeGroup.LOWER });
    const m2 = makeMember('Lower2', { language: Language.BOTH, gradeGroup: GradeGroup.LOWER });
    const m3 = makeMember('Upper1', { language: Language.BOTH, gradeGroup: GradeGroup.UPPER }); // wrong grade for LOWER group

    const scheduleResult = Schedule.create('2026-04-05');
    if (!scheduleResult.ok) throw new Error('bad schedule');
    const schedule = scheduleResult.value.toggleSplitClass(); // split-class day for grade group check

    // groupNumber=2 → LOWER group
    const assignment = Assignment.create(schedule.id, 2, [m1.id, m2.id]);
    const { memberRepo, assignmentRepo, scheduleRepo } = createRepos(
      [m1, m2, m3],
      [assignment],
      [schedule],
    );

    // Replace m2 (LOWER) with m3 (UPPER) in LOWER group → mismatch
    const result = adjustAssignment(
      assignment.id,
      m2.id,
      m3.id,
      assignmentRepo,
      memberRepo,
      scheduleRepo,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const gradeViolations = result.value.violations.filter(
        (v) => v.type === 'GRADE_GROUP_MISMATCH',
      );
      expect(gradeViolations).toHaveLength(1);
      expect(gradeViolations[0].memberIds).toContain(m3.id);
    }
  });

  it('allows ANY member in G1 (UPPER slot) without grade mismatch warning (T5)', () => {
    const m1 = makeMember('Upper1', { language: Language.JAPANESE, gradeGroup: GradeGroup.UPPER });
    const m2 = makeMember('Upper2', { language: Language.ENGLISH, gradeGroup: GradeGroup.UPPER });
    const m3 = makeMember('Any1', { language: Language.ENGLISH, gradeGroup: GradeGroup.ANY });

    const scheduleResult = Schedule.create('2026-04-05');
    if (!scheduleResult.ok) throw new Error('bad schedule');
    const schedule = scheduleResult.value;

    const assignment = Assignment.create(schedule.id, 1, [m1.id, m2.id]);
    const { memberRepo, assignmentRepo, scheduleRepo } = createRepos(
      [m1, m2, m3],
      [assignment],
      [schedule],
    );

    const result = adjustAssignment(assignment.id, m2.id, m3.id, assignmentRepo, memberRepo, scheduleRepo);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const gradeViolations = result.value.violations.filter((v) => v.type === 'GRADE_GROUP_MISMATCH');
      expect(gradeViolations).toHaveLength(0);
    }
  });

  it('allows ANY member in G2 (LOWER slot) without grade mismatch warning (T6)', () => {
    const m1 = makeMember('Lower1', { language: Language.JAPANESE, gradeGroup: GradeGroup.LOWER });
    const m2 = makeMember('Lower2', { language: Language.ENGLISH, gradeGroup: GradeGroup.LOWER });
    const m3 = makeMember('Any1', { language: Language.ENGLISH, gradeGroup: GradeGroup.ANY });

    const scheduleResult = Schedule.create('2026-04-05');
    if (!scheduleResult.ok) throw new Error('bad schedule');
    const schedule = scheduleResult.value;

    const assignment = Assignment.create(schedule.id, 2, [m1.id, m2.id]);
    const { memberRepo, assignmentRepo, scheduleRepo } = createRepos(
      [m1, m2, m3],
      [assignment],
      [schedule],
    );

    const result = adjustAssignment(assignment.id, m2.id, m3.id, assignmentRepo, memberRepo, scheduleRepo);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const gradeViolations = result.value.violations.filter((v) => v.type === 'GRADE_GROUP_MISMATCH');
      expect(gradeViolations).toHaveLength(0);
    }
  });

  it('includes gradeGroup in assignment DTO', () => {
    const m1 = makeMember('Upper1', { language: Language.BOTH, gradeGroup: GradeGroup.UPPER });
    const m2 = makeMember('Upper2', { language: Language.BOTH, gradeGroup: GradeGroup.UPPER });
    const m3 = makeMember('Upper3', { language: Language.BOTH, gradeGroup: GradeGroup.UPPER });

    const scheduleResult = Schedule.create('2026-04-05');
    if (!scheduleResult.ok) throw new Error('bad schedule');
    const schedule = scheduleResult.value;

    // groupNumber=1 → UPPER group
    const assignment = Assignment.create(schedule.id, 1, [m1.id, m2.id]);
    const { memberRepo, assignmentRepo, scheduleRepo } = createRepos(
      [m1, m2, m3],
      [assignment],
      [schedule],
    );

    const result = adjustAssignment(
      assignment.id,
      m2.id,
      m3.id,
      assignmentRepo,
      memberRepo,
      scheduleRepo,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const dto = result.value.assignment;
      expect(dto.gradeGroup).toBe('UPPER');
      expect(dto.members[0].gradeGroup).toBe('UPPER');
      expect(dto.members[1].gradeGroup).toBe('UPPER');
    }
  });
});
