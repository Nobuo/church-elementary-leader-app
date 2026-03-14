import { MemberRepository } from '@domain/repositories/member-repository';
import { MemberDto, toMemberDto } from '@application/dto/member-dto';

export function listMembers(
  memberRepo: MemberRepository,
  activeOnly = true,
): MemberDto[] {
  return memberRepo.findAll(activeOnly).map(toMemberDto);
}
