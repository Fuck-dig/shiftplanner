import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  dateToISO,
  weekKeyToMonday,
  toMin,
  fmt,
  fmtLong,
  setLocale,
  getMondayDate,
  getWeekDates,
  weekOffsetFromDate,
  weekKey,
  getMonthOffsets,
  todayISO,
} from './dates';

// Every "current week" function here (getMondayDate, getWeekDates, weekKey,
// weekOffsetFromDate, todayISO, getMonthOffsets) is relative to whatever
// `new Date()` returns right now — that's exactly what makes a Monday-vs-
// Sunday edge case easy to introduce by accident and easy to miss in manual
// testing (it only breaks on specific days of the week). Pinning the clock
// with fake timers makes these deterministic instead of only failing on a
// Sunday nobody happened to test on.
describe('dates (pure formatting helpers)', () => {
  it('dateToISO pads single-digit month/day', () => {
    expect(dateToISO(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(dateToISO(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('weekKeyToMonday parses a YYYY-MM-DD key back to the same calendar date', () => {
    const d = weekKeyToMonday('2026-07-27');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6); // 0-indexed: July
    expect(d.getDate()).toBe(27);
  });

  it('toMin converts HH:MM to minutes since midnight', () => {
    expect(toMin('00:00')).toBe(0);
    expect(toMin('09:30')).toBe(570);
    expect(toMin('23:59')).toBe(1439);
  });

  it('fmt/fmtLong use whatever locale setLocale last set', () => {
    setLocale('en-GB');
    expect(fmt(new Date(2026, 6, 23))).toBe('23 Jul');
    expect(fmtLong('2026-07-23')).toBe('23 July 2026');
    setLocale('en-GB'); // reset so later tests/files aren't affected by ordering
  });
});

describe('dates (relative to "now" — fake timers)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('getMondayDate(0) returns this week\'s Monday when "today" is a mid-week day', () => {
    vi.setSystemTime(new Date(2026, 6, 22)); // Wed 22 Jul 2026
    const monday = getMondayDate(0);
    expect(dateToISO(monday)).toBe('2026-07-20');
  });

  it('getMondayDate(0) still resolves to the CURRENT week\'s Monday when "today" is itself a Sunday', () => {
    // Sunday is getDay()===0 — the one day the naive "day-of-week - 1" math
    // would walk forward into next week instead of back to this week's
    // Monday without the dy===0 special case in the source.
    vi.setSystemTime(new Date(2026, 6, 26)); // Sun 26 Jul 2026
    const monday = getMondayDate(0);
    expect(dateToISO(monday)).toBe('2026-07-20');
  });

  it('getMondayDate offsets by whole weeks in both directions', () => {
    vi.setSystemTime(new Date(2026, 6, 22)); // Wed 22 Jul 2026 -> week of Mon 20 Jul
    expect(dateToISO(getMondayDate(1))).toBe('2026-07-27');
    expect(dateToISO(getMondayDate(-1))).toBe('2026-07-13');
  });

  it('getWeekDates returns 7 consecutive days starting Monday', () => {
    vi.setSystemTime(new Date(2026, 6, 22));
    const week = getWeekDates(0);
    expect(week).toHaveLength(7);
    expect(dateToISO(week[0])).toBe('2026-07-20');
    expect(dateToISO(week[6])).toBe('2026-07-26');
  });

  it('weekOffsetFromDate is the inverse of getMondayDate: a date in the current week is offset 0', () => {
    vi.setSystemTime(new Date(2026, 6, 22)); // "today"
    expect(weekOffsetFromDate(new Date(2026, 6, 24))).toBe(0); // Fri same week
    expect(weekOffsetFromDate(new Date(2026, 6, 29))).toBe(1); // next week
    expect(weekOffsetFromDate(new Date(2026, 6, 15))).toBe(-1); // previous week
  });

  it('weekOffsetFromDate handles a Sunday target date correctly (belongs to the week ending that day, not the next one)', () => {
    vi.setSystemTime(new Date(2026, 6, 22));
    expect(weekOffsetFromDate(new Date(2026, 6, 26))).toBe(0); // Sun 26 Jul is the end of the CURRENT week
  });

  it('weekKey formats the Monday of the given offset as YYYY-MM-DD', () => {
    vi.setSystemTime(new Date(2026, 6, 22));
    expect(weekKey(0)).toBe('2026-07-20');
    expect(weekKey(1)).toBe('2026-07-27');
  });

  it('todayISO matches dateToISO of "now"', () => {
    vi.setSystemTime(new Date(2026, 6, 22, 14, 30));
    expect(todayISO()).toBe('2026-07-22');
  });

  it('getMonthOffsets({y,m}) covers every week that touches the given month', () => {
    vi.setSystemTime(new Date(2026, 6, 1)); // baseline "now" the offsets are relative to
    // July 2026: Wed 1 Jul -> Fri 31 Jul. First calendar-grid row starts
    // Mon 29 Jun, last row starts Mon 27 Jul (which still touches July via
    // its Wed 29 Jul). Six rows fit a month starting mid-week like this.
    const offsets = getMonthOffsets({ y: 2026, m: 6 }); // m is 0-indexed: June=5, July=6
    const mondays = offsets.map(off => dateToISO(getMondayDate(off)));
    expect(mondays[0]).toBe('2026-06-29');
    expect(mondays[mondays.length - 1]).toBe('2026-07-27');
    // Every returned week must actually overlap July.
    for (const off of offsets) {
      const mon = getMondayDate(off);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      const touchesJuly = mon.getMonth() === 6 || sun.getMonth() === 6;
      expect(touchesJuly).toBe(true);
    }
  });

  it('getMonthOffsets accepts the legacy numeric weekOffset form', () => {
    vi.setSystemTime(new Date(2026, 6, 1));
    const offsets = getMonthOffsets(0); // "the month containing this week"
    expect(offsets.length).toBeGreaterThan(0);
  });
});
