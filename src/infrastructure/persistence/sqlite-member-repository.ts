import Database from 'better-sqlite3';
import { MemberId, asMemberId } from '@shared/types';
import { Member } from '@domain/entities/member';
import { MemberRepository } from '@domain/repositories/member-repository';
import { Gender } from '@domain/value-objects/gender';
import { Language } from '@domain/value-objects/language';
import { GradeGroup } from '@domain/value-objects/grade-group';
import { MemberType } from '@domain/value-objects/member-type';

interface MemberRow {
  id: string;
  name: string;
  gender: string;
  language: string;
  grade_group: string;
  member_type: string;
  same_gender_only: number;
  spouse_id: string | null;
  available_dates: string | null;
  is_active: number;
}

function rowToMember(row: MemberRow): Member {
  return Member.reconstruct({
    id: asMemberId(row.id),
    name: row.name,
    gender: row.gender as Gender,
    language: row.language as Language,
    gradeGroup: row.grade_group as GradeGroup,
    memberType: row.member_type as MemberType,
    sameGenderOnly: row.same_gender_only === 1,
    spouseId: row.spouse_id ? asMemberId(row.spouse_id) : null,
    availableDates: row.available_dates ? JSON.parse(row.available_dates) : null,
    isActive: row.is_active === 1,
  });
}

export class SqliteMemberRepository implements MemberRepository {
  constructor(private db: Database.Database) {}

  save(member: Member): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO members (id, name, gender, language, grade_group, member_type, same_gender_only, spouse_id, available_dates, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        member.id,
        member.name,
        member.gender,
        member.language,
        member.gradeGroup,
        member.memberType,
        member.sameGenderOnly ? 1 : 0,
        member.spouseId,
        member.availableDates ? JSON.stringify(member.availableDates) : null,
        member.isActive ? 1 : 0,
      );
  }

  findById(id: MemberId): Member | null {
    const row = this.db.prepare('SELECT * FROM members WHERE id = ?').get(id) as
      | MemberRow
      | undefined;
    return row ? rowToMember(row) : null;
  }

  findAll(activeOnly = true): Member[] {
    const sql = activeOnly ? 'SELECT * FROM members WHERE is_active = 1' : 'SELECT * FROM members';
    const rows = this.db.prepare(sql).all() as MemberRow[];
    return rows.map(rowToMember);
  }

  findBySpouseId(spouseId: MemberId): Member | null {
    const row = this.db.prepare('SELECT * FROM members WHERE spouse_id = ?').get(spouseId) as
      | MemberRow
      | undefined;
    return row ? rowToMember(row) : null;
  }
}
