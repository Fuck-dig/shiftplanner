import { describe, it, expect } from 'vitest';
import { periodUnit, stepMonth } from './period';

describe('periodUnit — what the arrows move', () => {
  it('steps months in month view', () => {
    expect(periodUnit('month', null)).toBe('month');
    // Even with a day isolated: month view has no isolated day, and honouring
    // a stale dayFilter here would make the arrows move a day on a month grid.
    expect(periodUnit('month', 'Mon')).toBe('month');
  });

  it('steps weeks in week view', () => {
    expect(periodUnit('week', null)).toBe('week');
  });

  it('steps DAYS when a single day is isolated', () => {
    // The case worth having a name for: when one day fills the screen, the
    // arrows should move that day, not jump you a whole week away from it.
    expect(periodUnit('week', 'Fri')).toBe('day');
  });

  it('steps weeks on the team grid, isolated day or not', () => {
    expect(periodUnit('grid', null)).toBe('week');
    expect(periodUnit('grid', 'Fri')).toBe('week');
  });
});

describe('stepMonth', () => {
  it('moves within a year', () => {
    expect(stepMonth({ y: 2026, m: 5 }, 1)).toEqual({ y: 2026, m: 6 });
    expect(stepMonth({ y: 2026, m: 5 }, -1)).toEqual({ y: 2026, m: 4 });
  });

  it('wraps at both ends of the year', () => {
    // The only part of this anyone gets wrong, and it is silent when wrong:
    // December + 1 becoming month 12 of the same year renders as January but
    // dated a year early.
    expect(stepMonth({ y: 2026, m: 11 }, 1)).toEqual({ y: 2027, m: 0 });
    expect(stepMonth({ y: 2026, m: 0 }, -1)).toEqual({ y: 2025, m: 11 });
  });
});
