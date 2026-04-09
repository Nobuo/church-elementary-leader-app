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
  checkSameGenderGroup,
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

  describe('checkSameGenderGroup (majority rule)', () => {
    it('2人: 異性ペアでsameGenderOnly → 違反', () => {
      const f = makeMember({ gender: Gender.FEMALE, sameGenderOnly: true });
      const m = makeMember({ gender: Gender.MALE });
      expect(checkSameGenderGroup([f, m])).not.toBeNull();
    });

    it('2人: 同性ペアでsameGenderOnly → OK', () => {
      const f1 = makeMember({ gender: Gender.FEMALE, sameGenderOnly: true });
      const f2 = makeMember({ gender: Gender.FEMALE });
      expect(checkSameGenderGroup([f1, f2])).toBeNull();
    });

    it('3人: 女2+男1でsameGenderOnly女性 → OK（過半数）', () => {
      const f1 = makeMember({ gender: Gender.FEMALE, sameGenderOnly: true });
      const f2 = makeMember({ gender: Gender.FEMALE });
      const m = makeMember({ gender: Gender.MALE });
      expect(checkSameGenderGroup([f1, f2, m])).toBeNull();
    });

    it('3人: 女1+男2でsameGenderOnly女性 → 違反（少数派）', () => {
      const f = makeMember({ gender: Gender.FEMALE, sameGenderOnly: true });
      const m1 = makeMember({ gender: Gender.MALE });
      const m2 = makeMember({ gender: Gender.MALE });
      expect(checkSameGenderGroup([f, m1, m2])).not.toBeNull();
    });

    it('3人: 男1+女2でsameGenderOnly男性 → 違反（少数派）', () => {
      const m = makeMember({ gender: Gender.MALE, sameGenderOnly: true });
      const f1 = makeMember({ gender: Gender.FEMALE });
      const f2 = makeMember({ gender: Gender.FEMALE });
      expect(checkSameGenderGroup([m, f1, f2])).not.toBeNull();
    });

    it('3人: 男2+女1でsameGenderOnly男性 → OK（過半数）', () => {
      const m1 = makeMember({ gender: Gender.MALE, sameGenderOnly: true });
      const m2 = makeMember({ gender: Gender.MALE });
      const f = makeMember({ gender: Gender.FEMALE });
      expect(checkSameGenderGroup([m1, m2, f])).toBeNull();
    });

    it('3人: 全員同性でsameGenderOnly → OK', () => {
      const f1 = makeMember({ gender: Gender.FEMALE, sameGenderOnly: true });
      const f2 = makeMember({ gender: Gender.FEMALE });
      const f3 = makeMember({ gender: Gender.FEMALE });
      expect(checkSameGenderGroup([f1, f2, f3])).toBeNull();
    });

    it('4人: 女2+男2でsameGenderOnly女性 → 違反（同数=過半数でない）', () => {
      const f1 = makeMember({ gender: Gender.FEMALE, sameGenderOnly: true });
      const f2 = makeMember({ gender: Gender.FEMALE });
      const m1 = makeMember({ gender: Gender.MALE });
      const m2 = makeMember({ gender: Gender.MALE });
      expect(checkSameGenderGroup([f1, f2, m1, m2])).not.toBeNull();
    });

    it('4人: 女3+男1でsameGenderOnly女性 → OK（過半数）', () => {
      const f1 = makeMember({ gender: Gender.FEMALE, sameGenderOnly: true });
      const f2 = makeMember({ gender: Gender.FEMALE });
      const f3 = makeMember({ gender: Gender.FEMALE });
      const m = makeMember({ gender: Gender.MALE });
      expect(checkSameGenderGroup([f1, f2, f3, m])).toBeNull();
    });

    it('sameGenderOnly=falseのみ → 常にOK', () => {
      const m = makeMember({ gender: Gender.MALE });
      const f = makeMember({ gender: Gender.FEMALE });
      expect(checkSameGenderGroup([m, f])).toBeNull();
      expect(checkSameGenderGroup([m, f, f])).toBeNull();
    });

    it('複数sameGenderOnly（同性）→ OK', () => {
      const f1 = makeMember({ gender: Gender.FEMALE, sameGenderOnly: true });
      const f2 = makeMember({ gender: Gender.FEMALE, sameGenderOnly: true });
      const m = makeMember({ gender: Gender.MALE });
      expect(checkSameGenderGroup([f1, f2, m])).toBeNull();
    });

    it('複数sameGenderOnly（異性、3人）→ 少なくとも1人が違反', () => {
      const f = makeMember({ gender: Gender.FEMALE, sameGenderOnly: true });
      const m1 = makeMember({ gender: Gender.MALE, sameGenderOnly: true });
      const m2 = makeMember({ gender: Gender.MALE });
      const result = checkSameGenderGroup([f, m1, m2]);
      expect(result).not.toBeNull();
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

    it('no warning when expected is low and count = ceil(expected)', () => {
      // 28 totalSlots, 22 members → expected ≈ 1.27
      // count=2 should NOT trigger (2 < max(1.91, 3.27) = 3.27)
      const members = Array.from({ length: 22 }, (_, i) =>
        makeMember({ name: `M${i}` }),
      );
      const counts = new Map<MemberId, number>();
      for (const m of members) counts.set(m.id, 1);
      // Give 6 members count=2 (total = 6*2 + 16*1 = 28 slots filled)
      let i = 0;
      for (const m of members) {
        if (i < 6) counts.set(m.id, 2);
        i++;
      }
      const violations = checkExcessiveCount(members, counts, 28);
      expect(violations).toHaveLength(0);
    });

    it('warns when truly excessive at low expected', () => {
      // 28 totalSlots, 22 members → expected ≈ 1.27
      // count=4 should trigger (4 > max(1.91, 3.27) = 3.27)
      const members = Array.from({ length: 22 }, (_, i) =>
        makeMember({ name: `M${i}` }),
      );
      const counts = new Map<MemberId, number>();
      for (const m of members) counts.set(m.id, 1);
      counts.set(members[0].id, 4);
      const violations = checkExcessiveCount(members, counts, 28);
      expect(violations.some((v) => v.message.includes('too many'))).toBe(true);
    });

    it('no too-few warning when expected is low', () => {
      // 28 totalSlots, 22 members → expected ≈ 1.27
      // tooFewThreshold = min(0.64, -0.73) = -0.73 → never triggers
      const members = Array.from({ length: 22 }, (_, i) =>
        makeMember({ name: `M${i}` }),
      );
      const counts = new Map<MemberId, number>();
      for (const m of members) counts.set(m.id, 2);
      counts.set(members[0].id, 1); // below expected but should not warn
      const violations = checkExcessiveCount(members, counts, 28);
      const tooFew = violations.filter((v) => v.message.includes('too few'));
      expect(tooFew).toHaveLength(0);
    });

    it('high expected still warns at 1.5x threshold', () => {
      // 168 totalSlots, 22 members → expected ≈ 7.64
      // tooManyThreshold = max(11.45, 9.64) = 11.45 → count 12 triggers
      const members = Array.from({ length: 22 }, (_, i) =>
        makeMember({ name: `M${i}` }),
      );
      const counts = new Map<MemberId, number>();
      for (const m of members) counts.set(m.id, 7);
      counts.set(members[0].id, 12);
      const violations = checkExcessiveCount(members, counts, 168);
      expect(violations.some((v) => v.message.includes('too many'))).toBe(true);
    });
  });
});
