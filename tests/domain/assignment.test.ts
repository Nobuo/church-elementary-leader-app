import { describe, it, expect } from 'vitest';
import { Assignment } from '@domain/entities/assignment';
import { createScheduleId, asMemberId } from '@shared/types';

describe('Assignment', () => {
  describe('create', () => {
    it('creates an assignment with 2 members', () => {
      const scheduleId = createScheduleId();
      const m1 = asMemberId('member-1');
      const m2 = asMemberId('member-2');

      const assignment = Assignment.create(scheduleId, 1, [m1, m2]);
      expect(assignment.memberIds).toEqual([m1, m2]);
      expect(assignment.memberIds.length).toBe(2);
    });

    it('creates an assignment with 3 members', () => {
      const scheduleId = createScheduleId();
      const m1 = asMemberId('member-1');
      const m2 = asMemberId('member-2');
      const m3 = asMemberId('member-3');

      const assignment = Assignment.create(scheduleId, 1, [m1, m2, m3]);
      expect(assignment.memberIds).toEqual([m1, m2, m3]);
      expect(assignment.memberIds.length).toBe(3);
    });

    it('throws when given 1 member', () => {
      const scheduleId = createScheduleId();
      expect(() => Assignment.create(scheduleId, 1, [asMemberId('m1')])).toThrow(
        'Assignment requires 2 or 3 members',
      );
    });

    it('throws when given 4 members', () => {
      const scheduleId = createScheduleId();
      const ids = ['m1', 'm2', 'm3', 'm4'].map(asMemberId);
      expect(() => Assignment.create(scheduleId, 1, ids)).toThrow(
        'Assignment requires 2 or 3 members',
      );
    });
  });

  describe('replaceMember', () => {
    it('replaces a member in a 2-member assignment', () => {
      const scheduleId = createScheduleId();
      const m1 = asMemberId('member-1');
      const m2 = asMemberId('member-2');
      const m3 = asMemberId('member-3');

      const assignment = Assignment.create(scheduleId, 1, [m1, m2]);
      const replaced = assignment.replaceMember(m1, m3);

      expect(replaced.memberIds).toEqual([m3, m2]);
      expect(replaced.id).toBe(assignment.id);
    });

    it('replaces a member in a 3-member assignment', () => {
      const scheduleId = createScheduleId();
      const m1 = asMemberId('member-1');
      const m2 = asMemberId('member-2');
      const m3 = asMemberId('member-3');
      const m4 = asMemberId('member-4');

      const assignment = Assignment.create(scheduleId, 1, [m1, m2, m3]);
      const replaced = assignment.replaceMember(m2, m4);

      expect(replaced.memberIds).toEqual([m1, m4, m3]);
      expect(replaced.id).toBe(assignment.id);
    });

    it('throws when oldMemberId is not in the assignment', () => {
      const scheduleId = createScheduleId();
      const m1 = asMemberId('member-1');
      const m2 = asMemberId('member-2');
      const m3 = asMemberId('member-3');

      const assignment = Assignment.create(scheduleId, 1, [m1, m2]);
      expect(() => assignment.replaceMember(m3, asMemberId('member-4'))).toThrow(
        'Member member-3 is not in this assignment',
      );
    });
  });

  describe('containsMember', () => {
    it('returns true for assigned members in 2-member assignment', () => {
      const scheduleId = createScheduleId();
      const m1 = asMemberId('member-1');
      const m2 = asMemberId('member-2');
      const assignment = Assignment.create(scheduleId, 1, [m1, m2]);

      expect(assignment.containsMember(m1)).toBe(true);
      expect(assignment.containsMember(m2)).toBe(true);
    });

    it('returns true for all members in 3-member assignment', () => {
      const scheduleId = createScheduleId();
      const m1 = asMemberId('member-1');
      const m2 = asMemberId('member-2');
      const m3 = asMemberId('member-3');
      const assignment = Assignment.create(scheduleId, 1, [m1, m2, m3]);

      expect(assignment.containsMember(m1)).toBe(true);
      expect(assignment.containsMember(m2)).toBe(true);
      expect(assignment.containsMember(m3)).toBe(true);
    });

    it('returns false for non-assigned members', () => {
      const scheduleId = createScheduleId();
      const m1 = asMemberId('member-1');
      const m2 = asMemberId('member-2');
      const assignment = Assignment.create(scheduleId, 1, [m1, m2]);

      expect(assignment.containsMember(asMemberId('member-3'))).toBe(false);
    });
  });
});
