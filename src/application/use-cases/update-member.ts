import { Result, ok, err } from '@shared/result';
import { MemberId, asMemberId } from '@shared/types';
import { MemberRepository } from '@domain/repositories/member-repository';
import { MemberType } from '@domain/value-objects/member-type';
import { MemberDto, toMemberDto } from '@application/dto/member-dto';
import { isValidGender, isValidLanguage, isValidGradeGroup, isValidMemberType } from '@shared/validators';

export interface UpdateMemberInput {
  id: string;
  name?: string;
  notes?: string;
  gender?: string;
  language?: string;
  gradeGroup?: string;
  memberType?: string;
  sameGenderOnly?: boolean;
  spouseId?: string | null;
  availableDates?: string[] | null;
}

export function updateMember(
  input: UpdateMemberInput,
  memberRepo: MemberRepository,
): Result<MemberDto> {
  const member = memberRepo.findById(asMemberId(input.id));
  if (!member) return err('Member not found');

  if (input.gender !== undefined && !isValidGender(input.gender)) return err(`Invalid gender: ${input.gender}`);
  if (input.language !== undefined && !isValidLanguage(input.language)) return err(`Invalid language: ${input.language}`);
  if (input.gradeGroup !== undefined && !isValidGradeGroup(input.gradeGroup)) return err(`Invalid gradeGroup: ${input.gradeGroup}`);
  if (input.memberType !== undefined && !isValidMemberType(input.memberType)) return err(`Invalid memberType: ${input.memberType}`);

  const changes: Record<string, unknown> = {};
  if (input.name !== undefined) changes.name = input.name;
  if (input.notes !== undefined) changes.notes = input.notes.trim();
  if (input.gender !== undefined) changes.gender = input.gender;
  if (input.language !== undefined) changes.language = input.language;
  if (input.gradeGroup !== undefined) changes.gradeGroup = input.gradeGroup;
  if (input.memberType !== undefined) changes.memberType = input.memberType;
  if (input.sameGenderOnly !== undefined) changes.sameGenderOnly = input.sameGenderOnly;
  if (input.availableDates !== undefined) changes.availableDates = input.availableDates;

  // 配偶者変更の処理
  const oldSpouseId = member.spouseId;
  let newSpouseId: MemberId | null | undefined = undefined;

  if (input.memberType !== undefined && input.memberType !== MemberType.PARENT_COUPLE) {
    newSpouseId = null;
    changes.spouseId = null;
  } else if (input.spouseId !== undefined) {
    newSpouseId = input.spouseId ? asMemberId(input.spouseId) : null;
    changes.spouseId = newSpouseId;
  }

  // 新しい配偶者が存在し、すでに別のメンバーとリンクされていないことを確認する
  if (newSpouseId && newSpouseId !== oldSpouseId) {
    const newSpouse = memberRepo.findById(newSpouseId);
    if (!newSpouse) {
      return err('Spouse not found');
    }
    if (newSpouse.spouseId && newSpouse.spouseId !== member.id) {
      return err('Spouse is already linked to another member');
    }
  }

  const result = member.update(changes);
  if (!result.ok) return result;

  const updatedMember = result.value;
  memberRepo.save(updatedMember);

  // 双方向リンクの更新
  if (newSpouseId !== undefined && newSpouseId !== oldSpouseId) {
    // 1. 旧配偶者とのリンク解除
    if (oldSpouseId) {
      const oldSpouse = memberRepo.findById(oldSpouseId);
      if (oldSpouse && oldSpouse.spouseId === member.id) {
        const cleared = oldSpouse.update({ spouseId: null });
        if (cleared.ok) {
          memberRepo.save(cleared.value);
        }
      }
    }

    // 2. 新配偶者との双方向リンク作成
    if (newSpouseId) {
      const newSpouse = memberRepo.findById(newSpouseId)!;
      const linked = newSpouse.update({
        memberType: MemberType.PARENT_COUPLE,
        spouseId: updatedMember.id,
      });
      if (linked.ok) {
        memberRepo.save(linked.value);
      }
    }
  }

  return ok(toMemberDto(updatedMember));
}
