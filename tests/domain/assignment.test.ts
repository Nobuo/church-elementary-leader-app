import { describe, it, expect } from 'vitest';
import { Assignment } from '@domain/entities/assignment';
import { createScheduleId, asMemberId } from '@shared/types';

describe('Assignment', () => {
  describe('createPartial', () => {
    it('creates an assignment with a single member', () => {
      const scheduleId = createScheduleId();
      const m1 = asMemberId('member-1');

      const assignment = Assignment.createPartial(scheduleId, 2, [m1]);

      expect(assignment.memberIds).toEqual([m1]);
      expect(assignment.groupNumber).toBe(2);
    });

    it('throws when given 0 members', () => {
      const scheduleId = createScheduleId();
      expect(() => Assignment.createPartial(scheduleId, 1, [])).toThrow(
        'Assignment requires 1 to 3 members',
      );
    });

    it('throws when given 4 members', () => {
      const scheduleId = createScheduleId();
      const ids = ['m1', 'm2', 'm3', 'm4'].map(asMemberId);
      expect(() => Assignment.createPartial(scheduleId, 1, ids)).toThrow(
        'Assignment requires 1 to 3 members',
      );
    });
  });

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

  describe('removeMember', () => {
    it('removes a member from a 2-member assignment, leaving 1', () => {
      const scheduleId = createScheduleId();
      const m1 = asMemberId('member-1');
      const m2 = asMemberId('member-2');

      const assignment = Assignment.create(scheduleId, 1, [m1, m2]);
      const result = assignment.removeMember(m1);

      expect(result).not.toBeNull();
      expect(result!.memberIds).toEqual([m2]);
      expect(result!.id).toBe(assignment.id);
    });

    it('removes a member from a 3-member assignment, leaving 2', () => {
      const scheduleId = createScheduleId();
      const m1 = asMemberId('member-1');
      const m2 = asMemberId('member-2');
      const m3 = asMemberId('member-3');

      const assignment = Assignment.create(scheduleId, 1, [m1, m2, m3]);
      const result = assignment.removeMember(m2);

      expect(result).not.toBeNull();
      expect(result!.memberIds).toEqual([m1, m3]);
    });

    it('returns null when removing the last member', () => {
      const scheduleId = createScheduleId();
      const m1 = asMemberId('member-1');
      const m2 = asMemberId('member-2');

      const assignment = Assignment.create(scheduleId, 1, [m1, m2]);
      const oneLeft = assignment.removeMember(m1)!;
      const result = oneLeft.removeMember(m2);

      expect(result).toBeNull();
    });

    it('throws when member is not in the assignment', () => {
      const scheduleId = createScheduleId();
      const m1 = asMemberId('member-1');
      const m2 = asMemberId('member-2');

      const assignment = Assignment.create(scheduleId, 1, [m1, m2]);
      expect(() => assignment.removeMember(asMemberId('member-3'))).toThrow(
        'Member member-3 is not in this assignment',
      );
    });
  });

  describe('addMember', () => {
    it('adds a member to a 1-member assignment', () => {
      const scheduleId = createScheduleId();
      const m1 = asMemberId('member-1');
      const m2 = asMemberId('member-2');

      const assignment = Assignment.create(scheduleId, 1, [m1, m2]);
      const oneLeft = assignment.removeMember(m1)!;
      const result = oneLeft.addMember(asMemberId('member-3'), 2);

      expect(result.memberIds).toEqual([m2, asMemberId('member-3')]);
      expect(result.id).toBe(assignment.id);
    });

    it('adds a member to a 2-member assignment (max 3)', () => {
      const scheduleId = createScheduleId();
      const m1 = asMemberId('member-1');
      const m2 = asMemberId('member-2');
      const m3 = asMemberId('member-3');

      const assignment = Assignment.create(scheduleId, 1, [m1, m2]);
      const result = assignment.addMember(m3, 3);

      expect(result.memberIds).toEqual([m1, m2, m3]);
    });

    it('throws when assignment is full', () => {
      const scheduleId = createScheduleId();
      const m1 = asMemberId('member-1');
      const m2 = asMemberId('member-2');

      const assignment = Assignment.create(scheduleId, 1, [m1, m2]);
      expect(() => assignment.addMember(asMemberId('member-3'), 2)).toThrow(
        'Assignment is full',
      );
    });

    it('throws when adding a duplicate member', () => {
      const scheduleId = createScheduleId();
      const m1 = asMemberId('member-1');
      const m2 = asMemberId('member-2');

      const assignment = Assignment.create(scheduleId, 1, [m1, m2]);
      const oneLeft = assignment.removeMember(m1)!;
      expect(() => oneLeft.addMember(m2, 2)).toThrow(
        'Member member-2 is already in this assignment',
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
