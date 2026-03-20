import { describe, it, expect } from 'vitest';
import { importMembersCsv } from '@application/use-cases/import-members-csv';
import { Member } from '@domain/entities/member';
import { Gender } from '@domain/value-objects/gender';
import { Language } from '@domain/value-objects/language';
import { GradeGroup } from '@domain/value-objects/grade-group';
import { MemberType } from '@domain/value-objects/member-type';
import { MemberId } from '@shared/types';
import { MemberRepository } from '@domain/repositories/member-repository';

function createInMemoryMemberRepo(): MemberRepository & { members: Member[] } {
  const members: Member[] = [];

  return {
    members,
    save(member: Member) {
      const idx = members.findIndex((m) => m.id === member.id);
      if (idx >= 0) {
        members[idx] = member;
      } else {
        members.push(member);
      }
    },
    findById(id: MemberId) {
      return members.find((m) => m.id === id) ?? null;
    },
    findAll() {
      return [...members];
    },
    findBySpouseId(spouseId: MemberId) {
      return members.find((m) => m.spouseId === spouseId) ?? null;
    },
  };
}

describe('importMembersCsv', () => {
  it('creates new members from CSV', () => {
    const repo = createInMemoryMemberRepo();
    const csv = `Name,Gender,Language,Grade Group,Member Type,Same-gender Only,Spouse,Available Dates,Active
田中太郎,MALE,JAPANESE,UPPER,PARENT_SINGLE,FALSE,,,TRUE
鈴木花子,FEMALE,ENGLISH,LOWER,HELPER,FALSE,,,TRUE`;

    const result = importMembersCsv(csv, repo);

    expect(result.created).toBe(2);
    expect(result.updated).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(repo.members).toHaveLength(2);
    expect(repo.members[0].name).toBe('田中太郎');
    expect(repo.members[0].gender).toBe(Gender.MALE);
  });

  it('updates existing members matched by name', () => {
    const repo = createInMemoryMemberRepo();

    // Pre-existing member
    const existing = Member.create({
      name: '田中太郎',
      gender: Gender.MALE,
      language: Language.JAPANESE,
      gradeGroup: GradeGroup.UPPER,
      memberType: MemberType.PARENT_SINGLE,
      sameGenderOnly: false,
      spouseId: null,
      availableDates: null,
    });
    if (existing.ok) repo.save(existing.value);

    const csv = `Name,Gender,Language,Grade Group,Member Type,Same-gender Only,Spouse,Available Dates,Active
田中太郎,MALE,BOTH,LOWER,PARENT_SINGLE,TRUE,,,TRUE`;

    const result = importMembersCsv(csv, repo);

    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);
    const updated = repo.members.find((m) => m.name === '田中太郎')!;
    expect(updated.language).toBe(Language.BOTH);
    expect(updated.gradeGroup).toBe(GradeGroup.LOWER);
    expect(updated.sameGenderOnly).toBe(true);
  });

  it('handles BOM prefix', () => {
    const repo = createInMemoryMemberRepo();
    const csv = `\uFEFFName,Gender,Language,Grade Group,Member Type,Same-gender Only,Spouse,Available Dates,Active
Test,MALE,JAPANESE,UPPER,HELPER,FALSE,,,TRUE`;

    const result = importMembersCsv(csv, repo);
    expect(result.created).toBe(1);
  });

  it('reports errors for invalid rows but continues processing', () => {
    const repo = createInMemoryMemberRepo();
    const csv = `Name,Gender,Language,Grade Group,Member Type,Same-gender Only,Spouse,Available Dates,Active
Good,MALE,JAPANESE,UPPER,HELPER,FALSE,,,TRUE
,INVALID,JAPANESE,UPPER,HELPER,FALSE,,,TRUE
Also Good,FEMALE,ENGLISH,LOWER,PARENT_SINGLE,FALSE,,,TRUE`;

    const result = importMembersCsv(csv, repo);

    expect(result.created).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(3);
  });

  it('links spouses after all rows are processed', () => {
    const repo = createInMemoryMemberRepo();
    const csv = `Name,Gender,Language,Grade Group,Member Type,Same-gender Only,Spouse,Available Dates,Active
夫,MALE,JAPANESE,UPPER,PARENT_COUPLE,FALSE,妻,,TRUE
妻,FEMALE,ENGLISH,LOWER,PARENT_COUPLE,FALSE,夫,,TRUE`;

    const result = importMembersCsv(csv, repo);

    expect(result.created).toBe(2);
    const husband = repo.members.find((m) => m.name === '夫')!;
    const wife = repo.members.find((m) => m.name === '妻')!;
    expect(husband.spouseId).toBe(wife.id);
    expect(wife.spouseId).toBe(husband.id);
  });

  it('parses available dates with semicolons', () => {
    const repo = createInMemoryMemberRepo();
    const csv = `Name,Gender,Language,Grade Group,Member Type,Same-gender Only,Spouse,Available Dates,Active
Test,MALE,JAPANESE,UPPER,HELPER,FALSE,,2026-04-05;2026-04-12,TRUE`;

    importMembersCsv(csv, repo);

    expect(repo.members[0].availableDates).toEqual(['2026-04-05', '2026-04-12']);
  });

  it('accepts gradeGroup=ANY in CSV import (T7)', () => {
    const repo = createInMemoryMemberRepo();
    const csv = `Name,Gender,Language,Grade Group,Member Type,Same-gender Only,Spouse,Available Dates,Active
AnyHelper,FEMALE,BOTH,ANY,HELPER,FALSE,,,TRUE`;

    const result = importMembersCsv(csv, repo);

    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(repo.members[0].gradeGroup).toBe(GradeGroup.ANY);
  });

  it('returns error for empty CSV', () => {
    const repo = createInMemoryMemberRepo();
    const result = importMembersCsv('', repo);
    expect(result.errors).toHaveLength(1);
  });
});
