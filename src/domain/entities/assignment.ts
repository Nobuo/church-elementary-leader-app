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

  static reconstruct(props: AssignmentProps): Assignment {
    return new Assignment(props);
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
