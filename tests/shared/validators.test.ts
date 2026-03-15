import { describe, it, expect } from 'vitest';
import {
  isValidGender,
  isValidLanguage,
  isValidGradeGroup,
  isValidMemberType,
  isValidYear,
  isValidMonth,
  isValidDateString,
} from '@shared/validators';

describe('validators', () => {
  describe('isValidGender', () => {
    it('accepts valid genders', () => {
      expect(isValidGender('MALE')).toBe(true);
      expect(isValidGender('FEMALE')).toBe(true);
    });
    it('rejects invalid genders', () => {
      expect(isValidGender('ATTACK')).toBe(false);
      expect(isValidGender('')).toBe(false);
      expect(isValidGender('male')).toBe(false);
    });
  });

  describe('isValidLanguage', () => {
    it('accepts valid languages', () => {
      expect(isValidLanguage('JAPANESE')).toBe(true);
      expect(isValidLanguage('ENGLISH')).toBe(true);
      expect(isValidLanguage('BOTH')).toBe(true);
    });
    it('rejects invalid languages', () => {
      expect(isValidLanguage('FRENCH')).toBe(false);
    });
  });

  describe('isValidGradeGroup', () => {
    it('accepts valid grade groups', () => {
      expect(isValidGradeGroup('LOWER')).toBe(true);
      expect(isValidGradeGroup('UPPER')).toBe(true);
    });
    it('rejects invalid grade groups', () => {
      expect(isValidGradeGroup('MIDDLE')).toBe(false);
    });
  });

  describe('isValidMemberType', () => {
    it('accepts valid member types', () => {
      expect(isValidMemberType('PARENT_COUPLE')).toBe(true);
      expect(isValidMemberType('PARENT_SINGLE')).toBe(true);
      expect(isValidMemberType('HELPER')).toBe(true);
    });
    it('rejects invalid member types', () => {
      expect(isValidMemberType('ADMIN')).toBe(false);
    });
  });

  describe('isValidYear', () => {
    it('accepts valid years', () => {
      expect(isValidYear(2024)).toBe(true);
      expect(isValidYear(2000)).toBe(true);
      expect(isValidYear(2100)).toBe(true);
    });
    it('rejects invalid years', () => {
      expect(isValidYear(1999)).toBe(false);
      expect(isValidYear(2101)).toBe(false);
      expect(isValidYear(-1)).toBe(false);
      expect(isValidYear(2024.5)).toBe(false);
    });
  });

  describe('isValidMonth', () => {
    it('accepts valid months', () => {
      expect(isValidMonth(1)).toBe(true);
      expect(isValidMonth(12)).toBe(true);
    });
    it('rejects invalid months', () => {
      expect(isValidMonth(0)).toBe(false);
      expect(isValidMonth(13)).toBe(false);
      expect(isValidMonth(-1)).toBe(false);
    });
  });

  describe('isValidDateString', () => {
    it('accepts valid date strings', () => {
      expect(isValidDateString('2024-01-15')).toBe(true);
      expect(isValidDateString('2027-12-31')).toBe(true);
    });
    it('rejects invalid date strings', () => {
      expect(isValidDateString('not-a-date')).toBe(false);
      expect(isValidDateString('2024/01/15')).toBe(false);
      expect(isValidDateString('')).toBe(false);
      expect(isValidDateString('2024-13-01')).toBe(false);
    });
    it('rejects non-existent dates', () => {
      expect(isValidDateString('2024-02-30')).toBe(false);
      expect(isValidDateString('2024-04-31')).toBe(false);
      expect(isValidDateString('2023-02-29')).toBe(false);
    });
    it('accepts valid leap year date', () => {
      expect(isValidDateString('2024-02-29')).toBe(true);
    });
  });
});
