import { dateToISO } from './dates';

// Pay periods.
//
// Almus runs 16th → 15th: shifts from 16 June to 15 July are paid on the last
// banking day of July. That start day is a restaurant-level agreement rather
// than anything universal, so it's a setting (`organizations.pay_period_start_day`)
// with 16 as the default rather than a constant buried in here.
//
// Everything below is pure and works in local time on whole days, matching the
// rest of the app — assignments are keyed by week and day name, not timestamps,
// so there is no timezone arithmetic to get wrong.
export const DEFAULT_PAY_PERIOD_START_DAY = 16;

// The period containing `date`. Returns real Date objects at local midnight,
// plus ISO strings because most callers compare against `dateToISO(...)`.
//
// The rule is one branch: on or after the start day you're in the period that
// OPENED this month; before it, you're still in the one that opened last month.
export function payPeriodFor(date, startDay = DEFAULT_PAY_PERIOD_START_DAY) {
  const d = Number(startDay) || DEFAULT_PAY_PERIOD_START_DAY;
  const y = date.getFullYear(), m = date.getMonth();
  const openedThisMonth = date.getDate() >= d;
  // Month overflow is handled by Date itself: new Date(2026, 12, 1) is Jan 2027,
  // and new Date(2026, -1, 1) is Dec 2025. No manual year rollover needed.
  const start = new Date(y, openedThisMonth ? m : m - 1, d);
  // End is the day before the NEXT period opens, which is also how a start day
  // of 1 stays correct: the period is then the calendar month.
  const end = new Date(start.getFullYear(), start.getMonth() + 1, d - 1);
  return { start, end, startISO: dateToISO(start), endISO: dateToISO(end) };
}

// Last banking day of a month — the last weekday, stepping back over Saturday
// and Sunday.
//
// NOT holiday-aware, deliberately. Danish public holidays move (Easter) and
// vary by agreement, so a hardcoded list would be wrong somewhere and stale
// eventually. Being out by a day when payday lands on a holiday is a much
// smaller problem than confidently showing the wrong date, and this figure is
// "when you can expect it", not a promise from payroll.
export function lastBankingDayOfMonth(year, monthIdx) {
  const d = new Date(year, monthIdx + 1, 0); // day 0 of next month = last of this
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d;
}

// When a period gets paid: the last banking day of the month the period ENDS in.
// 16 Jun–15 Jul is paid at the end of July, so it is that month, not the one
// after — the off-by-one worth being explicit about.
export function payDateFor(period) {
  return lastBankingDayOfMonth(period.end.getFullYear(), period.end.getMonth());
}

// Step a period back or forward, so the UI can offer "last pay period" without
// re-deriving it from a date. Anchored on the start date, which is always a
// real day of the month, rather than the end (which can be the 28th–31st).
export function shiftPayPeriod(period, delta, startDay = DEFAULT_PAY_PERIOD_START_DAY) {
  const s = period.start;
  return payPeriodFor(new Date(s.getFullYear(), s.getMonth() + delta, s.getDate()), startDay);
}

// The other ranges the income card offers. Kept here beside pay periods so
// every "what does this interval mean" answer lives in one file.
export function calendarMonthRange(year, monthIdx) {
  const start = new Date(year, monthIdx, 1);
  const end = new Date(year, monthIdx + 1, 0);
  return { start, end, startISO: dateToISO(start), endISO: dateToISO(end) };
}

export function rangeFromWeekDates(weekDates) {
  const start = weekDates[0], end = weekDates[6];
  return { start, end, startISO: dateToISO(start), endISO: dateToISO(end) };
}

// Is an ISO date inside a range? Inclusive at both ends — a period runs from
// the 16th up to AND INCLUDING the 15th.
export function isInRange(iso, range) {
  return !!range && iso >= range.startISO && iso <= range.endISO;
}
