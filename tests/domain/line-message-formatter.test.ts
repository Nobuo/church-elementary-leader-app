import { describe, it, expect } from 'vitest';
import { Member } from '@domain/entities/member';
import { Schedule } from '@domain/entities/schedule';
import { Assignment } from '@domain/entities/assignment';
import { Gender } from '@domain/value-objects/gender';
import { Language } from '@domain/value-objects/language';
import { GradeGroup } from '@domain/value-objects/grade-group';
import { MemberType } from '@domain/value-objects/member-type';
import { MemberId, createScheduleId } from '@shared/types';
import { formatLineMessage } from '@domain/services/line-message-formatter';

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

function makeSchedule(date: string, opts: { isEvent?: boolean; isSplitClass?: boolean } = {}): Schedule {
  return Schedule.reconstruct({
    id: createScheduleId(),
    date,
    isExcluded: false,
    isEvent: opts.isEvent ?? false,
    isSplitClass: opts.isSplitClass ?? false,
    year: 2025,
  });
}

describe('formatLineMessage', () => {
  it('includes event tag on event days (ja)', () => {
    const m1 = makeMember('Alice');
    const m2 = makeMember('Bob', { gradeGroup: GradeGroup.LOWER });
    const schedule = makeSchedule('2026-03-01', { isEvent: true });
    const assignment = Assignment.create(schedule.id, 1, [m1.id, m2.id]);

    const members = new Map<MemberId, Member>();
    members.set(m1.id, m1);
    members.set(m2.id, m2);

    const result = formatLineMessage([assignment], [schedule], members, 2026, 3, 'ja');
    expect(result).toContain('🎉 イベント日');
  });

  it('includes split-class tag on split-class days (ja)', () => {
    const m1 = makeMember('Alice');
    const m2 = makeMember('Bob', { gradeGroup: GradeGroup.LOWER });
    const schedule = makeSchedule('2026-03-01', { isSplitClass: true });
    const assignment = Assignment.create(schedule.id, 1, [m1.id, m2.id]);

    const members = new Map<MemberId, Member>();
    members.set(m1.id, m1);
    members.set(m2.id, m2);

    const result = formatLineMessage([assignment], [schedule], members, 2026, 3, 'ja');
    expect(result).toContain('📚 分級あり');
  });

  it('includes English tags when lang=en', () => {
    const m1 = makeMember('Alice');
    const m2 = makeMember('Bob', { gradeGroup: GradeGroup.LOWER });
    const schedule = makeSchedule('2026-03-01', { isEvent: true, isSplitClass: true });
    const assignment = Assignment.create(schedule.id, 1, [m1.id, m2.id]);

    const members = new Map<MemberId, Member>();
    members.set(m1.id, m1);
    members.set(m2.id, m2);

    const result = formatLineMessage([assignment], [schedule], members, 2026, 3, 'en');
    expect(result).toContain('🎉 Event Day');
    expect(result).toContain('📚 Split Class');
  });

  it('does not include tags on normal days', () => {
    const m1 = makeMember('Alice');
    const m2 = makeMember('Bob', { gradeGroup: GradeGroup.LOWER });
    const schedule = makeSchedule('2026-03-01');
    const assignment = Assignment.create(schedule.id, 1, [m1.id, m2.id]);

    const members = new Map<MemberId, Member>();
    members.set(m1.id, m1);
    members.set(m2.id, m2);

    const result = formatLineMessage([assignment], [schedule], members, 2026, 3, 'ja');
    expect(result).not.toContain('🎉');
    expect(result).not.toContain('📚');
  });
});
