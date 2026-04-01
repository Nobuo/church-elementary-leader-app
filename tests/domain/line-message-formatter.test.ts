import { describe, it, expect } from 'vitest';
import { Member } from '@domain/entities/member';
import { Schedule, SplitType } from '@domain/entities/schedule';
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

function makeSchedule(
  date: string,
  opts: { isEvent?: boolean; isSplitClass?: boolean; splitType?: SplitType | null } = {},
): Schedule {
  return Schedule.reconstruct({
    id: createScheduleId(),
    date,
    isExcluded: false,
    isEvent: opts.isEvent ?? false,
    isEbt: false,
    isSplitClass: opts.isSplitClass ?? false,
    splitType: opts.splitType ?? null,
    year: 2025,
  });
}

describe('formatLineMessage', () => {
  describe('combined day (no split class)', () => {
    it('displays member names without group label (ja)', () => {
      const m1 = makeMember('Alice');
      const m2 = makeMember('Bob');
      const m3 = makeMember('Charlie');
      const schedule = makeSchedule('2026-03-01');
      const assignment = Assignment.create(schedule.id, 1, [m1.id, m2.id, m3.id]);

      const members = new Map<MemberId, Member>();
      members.set(m1.id, m1);
      members.set(m2.id, m2);
      members.set(m3.id, m3);

      const result = formatLineMessage([assignment], [schedule], members, 2026, 3, 'ja');
      expect(result).toContain('Alice・Bob・Charlie');
      expect(result).not.toContain('グループ');
    });

    it('displays member names without group label (en)', () => {
      const m1 = makeMember('Alice');
      const m2 = makeMember('Bob');
      const m3 = makeMember('Charlie');
      const schedule = makeSchedule('2026-03-01');
      const assignment = Assignment.create(schedule.id, 1, [m1.id, m2.id, m3.id]);

      const members = new Map<MemberId, Member>();
      members.set(m1.id, m1);
      members.set(m2.id, m2);
      members.set(m3.id, m3);

      const result = formatLineMessage([assignment], [schedule], members, 2026, 3, 'en');
      expect(result).toContain('Alice & Bob & Charlie');
      expect(result).not.toContain('Group');
    });

    it('does not show event tag even on event days (ja)', () => {
      const m1 = makeMember('Alice');
      const m2 = makeMember('Bob');
      const m3 = makeMember('Charlie');
      const schedule = makeSchedule('2026-03-01', { isEvent: true });
      const assignment = Assignment.create(schedule.id, 1, [m1.id, m2.id, m3.id]);

      const members = new Map<MemberId, Member>();
      members.set(m1.id, m1);
      members.set(m2.id, m2);
      members.set(m3.id, m3);

      const result = formatLineMessage([assignment], [schedule], members, 2026, 3, 'ja');
      expect(result).not.toContain('🎉');
      expect(result).not.toContain('イベント');
    });

    it('does not show event tag even on event days (en)', () => {
      const m1 = makeMember('Alice');
      const m2 = makeMember('Bob');
      const m3 = makeMember('Charlie');
      const schedule = makeSchedule('2026-03-01', { isEvent: true });
      const assignment = Assignment.create(schedule.id, 1, [m1.id, m2.id, m3.id]);

      const members = new Map<MemberId, Member>();
      members.set(m1.id, m1);
      members.set(m2.id, m2);
      members.set(m3.id, m3);

      const result = formatLineMessage([assignment], [schedule], members, 2026, 3, 'en');
      expect(result).not.toContain('🎉');
      expect(result).not.toContain('Event');
    });

    it('does not include any tags on normal days', () => {
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

  describe('standard split class (1~3 / 4~6)', () => {
    it('shows split tag and grade labels (ja)', () => {
      const m1 = makeMember('Alice');
      const m2 = makeMember('Bob');
      const m3 = makeMember('Charlie', { gradeGroup: GradeGroup.LOWER });
      const m4 = makeMember('Diana', { gradeGroup: GradeGroup.LOWER });
      const schedule = makeSchedule('2026-03-01', { isSplitClass: true, splitType: 'standard' });
      const upperAssignment = Assignment.create(schedule.id, 1, [m1.id, m2.id]);
      const lowerAssignment = Assignment.create(schedule.id, 2, [m3.id, m4.id]);

      const members = new Map<MemberId, Member>();
      members.set(m1.id, m1);
      members.set(m2.id, m2);
      members.set(m3.id, m3);
      members.set(m4.id, m4);

      const result = formatLineMessage(
        [upperAssignment, lowerAssignment], [schedule], members, 2026, 3, 'ja',
      );
      expect(result).toContain('📚 1~3年と4~6年に分けてクラス');
      expect(result).toContain('1~3年: Charlie・Diana');
      expect(result).toContain('4~6年: Alice・Bob');
    });

    it('shows split tag and grade labels (en)', () => {
      const m1 = makeMember('Alice');
      const m2 = makeMember('Bob');
      const m3 = makeMember('Charlie', { gradeGroup: GradeGroup.LOWER });
      const m4 = makeMember('Diana', { gradeGroup: GradeGroup.LOWER });
      const schedule = makeSchedule('2026-03-01', { isSplitClass: true, splitType: 'standard' });
      const upperAssignment = Assignment.create(schedule.id, 1, [m1.id, m2.id]);
      const lowerAssignment = Assignment.create(schedule.id, 2, [m3.id, m4.id]);

      const members = new Map<MemberId, Member>();
      members.set(m1.id, m1);
      members.set(m2.id, m2);
      members.set(m3.id, m3);
      members.set(m4.id, m4);

      const result = formatLineMessage(
        [upperAssignment, lowerAssignment], [schedule], members, 2026, 3, 'en',
      );
      expect(result).toContain('📚 Split: Grades 1-3 & Grades 4-6');
      expect(result).toContain('Grades 1-3: Charlie & Diana');
      expect(result).toContain('Grades 4-6: Alice & Bob');
    });

    it('shows lower grade group first', () => {
      const m1 = makeMember('Upper1');
      const m2 = makeMember('Upper2');
      const m3 = makeMember('Lower1', { gradeGroup: GradeGroup.LOWER });
      const m4 = makeMember('Lower2', { gradeGroup: GradeGroup.LOWER });
      const schedule = makeSchedule('2026-03-01', { isSplitClass: true, splitType: 'standard' });
      const upperAssignment = Assignment.create(schedule.id, 1, [m1.id, m2.id]);
      const lowerAssignment = Assignment.create(schedule.id, 2, [m3.id, m4.id]);

      const members = new Map<MemberId, Member>();
      members.set(m1.id, m1);
      members.set(m2.id, m2);
      members.set(m3.id, m3);
      members.set(m4.id, m4);

      const result = formatLineMessage(
        [upperAssignment, lowerAssignment], [schedule], members, 2026, 3, 'ja',
      );
      const lowerIdx = result.indexOf('1~3年:');
      const upperIdx = result.indexOf('4~6年:');
      expect(lowerIdx).toBeLessThan(upperIdx);
    });
  });

  describe('senior discussion split class (1~4 / 5~6)', () => {
    it('shows split tag and grade labels (ja)', () => {
      const m1 = makeMember('Alice');
      const m2 = makeMember('Bob');
      const m3 = makeMember('Charlie', { gradeGroup: GradeGroup.LOWER });
      const m4 = makeMember('Diana', { gradeGroup: GradeGroup.LOWER });
      const schedule = makeSchedule('2026-03-01', { isSplitClass: true, splitType: 'senior_discussion' });
      const upperAssignment = Assignment.create(schedule.id, 1, [m1.id, m2.id]);
      const lowerAssignment = Assignment.create(schedule.id, 2, [m3.id, m4.id]);

      const members = new Map<MemberId, Member>();
      members.set(m1.id, m1);
      members.set(m2.id, m2);
      members.set(m3.id, m3);
      members.set(m4.id, m4);

      const result = formatLineMessage(
        [upperAssignment, lowerAssignment], [schedule], members, 2026, 3, 'ja',
      );
      expect(result).toContain('📚 1~4年のクラスと、5~6年生が心の話を話すクラス');
      expect(result).toContain('1~4年: Charlie・Diana');
      expect(result).toContain('5~6年生: Alice・Bob');
    });

    it('shows split tag and grade labels (en)', () => {
      const m1 = makeMember('Alice');
      const m2 = makeMember('Bob');
      const m3 = makeMember('Charlie', { gradeGroup: GradeGroup.LOWER });
      const m4 = makeMember('Diana', { gradeGroup: GradeGroup.LOWER });
      const schedule = makeSchedule('2026-03-01', { isSplitClass: true, splitType: 'senior_discussion' });
      const upperAssignment = Assignment.create(schedule.id, 1, [m1.id, m2.id]);
      const lowerAssignment = Assignment.create(schedule.id, 2, [m3.id, m4.id]);

      const members = new Map<MemberId, Member>();
      members.set(m1.id, m1);
      members.set(m2.id, m2);
      members.set(m3.id, m3);
      members.set(m4.id, m4);

      const result = formatLineMessage(
        [upperAssignment, lowerAssignment], [schedule], members, 2026, 3, 'en',
      );
      expect(result).toContain('📚 Split: Grades 1-4 & Grades 5-6 (discussion)');
      expect(result).toContain('Grades 1-4: Charlie & Diana');
      expect(result).toContain('Grades 5-6: Alice & Bob');
    });
  });

  describe('splitType=null fallback', () => {
    it('falls back to standard when splitType is null (ja)', () => {
      const m1 = makeMember('Alice');
      const m2 = makeMember('Bob');
      const m3 = makeMember('Charlie', { gradeGroup: GradeGroup.LOWER });
      const m4 = makeMember('Diana', { gradeGroup: GradeGroup.LOWER });
      const schedule = makeSchedule('2026-03-01', { isSplitClass: true, splitType: null });
      const upperAssignment = Assignment.create(schedule.id, 1, [m1.id, m2.id]);
      const lowerAssignment = Assignment.create(schedule.id, 2, [m3.id, m4.id]);

      const members = new Map<MemberId, Member>();
      members.set(m1.id, m1);
      members.set(m2.id, m2);
      members.set(m3.id, m3);
      members.set(m4.id, m4);

      const result = formatLineMessage(
        [upperAssignment, lowerAssignment], [schedule], members, 2026, 3, 'ja',
      );
      expect(result).toContain('📚 1~3年と4~6年に分けてクラス');
      expect(result).toContain('1~3年:');
      expect(result).toContain('4~6年:');
    });
  });

  describe('footer', () => {
    it('includes footer text (ja)', () => {
      const m1 = makeMember('Alice');
      const m2 = makeMember('Bob');
      const schedule = makeSchedule('2026-03-01');
      const assignment = Assignment.create(schedule.id, 1, [m1.id, m2.id]);

      const members = new Map<MemberId, Member>();
      members.set(m1.id, m1);
      members.set(m2.id, m2);

      const result = formatLineMessage([assignment], [schedule], members, 2026, 3, 'ja');
      expect(result).toContain('※ヘルパーの方で難しい日がありましたら教えてください。');
    });

    it('includes footer text (en)', () => {
      const m1 = makeMember('Alice');
      const m2 = makeMember('Bob');
      const schedule = makeSchedule('2026-03-01');
      const assignment = Assignment.create(schedule.id, 1, [m1.id, m2.id]);

      const members = new Map<MemberId, Member>();
      members.set(m1.id, m1);
      members.set(m2.id, m2);

      const result = formatLineMessage([assignment], [schedule], members, 2026, 3, 'en');
      expect(result).toContain('If any helper has a scheduling conflict');
    });
  });
});
