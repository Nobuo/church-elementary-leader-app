import { MemberId } from '@shared/types';
import { Member } from '@domain/entities/member';

export interface MemberRepository {
  save(member: Member): void;
  findById(id: MemberId): Member | null;
  findAll(activeOnly?: boolean): Member[];
  findBySpouseId(spouseId: MemberId): Member | null;
}
