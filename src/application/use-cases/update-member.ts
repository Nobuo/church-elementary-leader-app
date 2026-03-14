import { Result, ok, err } from '@shared/result';
import { asMemberId } from '@shared/types';
import { MemberRepository } from '@domain/repositories/member-repository';
import { MemberDto, toMemberDto } from '@application/dto/member-dto';

export interface UpdateMemberInput {
  id: string;
  name?: string;
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

  const changes: Record<string, unknown> = {};
  if (input.name !== undefined) changes.name = input.name;
  if (input.gender !== undefined) changes.gender = input.gender;
  if (input.language !== undefined) changes.language = input.language;
  if (input.gradeGroup !== undefined) changes.gradeGroup = input.gradeGroup;
  if (input.memberType !== undefined) changes.memberType = input.memberType;
  if (input.sameGenderOnly !== undefined) changes.sameGenderOnly = input.sameGenderOnly;
  if (input.spouseId !== undefined) changes.spouseId = input.spouseId ? asMemberId(input.spouseId) : null;
  if (input.availableDates !== undefined) changes.availableDates = input.availableDates;

  const result = member.update(changes);
  if (!result.ok) return result;

  memberRepo.save(result.value);
  return ok(toMemberDto(result.value));
}
