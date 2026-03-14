import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { SqliteMemberRepository } from '@infrastructure/persistence/sqlite-member-repository';
import { runMigrations } from '@infrastructure/persistence/migrations/index';
import { Member } from '@domain/entities/member';
import { Gender } from '@domain/value-objects/gender';
import { Language } from '@domain/value-objects/language';
import { GradeGroup } from '@domain/value-objects/grade-group';
import { MemberType } from '@domain/value-objects/member-type';

describe('SqliteMemberRepository', () => {
  let db: Database.Database;
  let repo: SqliteMemberRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    repo = new SqliteMemberRepository(db);
  });

  function createTestMember(name = 'Test User') {
    const result = Member.create({
      name,
      gender: Gender.MALE,
      language: Language.JAPANESE,
      gradeGroup: GradeGroup.UPPER,
      memberType: MemberType.PARENT_SINGLE,
      sameGenderOnly: false,
      spouseId: null,
      availableDates: null,
    });
    if (!result.ok) throw new Error('Failed to create member');
    return result.value;
  }

  it('saves and retrieves a member', () => {
    const member = createTestMember();
    repo.save(member);
    const found = repo.findById(member.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe('Test User');
    expect(found!.gender).toBe(Gender.MALE);
  });

  it('finds all active members', () => {
    const m1 = createTestMember('Active');
    const m2 = createTestMember('Inactive');
    repo.save(m1);
    repo.save(m2.deactivate());

    const active = repo.findAll(true);
    expect(active.length).toBe(1);
    expect(active[0].name).toBe('Active');

    const all = repo.findAll(false);
    expect(all.length).toBe(2);
  });

  it('saves member with available dates', () => {
    const result = Member.create({
      name: 'Dates User',
      gender: Gender.FEMALE,
      language: Language.BOTH,
      gradeGroup: GradeGroup.LOWER,
      memberType: MemberType.PARENT_SINGLE,
      sameGenderOnly: true,
      spouseId: null,
      availableDates: ['2026-04-05', '2026-04-12'],
    });
    if (!result.ok) throw new Error('Failed');
    repo.save(result.value);
    const found = repo.findById(result.value.id);
    expect(found!.availableDates).toEqual(['2026-04-05', '2026-04-12']);
    expect(found!.sameGenderOnly).toBe(true);
  });
});
