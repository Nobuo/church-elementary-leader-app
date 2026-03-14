import { describe, it, expect } from 'vitest';
import { Schedule, getSundaysInMonth } from '@domain/entities/schedule';

describe('Schedule', () => {
  it('creates a valid schedule for a Sunday', () => {
    const result = Schedule.create('2026-04-05'); // Sunday
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.date).toBe('2026-04-05');
      expect(result.value.isExcluded).toBe(false);
      expect(result.value.year).toBe(2026); // fiscal year
    }
  });

  it('rejects non-Sunday dates', () => {
    const result = Schedule.create('2026-04-06'); // Monday
    expect(result.ok).toBe(false);
  });

  it('toggles exclusion', () => {
    const result = Schedule.create('2026-04-05');
    if (!result.ok) throw new Error('should succeed');
    const excluded = result.value.toggleExclusion();
    expect(excluded.isExcluded).toBe(true);
    const included = excluded.toggleExclusion();
    expect(included.isExcluded).toBe(false);
  });

  it('assigns January to previous fiscal year', () => {
    const result = Schedule.create('2027-01-03'); // Sunday in Jan 2027
    if (!result.ok) throw new Error('should succeed');
    expect(result.value.year).toBe(2026); // belongs to fiscal year 2026
  });

  it('reconstructs with isEvent true', () => {
    const original = Schedule.create('2026-04-05');
    if (!original.ok) throw new Error('should succeed');
    const reconstructed = Schedule.reconstruct({
      id: original.value.id,
      date: original.value.date,
      isExcluded: false,
      isEvent: true,
      year: original.value.year,
    });
    expect(reconstructed.isEvent).toBe(true);
    expect(reconstructed.isExcluded).toBe(false);
  });

  it('creates with isEvent defaulting to false', () => {
    const result = Schedule.create('2026-04-05');
    if (!result.ok) throw new Error('should succeed');
    expect(result.value.isEvent).toBe(false);
  });

  it('toggles event flag', () => {
    const result = Schedule.create('2026-04-05');
    if (!result.ok) throw new Error('should succeed');
    const withEvent = result.value.toggleEvent();
    expect(withEvent.isEvent).toBe(true);
    expect(withEvent.id).toBe(result.value.id);
    const withoutEvent = withEvent.toggleEvent();
    expect(withoutEvent.isEvent).toBe(false);
  });

  it('toggleEvent returns a new instance', () => {
    const result = Schedule.create('2026-04-05');
    if (!result.ok) throw new Error('should succeed');
    const toggled = result.value.toggleEvent();
    expect(toggled).not.toBe(result.value);
  });
});

describe('getSundaysInMonth', () => {
  it('returns all Sundays in April 2026', () => {
    const sundays = getSundaysInMonth(2026, 4);
    expect(sundays.length).toBeGreaterThan(0);
    for (const s of sundays) {
      const d = new Date(s);
      expect(d.getDay()).toBe(0);
      expect(d.getMonth()).toBe(3); // April = 3
    }
  });

  it('returns correct number of Sundays', () => {
    // April 2026 has Sundays on: 5, 12, 19, 26
    const sundays = getSundaysInMonth(2026, 4);
    expect(sundays).toEqual(['2026-04-05', '2026-04-12', '2026-04-19', '2026-04-26']);
  });
});
