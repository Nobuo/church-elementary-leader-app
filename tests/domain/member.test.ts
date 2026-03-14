import { describe, it, expect } from 'vitest';
import { Member } from '@domain/entities/member';
import { Gender } from '@domain/value-objects/gender';
import { Language } from '@domain/value-objects/language';
import { GradeGroup } from '@domain/value-objects/grade-group';
import { MemberType } from '@domain/value-objects/member-type';
import { createMemberId } from '@shared/types';

describe('Member', () => {
  const validInput = {
    name: 'Taro Tanaka',
    gender: Gender.MALE,
    language: Language.JAPANESE,
    gradeGroup: GradeGroup.UPPER,
    memberType: MemberType.PARENT_SINGLE,
    sameGenderOnly: false,
    spouseId: null,
    availableDates: null,
  };

  it('creates a valid member', () => {
    const result = Member.create(validInput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('Taro Tanaka');
      expect(result.value.isActive).toBe(true);
    }
  });

  it('rejects empty name', () => {
    const result = Member.create({ ...validInput, name: '' });
    expect(result.ok).toBe(false);
  });

  it('allows PARENT_COUPLE without spouseId (spouse registered later)', () => {
    const result = Member.create({
      ...validInput,
      memberType: MemberType.PARENT_COUPLE,
      spouseId: null,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects non-PARENT_COUPLE with spouseId', () => {
    const result = Member.create({
      ...validInput,
      memberType: MemberType.PARENT_SINGLE,
      spouseId: createMemberId(),
    });
    expect(result.ok).toBe(false);
  });

  it('accepts PARENT_COUPLE with spouseId', () => {
    const result = Member.create({
      ...validInput,
      memberType: MemberType.PARENT_COUPLE,
      spouseId: createMemberId(),
    });
    expect(result.ok).toBe(true);
  });

  it('deactivates a member', () => {
    const result = Member.create(validInput);
    if (!result.ok) throw new Error('should succeed');
    const deactivated = result.value.deactivate();
    expect(deactivated.isActive).toBe(false);
    expect(deactivated.name).toBe('Taro Tanaka');
  });

  it('checks availability when no constraints', () => {
    const result = Member.create(validInput);
    if (!result.ok) throw new Error('should succeed');
    expect(result.value.isAvailableOn('2026-04-05')).toBe(true);
  });

  it('checks availability with specific dates', () => {
    const result = Member.create({
      ...validInput,
      availableDates: ['2026-04-05', '2026-04-12'],
    });
    if (!result.ok) throw new Error('should succeed');
    expect(result.value.isAvailableOn('2026-04-05')).toBe(true);
    expect(result.value.isAvailableOn('2026-04-19')).toBe(false);
  });
});
