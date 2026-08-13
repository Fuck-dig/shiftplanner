import { describe, it, expect } from 'vitest';
import {
  actualAssignmentHours, sickHoursFor, coversSlot, effectiveSickPct, calcSickCost, swapTimes,
  blockForTime,
} from './schedule';

const BLOCK = { start: '10:00', end: '18:00' };   // 8h
const hourly = (wage) => ({ wage, contractType: 'hourly', contractPeriod: 'week', maxHours: 40 });

describe('sick shifts and hours worked', () => {
  it('a sick shift contributes ZERO hours worked', () => {
    // The whole reason hours and cost are kept apart. If sick hours leaked into
    // this number, someone off sick all week would read as fully booked and
    // could trip the over-max warning without having worked at all.
    expect(actualAssignmentHours({ sick: true }, BLOCK)).toBe(0);
  });

  it('still zero even when the shift has clocked times recorded', () => {
    // Someone can be clocked in and then sent home sick. Marking it sick has to
    // win, or the recorded times would quietly resurrect the hours.
    expect(actualAssignmentHours({ sick: true, actualStart: '10:00', actualEnd: '14:00' }, BLOCK)).toBe(0);
  });

  it('does not disturb a normal shift', () => {
    expect(actualAssignmentHours({}, BLOCK)).toBe(8);
    expect(actualAssignmentHours({ actualStart: '10:00', actualEnd: '14:00' }, BLOCK)).toBe(4);
  });
});

describe('sickHoursFor', () => {
  it('is the SCHEDULED length of the shift', () => {
    expect(sickHoursFor({ sick: true }, BLOCK)).toBe(8);
  });

  it('respects a shift with its own custom times, not the block default', () => {
    expect(sickHoursFor({ sick: true, start: '10:00', end: '14:00' }, BLOCK)).toBe(4);
  });

  it('ignores clocked times — a sick shift is paid on what was rostered', () => {
    expect(sickHoursFor({ sick: true, actualStart: '10:00', actualEnd: '11:00' }, BLOCK)).toBe(8);
  });

  it('is zero for anything not marked sick', () => {
    expect(sickHoursFor({}, BLOCK)).toBe(0);
    expect(sickHoursFor({ noShow: true }, BLOCK)).toBe(0);
    expect(sickHoursFor(null, BLOCK)).toBe(0);
  });
});

describe('coversSlot', () => {
  it('a sick shift does NOT count as covered', () => {
    // The operational half of the feature: you are short-staffed and the rota
    // has to say so.
    expect(coversSlot({ sick: true })).toBe(false);
  });

  it('a normal shift covers, and so does a no-show', () => {
    expect(coversSlot({})).toBe(true);
    // Deliberate: a no-show is discovered after the fact, so the roster was
    // planned as covered. Sick is known in advance and needs replacing.
    expect(coversSlot({ noShow: true })).toBe(true);
  });

  it('nothing assigned is not cover', () => {
    expect(coversSlot(null)).toBe(false);
    expect(coversSlot(undefined)).toBe(false);
  });
});

describe('effectiveSickPct', () => {
  it("uses the employee's own percentage when set", () => {
    expect(effectiveSickPct({ sickPayPct: 50 }, 100)).toBe(50);
  });

  it('falls back to the org default when the employee has none', () => {
    expect(effectiveSickPct({}, 100)).toBe(100);
    expect(effectiveSickPct({ sickPayPct: null }, 80)).toBe(80);
    expect(effectiveSickPct({ sickPayPct: '' }, 80)).toBe(80);
  });

  it('treats an explicit 0 on the employee as a real answer, not "unset"', () => {
    // The bug this guards: `emp.sickPayPct || orgDefault` would turn a
    // deliberate "this person gets nothing" into the org default.
    expect(effectiveSickPct({ sickPayPct: 0 }, 100)).toBe(0);
  });

  it('is 0, not 100, when nothing is configured anywhere', () => {
    // An org that has never touched this should see no phantom liability
    // appear in its costs.
    expect(effectiveSickPct({}, undefined)).toBe(0);
    expect(effectiveSickPct({}, null)).toBe(0);
  });
});

describe('calcSickCost', () => {
  it('is hours × rate × percentage', () => {
    expect(calcSickCost(hourly(200), 8, 100)).toBe(1600);
    expect(calcSickCost(hourly(200), 8, 50)).toBe(800);
  });

  it('is zero at 0%, and zero with no sick hours', () => {
    expect(calcSickCost(hourly(200), 8, 0)).toBe(0);
    expect(calcSickCost(hourly(200), 0, 100)).toBe(0);
  });

  it('converts a monthly salary the same way normal pay does', () => {
    // 40h/week over 4.33 weeks = 173.2h; 34640/173.2 = 200/h exactly.
    const salaried = { wage: 34640, contractType: 'salary', contractPeriod: 'month', maxHours: 40 };
    expect(calcSickCost(salaried, 8, 100)).toBeCloseTo(1600, 0);
  });

  it('falls back to the priority heuristic when no wage is set', () => {
    // Keeps the no-wage "cost index" mode internally consistent rather than
    // silently contributing nothing.
    expect(calcSickCost({ priority: 100 }, 8, 100)).toBe(8);
    expect(calcSickCost({ priority: 50 }, 8, 100)).toBe(4);
  });
});

describe('swapTimes — what hours an open shift actually runs', () => {
  const BLOCK2 = { start: '10:00', end: '16:00' };

  it("uses the shift's own hours when a manager set them", () => {
    // The bug this exists to stop. Three render sites each independently
    // reached for the BLOCK's hours, so an 18:00–22:00 open shift told staff it
    // ran 10:00–16:00 — six hours instead of four, discovered on the day.
    expect(swapTimes({ start: '18:00', end: '22:00' }, BLOCK2))
      .toEqual({ start: '18:00', end: '22:00' });
  });

  it('falls back to the block when the shift has none', () => {
    // Which is what every existing open shift means, so this is the common path.
    expect(swapTimes({}, BLOCK2)).toEqual({ start: '10:00', end: '16:00' });
  });

  it('does not throw on a missing shift or block', () => {
    expect(swapTimes(null, BLOCK2)).toEqual({ start: '10:00', end: '16:00' });
    expect(swapTimes({ start: '18:00', end: '22:00' }, null)).toEqual({ start: '18:00', end: '22:00' });
    expect(swapTimes(null, null)).toEqual({ start: '', end: '' });
  });
});

describe('blockForTime — which service a shift belongs to', () => {
  // The real Almus setup, including a dinner service that runs past midnight.
  const LUNCH = { id: 'lunch', name: 'Lunch', start: '10:00', end: '16:00' };
  const DINNER = { id: 'dinner', name: 'Dinner', start: '16:30', end: '00:00' };
  const BLOCKS = [LUNCH, DINNER];

  it('puts an 18:00 shift in Dinner, not Lunch', () => {
    // The reported bug: an 18:00–22:00 waiter shift drew in the Lunch row,
    // under a "10:00–16:00" heading that its own times contradicted.
    expect(blockForTime('18:00', BLOCKS).id).toBe('dinner');
  });

  it('puts a midday shift in Lunch', () => {
    expect(blockForTime('12:00', BLOCKS).id).toBe('lunch');
  });

  it('handles a service that runs past midnight', () => {
    // Dinner's end (00:00) reads as less than its start, so the span has to be
    // pushed to 16:30 → 24:00 or a 23:30 shift matches nothing.
    expect(blockForTime('23:30', BLOCKS).id).toBe('dinner');

    // And a block that genuinely crosses into the next day has to catch the
    // small hours, which means testing an early time against YESTERDAY's span
    // as well as today's.
    const LATE = { id: 'late', name: 'Late', start: '18:00', end: '02:00' };
    expect(blockForTime('01:00', [LUNCH, LATE]).id).toBe('late');
    expect(blockForTime('23:00', [LUNCH, LATE]).id).toBe('late');
  });

  it('leaves 01:00 out of a service that ended at midnight', () => {
    // Deliberate, and the counterpart to the test above: 01:00 is genuinely
    // after Dinner closes, so it is not a dinner shift. It falls back to the
    // day's first service rather than being forced into the nearest one.
    expect(blockForTime('01:00', BLOCKS).id).toBe('lunch');
  });

  it('keeps a time in the gap between services with the one that just ended', () => {
    // 16:10 is after Lunch closes and before Dinner opens.
    expect(blockForTime('16:10', BLOCKS).id).toBe('lunch');

    // With a third service the answer has to be the MOST RECENT one to have
    // started, not merely the first that had started — with only two blocks
    // those are the same block, so this case is what actually pins it down.
    const BREAKFAST = { id: 'breakfast', name: 'Breakfast', start: '06:00', end: '10:00' };
    expect(blockForTime('16:10', [BREAKFAST, LUNCH, DINNER]).id).toBe('lunch');
  });

  it('sends an early-morning time to the first service of the day', () => {
    expect(blockForTime('06:00', BLOCKS).id).toBe('lunch');
  });

  it('picks the tightest fit when services overlap', () => {
    // A short block nested inside a long one is a real setup (a bar shift
    // inside all-day service). The narrower one is the better answer.
    const BRUNCH = { id: 'brunch', name: 'Brunch', start: '11:00', end: '13:00' };
    expect(blockForTime('12:00', [LUNCH, BRUNCH]).id).toBe('brunch');
    expect(blockForTime('12:00', [BRUNCH, LUNCH]).id).toBe('brunch');   // order-independent
  });

  it('returns null when there are no usable blocks, rather than throwing', () => {
    expect(blockForTime('18:00', [])).toBe(null);
    expect(blockForTime('18:00', null)).toBe(null);
    expect(blockForTime('18:00', [{ id: 'x', name: 'Broken' }])).toBe(null);
  });

  it('falls back to the first block on a missing or malformed time', () => {
    // toMin() would throw on undefined; a half-typed time in a picker must not
    // take the dialog down with it.
    expect(blockForTime(undefined, BLOCKS).id).toBe('lunch');
    expect(blockForTime('', BLOCKS).id).toBe('lunch');
    expect(blockForTime('nonsense', BLOCKS).id).toBe('lunch');
  });
});
