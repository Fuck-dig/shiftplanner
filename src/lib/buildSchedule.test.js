import { describe, it, expect } from 'vitest';
import { buildSchedule } from './schedule';

// The schedule generator is the app's headline feature and had NO tests at all
// before this file — 84 tests in schedule.test.js, none touching buildSchedule.
// These are characterisation tests first and foremost: they pin down what it
// actually does today, so the next change to it can't quietly alter the rota
// every restaurant gets. Where current behaviour looks wrong, the test says so
// in its name rather than asserting the behaviour we wish it had.

const ALL_DAY = { from: '00:00', to: '23:59' };
const avail = (days = ['Mon']) => Object.fromEntries(days.map(d => [d, ALL_DAY]));

function emp(id, roles, extra = {}) {
  return {
    id, name: id, roles,
    availability: avail(extra.days || ['Mon']),
    maxHours: 40, targetHours: 40, priority: 100,
    wage: 0, contractType: 'hourly', contractPeriod: 'week',
    ...extra,
  };
}
// A block on Monday only, so each test exercises one day cleanly.
const block = (id, roles, start = '10:00', end = '18:00') => ({ id, name: id, start, end, roles });

// Fixed dates: Mon 2026-08-03 .. Sun 2026-08-09. Real Date objects because
// buildSchedule runs dateToISO over them for time-off matching.
const WEEK = Array.from({ length: 7 }, (_, i) => new Date(2026, 7, 3 + i));

const on = (res, day, blockId) => (res.schedule[day]?.[blockId] || []);
const namesOn = (res, day, blockId) => on(res, day, blockId).map(a => a.empId).sort();

describe('buildSchedule — filling slots', () => {
  it('fills a required role with an available person', () => {
    const res = buildSchedule([emp('ann', ['Waiter'])], [block('b1', { Waiter: 1 })], WEEK, [], ['Waiter']);
    expect(namesOn(res, 'Mon', 'b1')).toEqual(['ann']);
    expect(res.total).toBe(1);
  });

  it('leaves the slot empty rather than assigning someone unavailable that day', () => {
    const res = buildSchedule([emp('ann', ['Waiter'], { days: ['Tue'] })], [block('b1', { Waiter: 1 })], WEEK, [], ['Waiter']);
    expect(namesOn(res, 'Mon', 'b1')).toEqual([]);
  });

  it('never assigns the same person twice in one block', () => {
    // Someone who holds two roles could otherwise fill both openings in the
    // same block and appear to be in two places at once.
    const res = buildSchedule(
      [emp('ann', ['Waiter', 'Bartender'])],
      [block('b1', { Waiter: 1, Bartender: 1 })],
      WEEK, [], ['Waiter', 'Bartender'],
    );
    expect(on(res, 'Mon', 'b1')).toHaveLength(1);
  });
});

describe('buildSchedule — the limits it must respect', () => {
  it('will not push someone past maxHours', () => {
    // 8h block, cap of 8h: the first day fits, the second must not.
    const ann = emp('ann', ['Waiter'], { days: ['Mon', 'Tue'], maxHours: 8, targetHours: 8 });
    const res = buildSchedule([ann], [block('b1', { Waiter: 1 })], WEEK, [], ['Waiter']);
    expect(namesOn(res, 'Mon', 'b1')).toEqual(['ann']);
    expect(namesOn(res, 'Tue', 'b1')).toEqual([]);
  });

  it('skips someone on APPROVED time off', () => {
    const res = buildSchedule(
      [emp('ann', ['Waiter'])], [block('b1', { Waiter: 1 })], WEEK,
      [{ empId: 'ann', status: 'Approved', startDate: '2026-08-03', endDate: '2026-08-03' }],
      ['Waiter'],
    );
    expect(namesOn(res, 'Mon', 'b1')).toEqual([]);
  });

  it('IGNORES pending time off — only approved leave blocks scheduling', () => {
    // Deliberate: a request nobody has decided on shouldn't silently remove
    // someone from the rota. Pinned because it's the kind of thing that gets
    // "fixed" into blocking, which would hide staff without a decision.
    const res = buildSchedule(
      [emp('ann', ['Waiter'])], [block('b1', { Waiter: 1 })], WEEK,
      [{ empId: 'ann', status: 'Pending', startDate: '2026-08-03', endDate: '2026-08-03' }],
      ['Waiter'],
    );
    expect(namesOn(res, 'Mon', 'b1')).toEqual(['ann']);
  });

  it('enforces the 11-hour rest minimum between two shifts', () => {
    // Mon 18:00–22:00 then Tue 06:00–10:00 is an 8h gap — under the EU daily
    // rest minimum, so the second shift must go unfilled.
    const ann = emp('ann', ['Waiter'], { days: ['Mon', 'Tue'] });
    const res = buildSchedule(
      [ann],
      [block('evening', { Waiter: 1 }, '18:00', '22:00'), block('early', { Waiter: 1 }, '06:00', '10:00')],
      WEEK, [], ['Waiter'],
    );
    const monEvening = namesOn(res, 'Mon', 'evening');
    const tueEarly = namesOn(res, 'Tue', 'early');
    expect(monEvening.length + tueEarly.length).toBe(1);
  });
});

describe('buildSchedule — who it picks', () => {
  it('prefers the cheaper of two equally eligible people', () => {
    const res = buildSchedule(
      [emp('dear', ['Waiter'], { wage: 300 }), emp('cheap', ['Waiter'], { wage: 100 })],
      [block('b1', { Waiter: 1 })], WEEK, [], ['Waiter'],
    );
    expect(namesOn(res, 'Mon', 'b1')).toEqual(['cheap']);
  });

  it('falls back to priority when nobody has a wage', () => {
    const res = buildSchedule(
      [emp('high', ['Waiter'], { priority: 150 }), emp('low', ['Waiter'], { priority: 50 })],
      [block('b1', { Waiter: 1 })], WEEK, [], ['Waiter'],
    );
    expect(namesOn(res, 'Mon', 'b1')).toEqual(['low']);
  });

  it('spreads work: someone already at their target loses to someone under it, even if dearer', () => {
    // Without this the cheapest person absorbs every hour until they hit
    // maxHours, which is legal but not a rota anyone wants.
    const cheap = emp('cheap', ['Waiter'], { days: ['Mon', 'Tue'], wage: 100, targetHours: 8, maxHours: 40 });
    const dear = emp('dear', ['Waiter'], { days: ['Mon', 'Tue'], wage: 300, targetHours: 40, maxHours: 40 });
    const res = buildSchedule([cheap, dear], [block('b1', { Waiter: 1 })], WEEK, [], ['Waiter']);
    expect(namesOn(res, 'Mon', 'b1')).toEqual(['cheap']);   // under target, cheaper
    expect(namesOn(res, 'Tue', 'b1')).toEqual(['dear']);    // cheap is now at target
  });
});

describe('buildSchedule — manager cover', () => {
  it('adds a manager to a staffed block that has none', () => {
    const res = buildSchedule(
      [emp('ann', ['Waiter']), emp('mo', ['Manager'])],
      [block('b1', { Waiter: 1 })], WEEK, [], ['Waiter'],
    );
    expect(namesOn(res, 'Mon', 'b1')).toEqual(['ann', 'mo']);
  });

  it('does NOT invent a manager for an empty block', () => {
    const res = buildSchedule([emp('mo', ['Manager'])], [block('b1', { Waiter: 1 })], WEEK, [], ['Waiter']);
    expect(namesOn(res, 'Mon', 'b1')).toEqual([]);
  });

  it('reports blocks it could not put a manager on', () => {
    const res = buildSchedule([emp('ann', ['Waiter'])], [block('b1', { Waiter: 1 })], WEEK, [], ['Waiter']);
    expect(res.noMgr).toContainEqual({ day: 'Mon', block: 'b1' });
  });
});

describe('buildSchedule — role ORDER changes the rota (see CHANGELOG)', () => {
  // The finding this file was written to demonstrate. Roles are filled greedily
  // in allRoles order with no backtracking, so whoever is scarce gets consumed
  // by whichever role is considered first. allRoles is the USER'S drag-to-
  // reorder order from the day timeline — a setting presented as purely visual.
  const scenario = (allRoles) => buildSchedule(
    [
      emp('flex', ['Waiter', 'Bartender']),  // the only person who can tend bar
      emp('waiterOnly', ['Waiter']),
    ],
    [block('b1', { Waiter: 1, Bartender: 1 })],
    WEEK, [], allRoles,
  );

  it('Waiter first: the flexible person is used as a waiter and the bar goes unstaffed', () => {
    const res = scenario(['Waiter', 'Bartender']);
    const roles = on(res, 'Mon', 'b1').map(a => a.role).sort();
    expect(roles).toEqual(['Waiter']);
    expect(on(res, 'Mon', 'b1')).toHaveLength(1);
  });

  it('Bartender first: BOTH slots fill — a strictly better rota from the same inputs', () => {
    const res = scenario(['Bartender', 'Waiter']);
    const roles = on(res, 'Mon', 'b1').map(a => a.role).sort();
    expect(roles).toEqual(['Bartender', 'Waiter']);
    expect(on(res, 'Mon', 'b1')).toHaveLength(2);
  });
});
