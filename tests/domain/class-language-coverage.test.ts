import { describe, it, expect } from 'vitest';
import { checkClassLanguageCoverage } from '@domain/services/constraint-checker';
import { Member } from '@domain/entities/member';
import { Gender } from '@domain/value-objects/gender';
import { Language } from '@domain/value-objects/language';
import { GradeGroup } from '@domain/value-objects/grade-group';
import { MemberType } from '@domain/value-objects/member-type';
import { Schedule } from '@domain/entities/schedule';
import { generateAssignments } from '@domain/services/assignment-generator';

function makeMember(
  name: string,
  overrides: Partial<{
    gender: Gender;
    language: Language;
    gradeGroup: GradeGroup;
    memberType: MemberType;
  }> = {},
): Member {
  const result = Member.create({
    name,
    gender: overrides.gender ?? Gender.MALE,
    language: overrides.language ?? Language.BOTH,
    gradeGroup: overrides.gradeGroup ?? GradeGroup.UPPER,
    memberType: overrides.memberType ?? MemberType.PARENT_SINGLE,
    sameGenderOnly: false,
  });
  if (!result.ok) throw new Error(`Failed to create member: ${result.error}`);
  return result.value;
}

describe('checkClassLanguageCoverage', () => {
  it('T3: no violations when 4 members have 2 BOTH', () => {
    const members = [
      makeMember('U1', { language: Language.BOTH, gradeGroup: GradeGroup.UPPER }),
      makeMember('U2', { language: Language.JAPANESE, gradeGroup: GradeGroup.UPPER }),
      makeMember('L1', { language: Language.BOTH, gradeGroup: GradeGroup.LOWER }),
      makeMember('L2', { language: Language.ENGLISH, gradeGroup: GradeGroup.LOWER }),
    ];

    const violations = checkClassLanguageCoverage(members);
    expect(violations).toHaveLength(0);
  });

  it('T4: violation when only 1 BOTH in 4 members', () => {
    const members = [
      makeMember('U1', { language: Language.JAPANESE, gradeGroup: GradeGroup.UPPER }),
      makeMember('U2', { language: Language.ENGLISH, gradeGroup: GradeGroup.UPPER }),
      makeMember('L1', { language: Language.BOTH, gradeGroup: GradeGroup.LOWER }),
      makeMember('L2', { language: Language.JAPANESE, gradeGroup: GradeGroup.LOWER }),
    ];

    const violations = checkClassLanguageCoverage(members);
    expect(violations).toHaveLength(1);
    expect(violations[0].type).toBe('CLASS_LANGUAGE_COVERAGE');
    expect(violations[0].messageParams.count).toBe('1');
  });

  it('T5: violation when 0 BOTH in 4 members', () => {
    const members = [
      makeMember('U1', { language: Language.JAPANESE, gradeGroup: GradeGroup.UPPER }),
      makeMember('U2', { language: Language.ENGLISH, gradeGroup: GradeGroup.UPPER }),
      makeMember('L1', { language: Language.JAPANESE, gradeGroup: GradeGroup.LOWER }),
      makeMember('L2', { language: Language.ENGLISH, gradeGroup: GradeGroup.LOWER }),
    ];

    const violations = checkClassLanguageCoverage(members);
    expect(violations).toHaveLength(1);
    expect(violations[0].messageParams.count).toBe('0');
  });

  it('T6: no violations when 3 BOTH', () => {
    const members = [
      makeMember('U1', { language: Language.BOTH, gradeGroup: GradeGroup.UPPER }),
      makeMember('U2', { language: Language.BOTH, gradeGroup: GradeGroup.UPPER }),
      makeMember('L1', { language: Language.BOTH, gradeGroup: GradeGroup.LOWER }),
      makeMember('L2', { language: Language.ENGLISH, gradeGroup: GradeGroup.LOWER }),
    ];

    const violations = checkClassLanguageCoverage(members);
    expect(violations).toHaveLength(0);
  });

  it('T7: no violations when all are BOTH', () => {
    const members = [
      makeMember('U1', { language: Language.BOTH, gradeGroup: GradeGroup.UPPER }),
      makeMember('U2', { language: Language.BOTH, gradeGroup: GradeGroup.UPPER }),
      makeMember('L1', { language: Language.BOTH, gradeGroup: GradeGroup.LOWER }),
      makeMember('L2', { language: Language.BOTH, gradeGroup: GradeGroup.LOWER }),
    ];

    const violations = checkClassLanguageCoverage(members);
    expect(violations).toHaveLength(0);
  });
});

describe('assignment generator with split-class', () => {
  function makeSchedule(date: string, isSplitClass: boolean): Schedule {
    const result = Schedule.create(date);
    if (!result.ok) throw new Error(`Not a Sunday: ${date}`);
    const schedule = result.value;
    if (isSplitClass) return schedule.toggleSplitClass();
    return schedule;
  }

  it('T8: split-class day with 2+ BOTH produces no violation', () => {
    const members = [
      makeMember('U-BOTH', { language: Language.BOTH, gradeGroup: GradeGroup.UPPER }),
      makeMember('U-JP', { language: Language.JAPANESE, gradeGroup: GradeGroup.UPPER }),
      makeMember('L-BOTH', { language: Language.BOTH, gradeGroup: GradeGroup.LOWER }),
      makeMember('L-EN', { language: Language.ENGLISH, gradeGroup: GradeGroup.LOWER }),
    ];

    const schedule = makeSchedule('2026-04-05', true);
    const { assignments, violations } = generateAssignments(
      [schedule], members, [], new Map(),
    );

    expect(assignments).toHaveLength(2);
    const classViolations = violations.filter(v => v.type === 'CLASS_LANGUAGE_COVERAGE');
    expect(classViolations).toHaveLength(0);
  });

  it('T9: split-class day with only 1 BOTH total produces violation', () => {
    const members = [
      makeMember('U-JP', { language: Language.JAPANESE, gradeGroup: GradeGroup.UPPER }),
      makeMember('U-EN', { language: Language.ENGLISH, gradeGroup: GradeGroup.UPPER }),
      makeMember('L-BOTH', { language: Language.BOTH, gradeGroup: GradeGroup.LOWER }),
      makeMember('L-JP', { language: Language.JAPANESE, gradeGroup: GradeGroup.LOWER }),
    ];

    const schedule = makeSchedule('2026-04-05', true);
    const { violations } = generateAssignments(
      [schedule], members, [], new Map(),
    );

    const classViolations = violations.filter(v => v.type === 'CLASS_LANGUAGE_COVERAGE');
    expect(classViolations.length).toBeGreaterThanOrEqual(1);
    expect(classViolations[0].messageParams.count).toBe('1');
  });

  it('T10: split-class day with 0 BOTH produces violation', () => {
    const members = [
      makeMember('U-JP', { language: Language.JAPANESE, gradeGroup: GradeGroup.UPPER }),
      makeMember('U-EN', { language: Language.ENGLISH, gradeGroup: GradeGroup.UPPER }),
      makeMember('L-JP', { language: Language.JAPANESE, gradeGroup: GradeGroup.LOWER }),
      makeMember('L-EN', { language: Language.ENGLISH, gradeGroup: GradeGroup.LOWER }),
    ];

    const schedule = makeSchedule('2026-04-05', true);
    const { violations } = generateAssignments(
      [schedule], members, [], new Map(),
    );

    const classViolations = violations.filter(v => v.type === 'CLASS_LANGUAGE_COVERAGE');
    expect(classViolations.length).toBeGreaterThanOrEqual(1);
    expect(classViolations[0].messageParams.count).toBe('0');
  });

  it('T11: non-split-class day does not check class language coverage', () => {
    const members = [
      makeMember('U-JP', { language: Language.JAPANESE, gradeGroup: GradeGroup.UPPER }),
      makeMember('U-EN', { language: Language.ENGLISH, gradeGroup: GradeGroup.UPPER }),
      makeMember('L-JP', { language: Language.JAPANESE, gradeGroup: GradeGroup.LOWER }),
      makeMember('L-EN', { language: Language.ENGLISH, gradeGroup: GradeGroup.LOWER }),
    ];

    // Non-split day
    const schedule = makeSchedule('2026-04-05', false);
    const { violations } = generateAssignments(
      [schedule], members, [], new Map(),
    );

    const classViolations = violations.filter(v => v.type === 'CLASS_LANGUAGE_COVERAGE');
    expect(classViolations).toHaveLength(0);
  });

  it('T12: Group 2 selects BOTH members to reach total of 2', () => {
    // Group 1 might get 0 BOTH, Group 2 should compensate with 2 BOTH
    const members = [
      makeMember('U-JP', { language: Language.JAPANESE, gradeGroup: GradeGroup.UPPER }),
      makeMember('U-BOTH', { language: Language.BOTH, gradeGroup: GradeGroup.UPPER }),
      makeMember('U-EN', { language: Language.ENGLISH, gradeGroup: GradeGroup.UPPER }),
      makeMember('L-JP', { language: Language.JAPANESE, gradeGroup: GradeGroup.LOWER }),
      makeMember('L-BOTH', { language: Language.BOTH, gradeGroup: GradeGroup.LOWER }),
      makeMember('L-EN', { language: Language.ENGLISH, gradeGroup: GradeGroup.LOWER }),
    ];

    const schedule = makeSchedule('2026-04-05', true);
    const { violations } = generateAssignments(
      [schedule], members, [], new Map(),
    );

    const classViolations = violations.filter(v => v.type === 'CLASS_LANGUAGE_COVERAGE');
    expect(classViolations).toHaveLength(0);
  });
});

describe('Schedule.isSplitClass', () => {
  it('T1: defaults to false', () => {
    const result = Schedule.create('2026-04-05');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.isSplitClass).toBe(false);
    }
  });

  it('T2: toggles split class', () => {
    const result = Schedule.create('2026-04-05');
    if (!result.ok) throw new Error('bad schedule');
    const toggled = result.value.toggleSplitClass();
    expect(toggled.isSplitClass).toBe(true);
    const toggledBack = toggled.toggleSplitClass();
    expect(toggledBack.isSplitClass).toBe(false);
  });
});
