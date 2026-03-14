import { v4 as uuidv4 } from 'uuid';

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type MemberId = Brand<string, 'MemberId'>;
export type ScheduleId = Brand<string, 'ScheduleId'>;
export type AssignmentId = Brand<string, 'AssignmentId'>;

export function createMemberId(): MemberId {
  return uuidv4() as MemberId;
}

export function createScheduleId(): ScheduleId {
  return uuidv4() as ScheduleId;
}

export function createAssignmentId(): AssignmentId {
  return uuidv4() as AssignmentId;
}

export function asMemberId(id: string): MemberId {
  return id as MemberId;
}

export function asScheduleId(id: string): ScheduleId {
  return id as ScheduleId;
}

export function asAssignmentId(id: string): AssignmentId {
  return id as AssignmentId;
}
