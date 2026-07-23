import { describe, it, expect } from 'vitest';
import {
  blockHours,
  assignmentHours,
  actualAssignmentHours,
  effectiveHourlyRate,
  calcWageCost,
  coversBlock,
  dayCoverage,
  WEEKS_PER_MONTH,
} from './schedule';

// These are the functions that ultimately decide how many hours an employee
// is credited with and how much that costs — bugs here show up as a wrong
// paycheck, not a crash, which is exactly the kind of thing that goes
// unnoticed without tests. See app tasks list: "Unit tests for wage/hour
// calculations".

describe('blockHours', () => {
  it('computes a same-day block', () => {
    expect(blockHours({ start: '09:00', end: '17:00' })).toBe(8);
  });

  it('handles a block that crosses midnight', () => {
    expect(blockHours({ start: '22:00', end: '06:00' })).toBe(8);
  });

  it('handles a zero-length block as a full 24h wrap (end===start)', () => {
    // Matches the function's own convention: end<=start always means
    // "wraps to the next day", so an identical start/end is a full day
    // rather than zero hours.
    expect(blockHours({ start: '09:00', end: '09:00' })).toBe(24);
  });
});

describe('assignmentHours', () => {
  const block = { start: '09:00', end: '17:00' };

  it('falls back to the block\'s own start/end when the assignment has none', () => {
    expect(assignmentHours({}, block)).toBe(8);
  });

  it('uses the assignment\'s custom start/end when set', () => {
    expect(assignmentHours({ start: '10:00', end: '14:00' }, block)).toBe(4);
  });

  it('allows a partial override (custom start, block\'s end)', () => {
    expect(assignmentHours({ start: '12:00' }, block)).toBe(5);
  });
});

describe('actualAssignmentHours', () => {
  const block = { start: '09:00', end: '17:00' };

  it('falls back to the scheduled hours when nothing actual is recorded (e.g. a future shift)', () => {
    expect(actualAssignmentHours({}, block)).toBe(8);
    expect(actualAssignmentHours({ start: '10:00', end: '14:00' }, block)).toBe(4);
  });

  it('uses actualStart/actualEnd over the scheduled start/end when set', () => {
    expect(actualAssignmentHours({ start: '10:00', end: '18:00', actualStart: '10:00', actualEnd: '15:30' }, block)).toBe(5.5);
  });

  it('allows a partial actual override (actual start only, scheduled end)', () => {
    expect(actualAssignmentHours({ actualStart: '11:00' }, block)).toBe(6);
  });

  it('is 0 for a no-show regardless of any recorded times', () => {
    expect(actualAssignmentHours({ noShow: true }, block)).toBe(0);
    expect(actualAssignmentHours({ noShow: true, actualStart: '09:00', actualEnd: '17:00' }, block)).toBe(0);
  });
});

describe('effectiveHourlyRate', () => {
  it('returns null when no wage is set', () => {
    expect(effectiveHourlyRate({})).toBeNull();
    expect(effectiveHourlyRate({ wage: 0 })).toBeNull();
  });

  it('returns the wage as-is for hourly contracts', () => {
    expect(effectiveHourlyRate({ wage: 200, contractType: 'hourly' })).toBe(200);
  });

  it('defaults to hourly when contractType is unset', () => {
    expect(effectiveHourlyRate({ wage: 150 })).toBe(150);
  });

  it('converts a weekly salary to an hourly rate using maxHours', () => {
    const rate = effectiveHourlyRate({ wage: 4000, contractType: 'salary', contractPeriod: 'week', maxHours: 40 });
    expect(rate).toBeCloseTo(4000 / 40, 6);
  });

  it('converts a monthly salary to an hourly rate using maxHours and WEEKS_PER_MONTH', () => {
    const rate = effectiveHourlyRate({ wage: 30000, contractType: 'salary', contractPeriod: 'month', maxHours: 37 });
    expect(rate).toBeCloseTo(30000 / (37 * WEEKS_PER_MONTH), 6);
  });

  it('falls back to a 40h week when maxHours is unset on a salaried contract', () => {
    const rate = effectiveHourlyRate({ wage: 4000, contractType: 'salary', contractPeriod: 'week' });
    expect(rate).toBeCloseTo(4000 / 40, 6);
  });
});

describe('calcWageCost', () => {
  it('multiplies hours by the effective hourly rate when a wage is set', () => {
    expect(calcWageCost({ wage: 150, contractType: 'hourly' }, 8)).toBe(1200);
  });

  it('rounds to 2 decimal places', () => {
    expect(calcWageCost({ wage: 33.333, contractType: 'hourly' }, 3)).toBe(100);
  });

  it('falls back to a priority-based heuristic (out of 100) when no wage is set', () => {
    expect(calcWageCost({ priority: 100 }, 8)).toBe(8);
    expect(calcWageCost({ priority: 50 }, 8)).toBe(4);
  });

  it('defaults priority to 100 when unset', () => {
    expect(calcWageCost({}, 6)).toBe(6);
  });
});

describe('coversBlock', () => {
  const block = { start: '09:00', end: '17:00' };

  it('returns false when the employee has no availability that day', () => {
    expect(coversBlock(null, block)).toBe(false);
    expect(coversBlock(undefined, block)).toBe(false);
  });

  it('returns true when availability fully spans the block', () => {
    expect(coversBlock({ from: '08:00', to: '18:00' }, block)).toBe(true);
  });

  it('returns true when availability matches the block exactly', () => {
    expect(coversBlock({ from: '09:00', to: '17:00' }, block)).toBe(true);
  });

  it('returns false when availability only partially overlaps the block', () => {
    expect(coversBlock({ from: '09:00', to: '13:00' }, block)).toBe(false);
    expect(coversBlock({ from: '12:00', to: '17:00' }, block)).toBe(false);
  });

  it('handles an overnight block correctly', () => {
    const overnight = { start: '22:00', end: '06:00' };
    expect(coversBlock({ from: '21:00', to: '07:00' }, overnight)).toBe(true);
    expect(coversBlock({ from: '22:00', to: '02:00' }, overnight)).toBe(false);
  });
});

describe('dayCoverage', () => {
  const blocks = [{ id: 'b1', name: 'Morning', start: '09:00', end: '13:00', roles: { Waiter: 2 } }];
  const allRoles = ['Waiter'];

  it('returns "empty" when there is no schedule for the day', () => {
    expect(dayCoverage(null, blocks, 'Mon', allRoles)).toBe('empty');
    expect(dayCoverage({}, blocks, 'Mon', allRoles)).toBe('empty');
  });

  it('returns "full" when every required slot is filled', () => {
    const schedule = { Mon: { b1: [{ role: 'Waiter' }, { role: 'Waiter' }] } };
    expect(dayCoverage(schedule, blocks, 'Mon', allRoles)).toBe('full');
  });

  it('returns "partial" when most but not all slots are filled (>=60%)', () => {
    const fiveSlotBlocks = [{ id: 'b1', name: 'Morning', start: '09:00', end: '13:00', roles: { Waiter: 5 } }];
    const schedule = { Mon: { b1: [{ role: 'Waiter' }, { role: 'Waiter' }, { role: 'Waiter' }] } }; // 3/5 = 60%
    expect(dayCoverage(schedule, fiveSlotBlocks, 'Mon', allRoles)).toBe('partial');
  });

  it('returns "low" when few of the required slots are filled', () => {
    const twoSlotBlocks = [{ id: 'b1', name: 'Morning', start: '09:00', end: '13:00', roles: { Waiter: 5 } }];
    const schedule = { Mon: { b1: [{ role: 'Waiter' }] } };
    expect(dayCoverage(schedule, twoSlotBlocks, 'Mon', allRoles)).toBe('low');
  });
});
