import { Result, ok, err } from '@shared/result';
import { asMemberId } from '@shared/types';
import { MemberRepository } from '@domain/repositories/member-repository';
import { MemberDto, toMemberDto } from '@application/dto/member-dto';

export function deactivateMember(
  memberId: string,
  memberRepo: MemberRepository,
): Result<MemberDto> {
  const member = memberRepo.findById(asMemberId(memberId));
  if (!member) return err('Member not found');

  const deactivated = member.deactivate();
  memberRepo.save(deactivated);
  return ok(toMemberDto(deactivated));
}

export function reactivateMember(
  memberId: string,
  memberRepo: MemberRepository,
): Result<MemberDto> {
  const member = memberRepo.findById(asMemberId(memberId));
  if (!member) return err('Member not found');

  const reactivated = member.reactivate();
  memberRepo.save(reactivated);
  return ok(toMemberDto(reactivated));
}
