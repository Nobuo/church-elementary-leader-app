import { Member } from '@domain/entities/member';

export interface MemberDto {
  id: string;
  name: string;
  gender: string;
  language: string;
  gradeGroup: string;
  memberType: string;
  sameGenderOnly: boolean;
  spouseId: string | null;
  availableDates: string[] | null;
  isActive: boolean;
}

export function toMemberDto(member: Member): MemberDto {
  return {
    id: member.id,
    name: member.name,
    gender: member.gender,
    language: member.language,
    gradeGroup: member.gradeGroup,
    memberType: member.memberType,
    sameGenderOnly: member.sameGenderOnly,
    spouseId: member.spouseId,
    availableDates: member.availableDates ? [...member.availableDates] : null,
    isActive: member.isActive,
  };
}
