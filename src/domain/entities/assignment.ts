import { AssignmentId, ScheduleId, MemberId, createAssignmentId } from '@shared/types';

export interface AssignmentProps {
  readonly id: AssignmentId;
  readonly scheduleId: ScheduleId;
  readonly groupNumber: 1 | 2;
  readonly memberIds: readonly [MemberId, MemberId];
}

export class Assignment {
  readonly id: AssignmentId;
  readonly scheduleId: ScheduleId;
  readonly groupNumber: 1 | 2;
  readonly memberIds: readonly [MemberId, MemberId];

  private constructor(props: AssignmentProps) {
    this.id = props.id;
    this.scheduleId = props.scheduleId;
    this.groupNumber = props.groupNumber;
    this.memberIds = props.memberIds;
  }

  static create(
    scheduleId: ScheduleId,
    groupNumber: 1 | 2,
    memberIds: [MemberId, MemberId],
  ): Assignment {
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
    const newMemberIds = this.memberIds.map((id) =>
      id === oldMemberId ? newMemberId : id,
    ) as [MemberId, MemberId];

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
