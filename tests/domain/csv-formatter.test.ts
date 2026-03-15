import { describe, it, expect } from 'vitest';
import { Member } from '@domain/entities/member';
import { Schedule } from '@domain/entities/schedule';
import { Assignment } from '@domain/entities/assignment';
import { Gender } from '@domain/value-objects/gender';
import { Language } from '@domain/value-objects/language';
import { GradeGroup } from '@domain/value-objects/grade-group';
import { MemberType } from '@domain/value-objects/member-type';
import { MemberId, createScheduleId } from '@shared/types';
import { formatCsv } from '@domain/services/csv-formatter';

function makeMember(
  name: string,
  overrides: Partial<Parameters<typeof Member.create>[0]> = {},
): Member {
  const result = Member.create({
    name,
    gender: Gender.MALE,
    language: Language.JAPANESE,
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
  opts: { isEvent?: boolean; isSplitClass?: boolean } = {},
): Schedule {
  return Schedule.reconstruct({
    id: createScheduleId(),
    date,
    isExcluded: false,
    isEvent: opts.isEvent ?? false,
    isSplitClass: opts.isSplitClass ?? false,
    year: 2025,
  });
}

describe('formatCsv', () => {
  it('outputs BOM and correct headers (ja)', () => {
    const csv = formatCsv([], [], new Map(), 'ja');
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('日付,イベント日,分級,グループ番号');
  });

  it('outputs correct headers (en)', () => {
    const csv = formatCsv([], [], new Map(), 'en');
    expect(csv).toContain('Date,Event Day,Split Class,Group');
  });

  it('outputs TRUE for event day', () => {
    const m1 = makeMember('Alice');
    const m2 = makeMember('Bob');
    const schedule = makeSchedule('2026-03-01', { isEvent: true });
    const assignment = Assignment.create(schedule.id, 1, [m1.id, m2.id]);
    const members = new Map<MemberId, Member>([[m1.id, m1], [m2.id, m2]]);

    const csv = formatCsv([assignment], [schedule], members, 'en');
    const dataLine = csv.split('\n')[1];
    expect(dataLine).toContain('TRUE,FALSE'); // isEvent=TRUE, isSplitClass=FALSE
  });

  it('outputs TRUE for split-class day', () => {
    const m1 = makeMember('Alice');
    const m2 = makeMember('Bob');
    const schedule = makeSchedule('2026-03-01', { isSplitClass: true });
    const assignment = Assignment.create(schedule.id, 1, [m1.id, m2.id]);
    const members = new Map<MemberId, Member>([[m1.id, m1], [m2.id, m2]]);

    const csv = formatCsv([assignment], [schedule], members, 'en');
    const dataLine = csv.split('\n')[1];
    expect(dataLine).toContain('FALSE,TRUE'); // isEvent=FALSE, isSplitClass=TRUE
  });

  it('outputs FALSE for normal day', () => {
    const m1 = makeMember('Alice');
    const m2 = makeMember('Bob');
    const schedule = makeSchedule('2026-03-01');
    const assignment = Assignment.create(schedule.id, 1, [m1.id, m2.id]);
    const members = new Map<MemberId, Member>([[m1.id, m1], [m2.id, m2]]);

    const csv = formatCsv([assignment], [schedule], members, 'en');
    const dataLine = csv.split('\n')[1];
    expect(dataLine).toContain('FALSE,FALSE');
  });

  it('escapes member names containing commas', () => {
    const m1 = makeMember('Last, First');
    const m2 = makeMember('Bob');
    const schedule = makeSchedule('2026-03-01');
    const assignment = Assignment.create(schedule.id, 1, [m1.id, m2.id]);
    const members = new Map<MemberId, Member>([[m1.id, m1], [m2.id, m2]]);

    const csv = formatCsv([assignment], [schedule], members, 'en');
    expect(csv).toContain('"Last, First"');
  });

  it('escapes member names containing double quotes', () => {
    const m1 = makeMember('Nick "The" Name');
    const m2 = makeMember('Bob');
    const schedule = makeSchedule('2026-03-01');
    const assignment = Assignment.create(schedule.id, 1, [m1.id, m2.id]);
    const members = new Map<MemberId, Member>([[m1.id, m1], [m2.id, m2]]);

    const csv = formatCsv([assignment], [schedule], members, 'en');
    expect(csv).toContain('"Nick ""The"" Name"');
  });
});
