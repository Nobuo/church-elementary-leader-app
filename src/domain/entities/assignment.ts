import { AssignmentId, ScheduleId, MemberId, createAssignmentId } from '@shared/types';

export interface AssignmentProps {
  readonly id: AssignmentId;
  readonly scheduleId: ScheduleId;
  readonly groupNumber: 1 | 2;
  readonly memberIds: readonly MemberId[];
}

export class Assignment {
  readonly id: AssignmentId;
  readonly scheduleId: ScheduleId;
  readonly groupNumber: 1 | 2;
  readonly memberIds: readonly MemberId[];

  private constructor(props: AssignmentProps) {
    this.id = props.id;
    this.scheduleId = props.scheduleId;
    this.groupNumber = props.groupNumber;
    this.memberIds = props.memberIds;
  }

  static create(
    scheduleId: ScheduleId,
    groupNumber: 1 | 2,
    memberIds: MemberId[],
  ): Assignment {
    if (memberIds.length < 2 || memberIds.length > 3) {
      throw new Error('Assignment requires 2 or 3 members');
    }
    return new Assignment({
      id: createAssignmentId(),
      scheduleId,
      groupNumber,
      memberIds,
    });
  }

  /**
   * 埋まりきっていないグループを作る。自動生成は必ず2〜3人を揃えるので create() を使うが、
   * 手作業で担当を足していく場合は1人から始まる(合同日として組んだ後に分級へ切り替えた日など)。
   */
  static createPartial(
    scheduleId: ScheduleId,
    groupNumber: 1 | 2,
    memberIds: MemberId[],
  ): Assignment {
    if (memberIds.length < 1 || memberIds.length > 3) {
      throw new Error('Assignment requires 1 to 3 members');
    }
    return new Assignment({
      id: createAssignmentId(),
      scheduleId,
      groupNumber,
      memberIds,
    });
  }

  static reconstruct(props: AssignmentProps): Assignment {
    return new Assignment(props);
  }

  removeMember(memberId: MemberId): Assignment | null {
    if (!this.memberIds.includes(memberId)) {
      throw new Error(`Member ${memberId} is not in this assignment`);
    }
    const newMemberIds = this.memberIds.filter((id) => id !== memberId);
    if (newMemberIds.length === 0) return null;
    return new Assignment({
      id: this.id,
      scheduleId: this.scheduleId,
      groupNumber: this.groupNumber,
      memberIds: newMemberIds,
    });
  }

  addMember(memberId: MemberId, maxMembers: number): Assignment {
    if (this.memberIds.length >= maxMembers) {
      throw new Error('Assignment is full');
    }
    if (this.memberIds.includes(memberId)) {
      throw new Error(`Member ${memberId} is already in this assignment`);
    }
    return new Assignment({
      id: this.id,
      scheduleId: this.scheduleId,
      groupNumber: this.groupNumber,
      memberIds: [...this.memberIds, memberId],
    });
  }

  replaceMember(oldMemberId: MemberId, newMemberId: MemberId): Assignment {
    if (!this.memberIds.includes(oldMemberId)) {
      throw new Error(`Member ${oldMemberId} is not in this assignment`);
    }
    const newMemberIds = this.memberIds.map((id) =>
      id === oldMemberId ? newMemberId : id,
    );

    return new Assignment({
      id: this.id,
      scheduleId: this.scheduleId,
      groupNumber: this.groupNumber,
      memberIds: newMemberIds,
    });
  }

  containsMember(memberId: MemberId): boolean {
    return this.memberIds.includes(memberId);
  }
}
