import { describe, it, expect } from 'vitest';
import { getAssignmentCounts } from '@application/use-cases/get-assignment-counts';
import { Member } from '@domain/entities/member';
import { Gender } from '@domain/value-objects/gender';
import { Language } from '@domain/value-objects/language';
import { GradeGroup } from '@domain/value-objects/grade-group';
import { MemberType } from '@domain/value-objects/member-type';
import { MemberId } from '@shared/types';
import { MemberRepository } from '@domain/repositories/member-repository';
import { AssignmentRepository } from '@domain/repositories/assignment-repository';

function makeMember(name: string, isActive = true): Member {
  const result = Member.create({
    name,
    gender: Gender.MALE,
    language: Language.JAPANESE,
    gradeGroup: GradeGroup.UPPER,
    memberType: MemberType.PARENT_SINGLE,
    sameGenderOnly: false,
    spouseId: null,
    availableDates: null,
  });
  if (!result.ok) throw new Error('Failed to create member');
  if (!isActive) return result.value.deactivate();
  return result.value;
}

function createMockMemberRepo(members: Member[]): MemberRepository {
  return {
    save: () => {},
    findById: (id: MemberId) => members.find((m) => m.id === id) ?? null,
    findAll: () => members,
    findBySpouseId: () => null,
  };
}

function createMockAssignmentRepo(
  countMap: Map<MemberId, number>,
): AssignmentRepository {
  return {
    save: () => {},
    findById: () => null,
    findByScheduleId: () => [],
    findByScheduleIds: () => [],
    findByMemberAndFiscalYear: () => [],
    countByMember: () => 0,
    countAllByFiscalYear: () => countMap,
    deleteByScheduleId: () => {},
    deleteByScheduleIds: () => {},
  };
}

describe('getAssignmentCounts', () => {
  it('returns counts sorted by descending count', () => {
    const m1 = makeMember('Alice');
    const m2 = makeMember('Bob');
    const m3 = makeMember('Charlie');

    const countMap = new Map<MemberId, number>([
      [m1.id, 2],
      [m2.id, 5],
      [m3.id, 3],
    ]);

    const result = getAssignmentCounts(
      2026,
      createMockMemberRepo([m1, m2, m3]),
      createMockAssignmentRepo(countMap),
    );

    expect(result.fiscalYear).toBe(2026);
    expect(result.members.map((m) => m.name)).toEqual(['Bob', 'Charlie', 'Alice']);
    expect(result.members.map((m) => m.count)).toEqual([5, 3, 2]);
  });

  it('computes correct summary', () => {
    const m1 = makeMember('Alice');
    const m2 = makeMember('Bob');

    const countMap = new Map<MemberId, number>([
      [m1.id, 2],
      [m2.id, 6],
    ]);

    const result = getAssignmentCounts(
      2026,
      createMockMemberRepo([m1, m2]),
      createMockAssignmentRepo(countMap),
    );

    expect(result.summary.max).toEqual({ count: 6, memberName: 'Bob' });
    expect(result.summary.min).toEqual({ count: 2, memberName: 'Alice' });
    expect(result.summary.average).toBe(4);
  });

  it('includes inactive members with assignments', () => {
    const m1 = makeMember('Active');
    const m2 = makeMember('Inactive', false);

    const countMap = new Map<MemberId, number>([
      [m1.id, 3],
      [m2.id, 1],
    ]);

    const result = getAssignmentCounts(
      2026,
      createMockMemberRepo([m1, m2]),
      createMockAssignmentRepo(countMap),
    );

    expect(result.members).toHaveLength(2);
    expect(result.members.find((m) => m.name === 'Inactive')?.count).toBe(1);
  });

  it('returns empty result when no members', () => {
    const result = getAssignmentCounts(
      2026,
      createMockMemberRepo([]),
      createMockAssignmentRepo(new Map()),
    );

    expect(result.members).toHaveLength(0);
    expect(result.summary.average).toBe(0);
  });
});
