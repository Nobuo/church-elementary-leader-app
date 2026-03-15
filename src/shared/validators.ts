import { Gender } from '@domain/value-objects/gender';
import { Language } from '@domain/value-objects/language';
import { GradeGroup } from '@domain/value-objects/grade-group';
import { MemberType } from '@domain/value-objects/member-type';

const GENDERS = Object.values(Gender) as string[];
const LANGUAGES = Object.values(Language) as string[];
const GRADE_GROUPS = Object.values(GradeGroup) as string[];
const MEMBER_TYPES = Object.values(MemberType) as string[];

export function isValidGender(v: string): v is Gender {
  return GENDERS.includes(v);
}

export function isValidLanguage(v: string): v is Language {
  return LANGUAGES.includes(v);
}

export function isValidGradeGroup(v: string): v is GradeGroup {
  return GRADE_GROUPS.includes(v);
}

export function isValidMemberType(v: string): v is MemberType {
  return MEMBER_TYPES.includes(v);
}

export function isValidYear(v: number): boolean {
  return Number.isInteger(v) && v >= 2000 && v <= 2100;
}

export function isValidMonth(v: number): boolean {
  return Number.isInteger(v) && v >= 1 && v <= 12;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateString(v: string): boolean {
  if (!DATE_PATTERN.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}
