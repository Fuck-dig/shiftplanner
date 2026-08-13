import { describe, it, expect } from 'vitest';
import {
  actualAssignmentHours, sickHoursFor, coversSlot, effectiveSickPct, calcSickCost,
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
