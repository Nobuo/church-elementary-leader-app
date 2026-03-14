import { describe, it, expect } from 'vitest';
import { Member } from '@domain/entities/member';
import { Gender } from '@domain/value-objects/gender';
import { Language } from '@domain/value-objects/language';
import { GradeGroup } from '@domain/value-objects/grade-group';
import { MemberType } from '@domain/value-objects/member-type';
import { MemberId, createMemberId } from '@shared/types';
import { formatMemberCsv } from '@domain/services/member-csv-formatter';

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

describe('formatMemberCsv', () => {
  it('outputs BOM and Japanese headers', () => {
    const csv = formatMemberCsv([], new Map(), 'ja');
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('氏名');
  });

  it('outputs English headers', () => {
    const csv = formatMemberCsv([], new Map(), 'en');
    expect(csv).toContain('Name');
    expect(csv).toContain('Grade Group');
  });

  it('formats member data correctly', () => {
    const m = makeMember('田中太郎', {
      gender: Gender.MALE,
      language: Language.JAPANESE,
      gradeGroup: GradeGroup.LOWER,
      memberType: MemberType.PARENT_SINGLE,
      sameGenderOnly: true,
    });
    const memberMap = new Map<MemberId, Member>([[m.id, m]]);

    const csv = formatMemberCsv([m], memberMap, 'ja');
    const lines = csv.replace('\uFEFF', '').split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('田中太郎');
    expect(lines[1]).toContain('MALE');
    expect(lines[1]).toContain('JAPANESE');
    expect(lines[1]).toContain('LOWER');
    expect(lines[1]).toContain('PARENT_SINGLE');
    expect(lines[1]).toContain('TRUE');
  });

  it('includes spouse name', () => {
    const spouseId = createMemberId();
    const m1 = makeMember('夫', {
      memberType: MemberType.PARENT_COUPLE,
      spouseId,
    });
    const m2 = Member.reconstruct({
      id: spouseId,
      name: '妻',
      gender: Gender.FEMALE,
      language: Language.ENGLISH,
      gradeGroup: GradeGroup.LOWER,
      memberType: MemberType.PARENT_COUPLE,
      sameGenderOnly: false,
      spouseId: m1.id,
      availableDates: null,
      isActive: true,
    });

    const memberMap = new Map<MemberId, Member>([
      [m1.id, m1],
      [m2.id, m2],
    ]);

    const csv = formatMemberCsv([m1, m2], memberMap, 'ja');
    const lines = csv.replace('\uFEFF', '').split('\n');
    // m1's row should contain spouse name '妻'
    expect(lines[1]).toContain('妻');
  });

  it('formats available dates with semicolons', () => {
    const m = makeMember('Test', {
      availableDates: ['2026-04-05', '2026-04-12'],
    });
    const memberMap = new Map<MemberId, Member>([[m.id, m]]);

    const csv = formatMemberCsv([m], memberMap, 'ja');
    expect(csv).toContain('2026-04-05;2026-04-12');
  });
});
