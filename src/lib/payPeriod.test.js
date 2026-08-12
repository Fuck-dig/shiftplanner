import { describe, it, expect } from 'vitest';
import {
  payPeriodFor, lastBankingDayOfMonth, payDateFor, shiftPayPeriod,
  calendarMonthRange, rangeFromWeekDates, isInRange, DEFAULT_PAY_PERIOD_START_DAY,
} from './payPeriod';

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('payPeriodFor — 16th to 15th', () => {
  it('the example from the spec: 16 June runs to 15 July', () => {
    const p = payPeriodFor(new Date(2026, 5, 16));
    expect(iso(p.start)).toBe('2026-06-16');
    expect(iso(p.end)).toBe('2026-07-15');
  });

  it('a date before the 16th belongs to the period that opened LAST month', () => {
    const p = payPeriodFor(new Date(2026, 6, 3));   // 3 July
    expect(iso(p.start)).toBe('2026-06-16');
    expect(iso(p.end)).toBe('2026-07-15');
  });

  it('the 15th is the LAST day of its period, not the first of the next', () => {
    // The inclusive boundary. Off by one here and someone's last shift lands in
    // the wrong month's pay.
    const p = payPeriodFor(new Date(2026, 6, 15));
    expect(iso(p.end)).toBe('2026-07-15');
    const next = payPeriodFor(new Date(2026, 6, 16));
    expect(iso(next.start)).toBe('2026-07-16');
  });

  it('rolls over the year end in both directions', () => {
    expect(iso(payPeriodFor(new Date(2026, 11, 20)).end)).toBe('2027-01-15');   // Dec -> Jan
    expect(iso(payPeriodFor(new Date(2026, 0, 5)).start)).toBe('2025-12-16');   // Jan -> Dec
  });

  it('handles February, whose period ends on the 15th like any other', () => {
    const p = payPeriodFor(new Date(2026, 1, 20)); // 20 Feb
    expect(iso(p.start)).toBe('2026-02-16');
    expect(iso(p.end)).toBe('2026-03-15');
  });

  it('a start day of 1 makes the period the calendar month', () => {
    // Not the configured value here, but it's the setting's natural edge and it
    // should degrade to something obviously correct rather than something odd.
    const p = payPeriodFor(new Date(2026, 7, 20), 1);
    expect(iso(p.start)).toBe('2026-08-01');
    expect(iso(p.end)).toBe('2026-08-31');
  });

  it('defaults to the 16th when given nothing usable', () => {
    expect(DEFAULT_PAY_PERIOD_START_DAY).toBe(16);
    expect(iso(payPeriodFor(new Date(2026, 5, 20), undefined).start)).toBe('2026-06-16');
    expect(iso(payPeriodFor(new Date(2026, 5, 20), null).start)).toBe('2026-06-16');
  });
});

describe('lastBankingDayOfMonth', () => {
  it('uses the last day when it is a weekday', () => {
    // 31 Aug 2026 is a Monday.
    expect(iso(lastBankingDayOfMonth(2026, 7))).toBe('2026-08-31');
  });

  it('steps back off a Sunday', () => {
    // 31 May 2026 is a Sunday -> Friday 29th.
    expect(iso(lastBankingDayOfMonth(2026, 4))).toBe('2026-05-29');
  });

  it('steps back off a Saturday', () => {
    // 28 Feb 2026 is a Saturday -> Friday 27th.
    expect(iso(lastBankingDayOfMonth(2026, 1))).toBe('2026-02-27');
  });

  it('gets February right in a leap year', () => {
    // 29 Feb 2028 is a Tuesday.
    expect(iso(lastBankingDayOfMonth(2028, 1))).toBe('2028-02-29');
  });
});

describe('payDateFor', () => {
  it('16 Jun – 15 Jul is paid at the end of JULY, not August', () => {
    // The off-by-one worth pinning: it's the month the period ENDS in.
    const p = payPeriodFor(new Date(2026, 5, 16));
    expect(iso(payDateFor(p))).toBe('2026-07-31');   // Friday
  });

  it('a period ending in May pays on the last banking day of May', () => {
    const p = payPeriodFor(new Date(2026, 3, 16));   // 16 Apr – 15 May
    expect(iso(payDateFor(p))).toBe('2026-05-29');   // 31st is a Sunday
  });
});

describe('shiftPayPeriod', () => {
  it('steps back a whole period', () => {
    const p = payPeriodFor(new Date(2026, 6, 1));            // 16 Jun – 15 Jul
    const prev = shiftPayPeriod(p, -1);
    expect(iso(prev.start)).toBe('2026-05-16');
    expect(iso(prev.end)).toBe('2026-06-15');
  });

  it('steps forward, and across a year boundary', () => {
    const p = payPeriodFor(new Date(2026, 11, 20));          // 16 Dec – 15 Jan
    const next = shiftPayPeriod(p, 1);
    expect(iso(next.start)).toBe('2027-01-16');
    expect(iso(next.end)).toBe('2027-02-15');
  });
});

describe('the other ranges', () => {
  it('calendarMonthRange covers the 1st to the last day', () => {
    const r = calendarMonthRange(2026, 1);
    expect(r.startISO).toBe('2026-02-01');
    expect(r.endISO).toBe('2026-02-28');
  });

  it('rangeFromWeekDates is Monday to Sunday inclusive', () => {
    const week = Array.from({ length: 7 }, (_, i) => new Date(2026, 7, 10 + i));
    const r = rangeFromWeekDates(week);
    expect(r.startISO).toBe('2026-08-10');
    expect(r.endISO).toBe('2026-08-16');
  });
});

describe('isInRange', () => {
  const r = payPeriodFor(new Date(2026, 5, 16));   // 2026-06-16 .. 2026-07-15

  it('includes BOTH ends', () => {
    expect(isInRange('2026-06-16', r)).toBe(true);
    expect(isInRange('2026-07-15', r)).toBe(true);
  });

  it('excludes the days either side', () => {
    expect(isInRange('2026-06-15', r)).toBe(false);
    expect(isInRange('2026-07-16', r)).toBe(false);
  });

  it('is false for a missing range rather than throwing', () => {
    expect(isInRange('2026-06-20', null)).toBe(false);
  });
});
