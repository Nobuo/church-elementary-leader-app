import { Result, ok, err } from '@shared/result';
import { asMemberId } from '@shared/types';
import { Member, CreateMemberInput } from '@domain/entities/member';
import { MemberRepository } from '@domain/repositories/member-repository';
import { MemberType } from '@domain/value-objects/member-type';
import { MemberDto, toMemberDto } from '@application/dto/member-dto';
import { isValidGender, isValidLanguage, isValidGradeGroup, isValidMemberType } from '@shared/validators';

export interface RegisterMemberInput {
  name: string;
  gender: string;
  language: string;
  gradeGroup: string;
  memberType: string;
  sameGenderOnly: boolean;
  spouseId?: string | null;
  availableDates?: string[] | null;
}

export function registerMember(
  input: RegisterMemberInput,
  memberRepo: MemberRepository,
): Result<MemberDto> {
  if (!isValidGender(input.gender)) return err(`Invalid gender: ${input.gender}`);
  if (!isValidLanguage(input.language)) return err(`Invalid language: ${input.language}`);
  if (!isValidGradeGroup(input.gradeGroup)) return err(`Invalid gradeGroup: ${input.gradeGroup}`);
  if (!isValidMemberType(input.memberType)) return err(`Invalid memberType: ${input.memberType}`);

  const spouseId = input.spouseId ? asMemberId(input.spouseId) : null;

  // Validate spouse exists
  if (spouseId) {
    const spouse = memberRepo.findById(spouseId);
    if (!spouse) {
      return err('Spouse not found');
    }
    if (spouse.spouseId) {
      return err('Spouse is already linked to another member');
    }
  }

  const createInput: CreateMemberInput = {
    name: input.name,
    gender: input.gender as CreateMemberInput['gender'],
    language: input.language as CreateMemberInput['language'],
    gradeGroup: input.gradeGroup as CreateMemberInput['gradeGroup'],
    memberType: input.memberType as CreateMemberInput['memberType'],
    sameGenderOnly: input.sameGenderOnly,
    spouseId,
    availableDates: input.availableDates ?? null,
  };

  const result = Member.create(createInput);
  if (!result.ok) return result;

  const member = result.value;
  memberRepo.save(member);

  // Link spouse bidirectionally
  if (spouseId && member.memberType === MemberType.PARENT_COUPLE) {
    const spouse = memberRepo.findById(spouseId)!;
    const updatedSpouse = spouse.update({
      memberType: MemberType.PARENT_COUPLE,
      spouseId: member.id,
    });
    if (updatedSpouse.ok) {
      memberRepo.save(updatedSpouse.value);
    }
  }

  return ok(toMemberDto(member));
}
