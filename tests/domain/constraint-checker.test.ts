import { describe, it, expect } from 'vitest';
import { Member } from '@domain/entities/member';
import { Gender } from '@domain/value-objects/gender';
import { Language } from '@domain/value-objects/language';
import { GradeGroup } from '@domain/value-objects/grade-group';
import { MemberType } from '@domain/value-objects/member-type';
import { createMemberId } from '@shared/types';
import {
  checkLanguageBalance,
  checkSameGender,
  checkSpouseSameGroup,
  checkExcessiveCount,
} from '@domain/services/constraint-checker';
import { MemberId } from '@shared/types';

function makeMember(overrides: Partial<Parameters<typeof Member.create>[0]> = {}) {
  const result = Member.create({
    name: 'Test',
    gender: Gender.MALE,
    language: Language.JAPANESE,
    gradeGroup: GradeGroup.UPPER,
    memberType: MemberType.PARENT_SINGLE,
    sameGenderOnly: false,
    spouseId: null,
    availableDates: null,
    ...overrides,
  });
  if (!result.ok) throw new Error('Failed to create test member');
  return result.value;
}

describe('constraint-checker', () => {
  describe('checkLanguageBalance', () => {
    it('passes when pair covers both languages', () => {
      const m1 = makeMember({ language: Language.JAPANESE });
      const m2 = makeMember({ language: Language.ENGLISH });
      expect(checkLanguageBalance(m1, m2)).toBeNull();
    });

    it('passes when one member covers both', () => {
      const m1 = makeMember({ language: Language.BOTH });
      const m2 = makeMember({ language: Language.JAPANESE });
      expect(checkLanguageBalance(m1, m2)).toBeNull();
    });

    it('fails when both are Japanese only', () => {
      const m1 = makeMember({ language: Language.JAPANESE });
      const m2 = makeMember({ language: Language.JAPANESE });
      expect(checkLanguageBalance(m1, m2)).not.toBeNull();
    });

    it('fails when both are English only', () => {
      const m1 = makeMember({ language: Language.ENGLISH });
      const m2 = makeMember({ language: Language.ENGLISH });
      expect(checkLanguageBalance(m1, m2)).not.toBeNull();
    });

    it('includes messageKey and messageParams', () => {
      const m1 = makeMember({ language: Language.JAPANESE });
      const m2 = makeMember({ language: Language.JAPANESE });
      const violation = checkLanguageBalance(m1, m2);
      expect(violation?.messageKey).toBe('violations.languageCoverage');
      expect(violation?.messageParams.missing).toBe('English');
    });
  });

  describe('checkSameGender', () => {
    it('passes when neither requires same gender', () => {
      const m1 = makeMember({ gender: Gender.MALE, sameGenderOnly: false });
      const m2 = makeMember({ gender: Gender.FEMALE, sameGenderOnly: false });
      expect(checkSameGender(m1, m2)).toBeNull();
    });

    it('passes when same-gender-only member paired with same gender', () => {
      const m1 = makeMember({ gender: Gender.FEMALE, sameGenderOnly: true });
      const m2 = makeMember({ gender: Gender.FEMALE, sameGenderOnly: false });
      expect(checkSameGender(m1, m2)).toBeNull();
    });

    it('fails when same-gender-only member paired with different gender', () => {
      const m1 = makeMember({ gender: Gender.FEMALE, sameGenderOnly: true });
      const m2 = makeMember({ gender: Gender.MALE, sameGenderOnly: false });
      expect(checkSameGender(m1, m2)).not.toBeNull();
    });
  });

  describe('checkSpouseSameGroup', () => {
    it('detects spouses in same group', () => {
      const spouseId = createMemberId();
      const m1 = makeMember({
        memberType: MemberType.PARENT_COUPLE,
        spouseId,
      });
      const m2 = Member.reconstruct({
        id: spouseId,
        name: 'Spouse',
        gender: Gender.FEMALE,
        language: Language.ENGLISH,
        gradeGroup: GradeGroup.LOWER,
        memberType: MemberType.PARENT_COUPLE,
        sameGenderOnly: false,
        spouseId: m1.id,
        availableDates: null,
        isActive: true,
      });

      expect(checkSpouseSameGroup(m1, m2)).not.toBeNull();
    });

    it('does not flag PARENT_SINGLE even with spouseId quirk', () => {
      const m1 = makeMember({ memberType: MemberType.PARENT_SINGLE });
      const m2 = makeMember({ memberType: MemberType.PARENT_SINGLE });
      expect(checkSpouseSameGroup(m1, m2)).toBeNull();
    });

    it('does not flag HELPER', () => {
      const m1 = makeMember({ memberType: MemberType.HELPER });
      const m2 = makeMember({ memberType: MemberType.HELPER });
      expect(checkSpouseSameGroup(m1, m2)).toBeNull();
    });
  });

  describe('checkExcessiveCount', () => {
    it('includes messageKey and messageParams', () => {
      const m1 = makeMember({ name: 'Alice' });
      const m2 = makeMember({ name: 'Bob' });
      const counts = new Map<MemberId, number>([
        [m1.id, 31],
        [m2.id, 15],
      ]);
      // 10 sundays × 4 slots = 40 total slots
      const violations = checkExcessiveCount([m1, m2], counts, 40);
      expect(violations[0].messageKey).toBe('violations.excessiveCount');
      expect(violations[0].messageParams.name).toBe('Alice');
      expect(violations[0].messageParams.direction).toBe('tooMany');
    });

    it('warns when member count exceeds 1.5x expected', () => {
      const m1 = makeMember({ name: 'Alice' });
      const m2 = makeMember({ name: 'Bob' });
      // 40 totalSlots, 2 members → expected = 40/2 = 20
      // Alice has 31 (>30), Bob has 15
      const counts = new Map<MemberId, number>([
        [m1.id, 31],
        [m2.id, 15],
      ]);
      const violations = checkExcessiveCount([m1, m2], counts, 40);
      expect(violations.length).toBe(1);
      expect(violations[0].message).toContain('Alice');
      expect(violations[0].message).toContain('too many');
    });

    it('warns when member count is below 0.5x expected', () => {
      const m1 = makeMember({ name: 'Alice' });
      const m2 = makeMember({ name: 'Bob' });
      const m3 = makeMember({ name: 'Charlie' });
      // 48 totalSlots, 3 members → expected = 48/3 = 16
      // Bob has 7 (<8), count > 0
      const counts = new Map<MemberId, number>([
        [m1.id, 16],
        [m2.id, 7],
        [m3.id, 25],
      ]);
      const violations = checkExcessiveCount([m1, m2, m3], counts, 48);
      expect(violations.some((v) => v.message.includes('too few'))).toBe(true);
      expect(violations.some((v) => v.message.includes('too many'))).toBe(true);
    });

    it('returns no violations when counts are balanced', () => {
      const m1 = makeMember({ name: 'Alice' });
      const m2 = makeMember({ name: 'Bob' });
      // 40 totalSlots, 2 members → expected = 20
      const counts = new Map<MemberId, number>([
        [m1.id, 18],
        [m2.id, 22],
      ]);
      const violations = checkExcessiveCount([m1, m2], counts, 40);
      expect(violations).toHaveLength(0);
    });

    it('returns empty for no members', () => {
      expect(checkExcessiveCount([], new Map(), 40)).toHaveLength(0);
    });
  });
});
