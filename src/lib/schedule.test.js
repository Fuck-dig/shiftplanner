import { describe, it, expect } from 'vitest';
import {
  blockHours,
  assignmentHours,
  actualAssignmentHours,
  actualTimeRange,
  effectiveHourlyRate,
  calcWageCost,
  coversBlock,
  dayCoverage,
  hasRestConflict,
  pruneOrphanedAssignments,
  applyAssignmentDrop,
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

  it('is 0 (not a 24h wrap) when actualStart and actualEnd land in the same minute', () => {
    // Regression: clocking in and straight back out (e.g. a quick kiosk
    // test) sets actualStart===actualEnd, which blockHours would otherwise
    // read as a full 24h day — the same convention that correctly gives a
    // genuinely round-the-clock scheduled block (start===end) 24 hours.
    expect(actualAssignmentHours({ actualStart: '17:29', actualEnd: '17:29' }, block)).toBe(0);
  });

  it('still gives a real overnight actual shift its correct wrapped hours', () => {
    expect(actualAssignmentHours({ actualStart: '22:00', actualEnd: '06:00' }, block)).toBe(8);
  });
});

describe('actualTimeRange', () => {
  const block = { start: '09:00', end: '17:00' };

  it('describes the scheduled window with hasActual:false when nothing is recorded', () => {
    expect(actualTimeRange({}, block)).toEqual({ startMin: 9*60, endMin: 17*60, hasActual: false, ongoing: false });
  });

  it('marks a no-show the same way (scheduled window, hasActual:false)', () => {
    expect(actualTimeRange({ noShow: true }, block)).toEqual({ startMin: 9*60, endMin: 17*60, hasActual: false, ongoing: false });
  });

  it('is "ongoing" once clocked in but not yet out — end falls back to the scheduled end', () => {
    expect(actualTimeRange({ actualStart: '10:00' }, block)).toEqual({ startMin: 10*60, endMin: 17*60, hasActual: true, ongoing: true });
  });

  it('resolves a completed actual span, hasActual:true, ongoing:false', () => {
    expect(actualTimeRange({ actualStart: '10:00', actualEnd: '15:30' }, block)).toEqual({ startMin: 10*60, endMin: 15*60+30, hasActual: true, ongoing: false });
  });

  it('collapses a same-minute punch to a zero-length range instead of wrapping', () => {
    expect(actualTimeRange({ actualStart: '17:36', actualEnd: '17:36' }, block)).toEqual({ startMin: 17*60+36, endMin: 17*60+36, hasActual: true, ongoing: false });
  });

  it('wraps a real overnight actual span past midnight', () => {
    expect(actualTimeRange({ actualStart: '22:00', actualEnd: '06:00' }, block)).toEqual({ startMin: 22*60, endMin: 24*60+6*60, hasActual: true, ongoing: false });
  });
});

describe('hasRestConflict', () => {
  const blocks = [
    { id: 'morning', start: '09:00', end: '17:00' },
    { id: 'evening', start: '18:00', end: '23:00' }, // 6h rest after morning ends
    { id: 'closeShift', start: '22:00', end: '23:59' },
    { id: 'earlyNext', start: '08:00', end: '16:00' }, // <11h after closeShift the next day
    { id: 'lateNext', start: '11:00', end: '19:00' }, // >=11h after closeShift the next day
  ];

  it('is false when the employee has no other shifts that week', () => {
    const schedule = { Mon: { morning: [{ empId: 'e1', role: 'Waiter' }] } };
    expect(hasRestConflict('e1', 'Mon', 'morning', schedule, blocks)).toBe(false);
  });

  it('is true for a literal same-day overlap', () => {
    const overlapping = [{ id: 'a', start: '09:00', end: '17:00' }, { id: 'b', start: '15:00', end: '20:00' }];
    const schedule = { Mon: { a: [{ empId: 'e1' }], b: [{ empId: 'e1' }] } };
    expect(hasRestConflict('e1', 'Mon', 'b', schedule, overlapping)).toBe(true);
  });

  it('is true when the gap to the next day\'s shift is under 11h', () => {
    const schedule = { Mon: { closeShift: [{ empId: 'e1' }] }, Tue: { earlyNext: [{ empId: 'e1' }] } };
    // closeShift ends 23:59 Mon, earlyNext starts 08:00 Tue — about 8h gap.
    expect(hasRestConflict('e1', 'Tue', 'earlyNext', schedule, blocks)).toBe(true);
  });

  it('is false when the gap to the next day\'s shift is 11h or more', () => {
    const schedule = { Mon: { closeShift: [{ empId: 'e1' }] }, Tue: { lateNext: [{ empId: 'e1' }] } };
    // closeShift ends 23:59 Mon, lateNext starts 11:00 Tue — well over 11h.
    expect(hasRestConflict('e1', 'Tue', 'lateNext', schedule, blocks)).toBe(false);
  });

  it('checks a hypothetical override time instead of the block\'s own nominal time', () => {
    const schedule = { Mon: { closeShift: [{ empId: 'e1' }] } };
    // earlyNext isn't assigned to anyone yet — but check as if it were typed
    // in with a custom, even-earlier start via the override param.
    expect(hasRestConflict('e1', 'Tue', 'earlyNext', schedule, blocks, { start: '01:00', end: '09:00' })).toBe(true);
    expect(hasRestConflict('e1', 'Tue', 'earlyNext', schedule, blocks, { start: '12:00', end: '20:00' })).toBe(false);
  });

  it('ignores the slot being checked against itself', () => {
    const schedule = { Mon: { morning: [{ empId: 'e1' }] } };
    expect(hasRestConflict('e1', 'Mon', 'morning', schedule, blocks)).toBe(false);
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

describe('pruneOrphanedAssignments', () => {
  // Deleting an employee didn't used to remove their existing shift
  // assignments from the schedule — this is the fix for that, exercised
  // directly against the same {week: {schedule: {day: {blockId: [...]}}}}
  // shape App.jsx keeps in state.
  const schedulesByWeek = {
    '2026-08-03': {
      confirmed: true,
      schedule: {
        Mon: { lunch: [{ empId: 'alive-1', role: 'Waiter' }, { empId: 'gone-1', role: 'Manager' }] },
        Tue: { lunch: [{ empId: 'alive-1', role: 'Waiter' }] },
      },
    },
    '2026-08-10': {
      confirmed: false,
      schedule: {
        Mon: { lunch: [{ empId: 'gone-1', role: 'Manager' }, { empId: 'gone-2', role: 'Waiter' }] },
      },
    },
  };

  it('strips assignments for ids not in the valid set, across every week/day/block', () => {
    const { schedules, removed } = pruneOrphanedAssignments(schedulesByWeek, ['alive-1']);
    expect(removed).toBe(3);
    expect(schedules['2026-08-03'].schedule.Mon.lunch).toEqual([{ empId: 'alive-1', role: 'Waiter' }]);
    expect(schedules['2026-08-03'].schedule.Tue.lunch).toEqual([{ empId: 'alive-1', role: 'Waiter' }]);
    expect(schedules['2026-08-10'].schedule.Mon.lunch).toEqual([]);
  });

  it('leaves everything else on the week entry untouched (e.g. confirmed)', () => {
    const { schedules } = pruneOrphanedAssignments(schedulesByWeek, ['alive-1']);
    expect(schedules['2026-08-03'].confirmed).toBe(true);
    expect(schedules['2026-08-10'].confirmed).toBe(false);
  });

  it('reports 0 removed and leaves assignments alone when nobody is orphaned', () => {
    const { schedules, removed } = pruneOrphanedAssignments(schedulesByWeek, ['alive-1', 'gone-1', 'gone-2']);
    expect(removed).toBe(0);
    expect(schedules).toEqual(schedulesByWeek);
  });

  it('accepts a Set as well as an array for validEmpIds', () => {
    const { removed } = pruneOrphanedAssignments(schedulesByWeek, new Set(['alive-1']));
    expect(removed).toBe(3);
  });

  it('handles a week entry with no schedule (e.g. a stray null) without throwing', () => {
    const withNull = { '2026-08-17': null, ...schedulesByWeek };
    const { schedules } = pruneOrphanedAssignments(withNull, ['alive-1']);
    expect(schedules['2026-08-17']).toBe(null);
  });

  it('handles an empty schedules object', () => {
    expect(pruneOrphanedAssignments({}, ['alive-1'])).toEqual({ schedules: {}, removed: 0 });
  });
});

describe('applyAssignmentDrop', () => {
  // Drag-and-drop reassignment. The invariant that actually matters: nobody
  // is duplicated and nobody vanishes — a move keeps the headcount the same
  // across the whole schedule, and a swap keeps both people present.
  const base = () => ({
    Mon: { lunch: [{ empId: 'a', name: 'Ann', role: 'Waiter' }, { empId: 'b', name: 'Bo', role: 'Manager' }], dinner: [] },
    Tue: { lunch: [{ empId: 'c', name: 'Cy', role: 'Kitchen' }], dinner: [] },
  });
  const countPeople = sch => Object.values(sch).flatMap(day => Object.values(day).flat()).length;

  it('moves someone to another day, adopting the destination role', () => {
    const out = applyAssignmentDrop(base(), { day: 'Mon', blockId: 'lunch', idx: 0 }, { day: 'Tue', blockId: 'lunch', role: 'Kitchen' });
    expect(out.Mon.lunch.map(a => a.empId)).toEqual(['b']);
    expect(out.Tue.lunch.map(a => a.empId)).toEqual(['c', 'a']);
    expect(out.Tue.lunch[1].role).toBe('Kitchen'); // took the destination's role
    expect(countPeople(out)).toBe(countPeople(base())); // nobody gained or lost
  });

  it('moves someone to a different block on the same day', () => {
    const out = applyAssignmentDrop(base(), { day: 'Mon', blockId: 'lunch', idx: 1 }, { day: 'Mon', blockId: 'dinner', role: 'Manager' });
    expect(out.Mon.lunch.map(a => a.empId)).toEqual(['a']);
    expect(out.Mon.dinner.map(a => a.empId)).toEqual(['b']);
    expect(countPeople(out)).toBe(countPeople(base()));
  });

  it('swaps two people when dropped onto an occupied slot, exchanging roles', () => {
    const out = applyAssignmentDrop(base(), { day: 'Mon', blockId: 'lunch', idx: 0 }, { day: 'Tue', blockId: 'lunch', role: 'Kitchen', idx: 0 });
    expect(out.Mon.lunch[0].empId).toBe('c');
    expect(out.Mon.lunch[0].role).toBe('Waiter');  // c takes the slot a vacated
    expect(out.Tue.lunch[0].empId).toBe('a');
    expect(out.Tue.lunch[0].role).toBe('Kitchen'); // a takes the slot c vacated
    expect(countPeople(out)).toBe(countPeople(base()));
  });

  it('preserves custom times and clocked data on a moved assignment', () => {
    const sch = base();
    sch.Mon.lunch[0] = { ...sch.Mon.lunch[0], start: '11:00', end: '15:00', actualStart: '11:05' };
    const out = applyAssignmentDrop(sch, { day: 'Mon', blockId: 'lunch', idx: 0 }, { day: 'Tue', blockId: 'dinner', role: 'Waiter' });
    expect(out.Tue.dinner[0]).toMatchObject({ empId: 'a', start: '11:00', end: '15:00', actualStart: '11:05' });
  });

  it('returns null when dropped on itself', () => {
    expect(applyAssignmentDrop(base(), { day: 'Mon', blockId: 'lunch', idx: 0 }, { day: 'Mon', blockId: 'lunch', role: 'Waiter', idx: 0 })).toBeNull();
  });

  it('returns null for a stale source index rather than corrupting the schedule', () => {
    expect(applyAssignmentDrop(base(), { day: 'Mon', blockId: 'lunch', idx: 9 }, { day: 'Tue', blockId: 'lunch', role: 'Kitchen' })).toBeNull();
  });

  it('returns null for an unknown destination day or a stale swap target', () => {
    expect(applyAssignmentDrop(base(), { day: 'Mon', blockId: 'lunch', idx: 0 }, { day: 'Sat', blockId: 'lunch', role: 'Waiter' })).toBeNull();
    expect(applyAssignmentDrop(base(), { day: 'Mon', blockId: 'lunch', idx: 0 }, { day: 'Tue', blockId: 'lunch', role: 'Kitchen', idx: 7 })).toBeNull();
  });

  it('does not mutate the schedule it was given', () => {
    const sch = base();
    applyAssignmentDrop(sch, { day: 'Mon', blockId: 'lunch', idx: 0 }, { day: 'Tue', blockId: 'lunch', role: 'Kitchen' });
    expect(sch.Mon.lunch.map(a => a.empId)).toEqual(['a', 'b']); // original untouched
  });
});

describe('applyAssignmentDrop — no duplicate assignments in one block', () => {
  // Regression: drag-and-drop could put the same person in a block twice.
  // That's not just untidy — the week grid maps a rendered card back to its
  // underlying assignment by employee id, so with a duplicate BOTH cards
  // resolve to the first one, and editing or dragging either silently acts on
  // the wrong assignment.
  const base = () => ({
    Mon: { lunch: [{ empId: 'a', name: 'Ann', role: 'Waiter' }], dinner: [] },
    Tue: { lunch: [{ empId: 'a', name: 'Ann', role: 'Waiter' }], dinner: [] },
  });

  it('refuses a move into a block the person is already in', () => {
    const out = applyAssignmentDrop(base(), { day: 'Tue', blockId: 'lunch', idx: 0 }, { day: 'Mon', blockId: 'lunch', role: 'Kitchen' });
    expect(out).toBeNull();
  });

  it('still allows moving to a DIFFERENT block on a day they already work', () => {
    // Split shifts are legitimate — the rule is one block, not one day.
    const out = applyAssignmentDrop(base(), { day: 'Tue', blockId: 'lunch', idx: 0 }, { day: 'Mon', blockId: 'dinner', role: 'Waiter' });
    expect(out.Mon.dinner.map(a => a.empId)).toEqual(['a']);
    expect(out.Mon.lunch.map(a => a.empId)).toEqual(['a']);
    expect(out.Tue.lunch).toEqual([]);
  });

  it('still allows re-roling within the same block (dropped on its own cell)', () => {
    // Source and destination are the same assignment, so the "already there"
    // check must not count the person against themselves.
    const sch = { Mon: { lunch: [{ empId: 'a', name: 'Ann', role: 'Waiter' }, { empId: 'b', name: 'Bo', role: 'Kitchen' }] } };
    const out = applyAssignmentDrop(sch, { day: 'Mon', blockId: 'lunch', idx: 0 }, { day: 'Mon', blockId: 'lunch', role: 'Kitchen' });
    expect(out.Mon.lunch.filter(a => a.empId === 'a')).toHaveLength(1);
    expect(out.Mon.lunch.find(a => a.empId === 'a').role).toBe('Kitchen');
    expect(out.Mon.lunch).toHaveLength(2); // Bo untouched
  });

  it('a swap into a block the dragged person already works is still fine', () => {
    // Swaps exchange positions rather than appending, so no duplicate is
    // possible — this must keep working.
    const sch = {
      Mon: { lunch: [{ empId: 'a', name: 'Ann', role: 'Waiter' }, { empId: 'b', name: 'Bo', role: 'Kitchen' }] },
      Tue: { lunch: [{ empId: 'a', name: 'Ann', role: 'Waiter' }] },
    };
    const out = applyAssignmentDrop(sch, { day: 'Tue', blockId: 'lunch', idx: 0 }, { day: 'Mon', blockId: 'lunch', role: 'Kitchen', idx: 1 });
    expect(out.Mon.lunch.filter(a => a.empId === 'a')).toHaveLength(2); // swap, by design
    expect(out.Tue.lunch[0].empId).toBe('b');
  });
});
