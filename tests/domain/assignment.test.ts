import { describe, it, expect } from 'vitest';
import { Assignment } from '@domain/entities/assignment';
import { createScheduleId, asMemberId } from '@shared/types';

describe('Assignment', () => {
  describe('replaceMember', () => {
    it('replaces a member in the assignment', () => {
      const scheduleId = createScheduleId();
      const m1 = asMemberId('member-1');
      const m2 = asMemberId('member-2');
      const m3 = asMemberId('member-3');

      const assignment = Assignment.create(scheduleId, 1, [m1, m2]);
      const replaced = assignment.replaceMember(m1, m3);

      expect(replaced.memberIds).toEqual([m3, m2]);
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
    it('returns true for assigned members', () => {
      const scheduleId = createScheduleId();
      const m1 = asMemberId('member-1');
      const m2 = asMemberId('member-2');
      const assignment = Assignment.create(scheduleId, 1, [m1, m2]);

      expect(assignment.containsMember(m1)).toBe(true);
      expect(assignment.containsMember(m2)).toBe(true);
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
