import { DAYS } from './constants';
import { dateToISO, weekKeyToMonday } from './dates';
import {
  actualAssignmentHours, sickHoursFor, effectiveHourlyRate,
  calcSickCost, effectiveSickPct,
} from './schedule';
import { isInRange } from './payPeriod';

// What one person earns over a date range.
//
// Deliberately the SAME arithmetic the Costs tab runs for the manager, reusing
// the same helpers rather than reimplementing them: actual (clocked or
// corrected) hours falling back to the schedule, a no-show counting zero, sick
// shifts paid at whatever percentage applies to that person, monthly salaries
// converted to an hourly equivalent. If the two ever disagreed, one of them
// would be lying to somebody about money.
//
// It follows reality as it changes, which is what was asked for: punch out
// early and the figure drops, pick up an extra shift and it rises, get marked
// sick and it pays at the sick rate.
//
// Shifts that haven't happened yet are included and counted at their scheduled
// hours — that's what makes this answer "what will I earn this period" rather
// than only "what have I earned so far". `upcoming` is returned separately so
// the UI can say how much of the total is still an estimate.
export function earningsInRange({ schedules, blocks, emp, range, orgSickPct, todayISO }) {
  const empty = { hours: 0, sickHours: 0, pay: 0, sickPay: 0, shifts: [], upcomingHours: 0, hasRate: false };
  if (!emp || !range || !schedules) return empty;

  const rate = effectiveHourlyRate(emp);
  const sickPct = effectiveSickPct(emp, orgSickPct);
  const blockById = new Map((blocks || []).map(b => [b.id, b]));

  let hours = 0, sickHours = 0, upcomingHours = 0;
  const shifts = [];

  // Walk every loaded week rather than trying to compute which weeks a range
  // touches. Ranges here are at most a month or so and the app already holds
  // every week in memory, so the cost is trivial and there is no off-by-one
  // week to get wrong at the boundaries.
  for (const [wk, entry] of Object.entries(schedules)) {
    const sched = entry?.schedule;
    if (!sched) continue;
    const monday = weekKeyToMonday(wk);
    if (Number.isNaN(monday?.getTime?.())) continue;

    DAYS.forEach((day, di) => {
      const date = new Date(monday); date.setDate(monday.getDate() + di);
      const iso = dateToISO(date);
      if (!isInRange(iso, range)) return;

      for (const [blockId, list] of Object.entries(sched[day] || {})) {
        const block = blockById.get(blockId);
        if (!block) continue;
        for (const a of (list || [])) {
          if (a.empId !== emp.id) continue;
          const worked = actualAssignmentHours(a, block);
          const sick = sickHoursFor(a, block);
          hours += worked;
          sickHours += sick;
          // "Upcoming" means the day hasn't arrived, not that nothing was
          // recorded — a shift today that someone is midway through is neither
          // finished nor an estimate of a future one.
          if (todayISO && iso > todayISO) upcomingHours += worked;
          shifts.push({
            iso, day, blockId, blockName: block.name,
            start: a.start || block.start,
            end: a.end || block.end,
            hours: worked, sickHours: sick, role: a.role,
            noShow: !!a.noShow, sick: !!a.sick,
          });
        }
      }
    });
  }

  shifts.sort((x, y) => x.iso.localeCompare(y.iso) || x.start.localeCompare(y.start));

  // No wage set: report the hours honestly and no money at all, rather than
  // inventing a figure from the manager's "cost index" fallback. An employee
  // being shown a number that isn't their pay is worse than being shown none.
  const pay = rate == null ? 0 : parseFloat((hours * rate).toFixed(2));
  const sickPay = rate == null ? 0 : calcSickCost(emp, sickHours, sickPct);

  return {
    hours: parseFloat(hours.toFixed(2)),
    sickHours: parseFloat(sickHours.toFixed(2)),
    upcomingHours: parseFloat(upcomingHours.toFixed(2)),
    pay, sickPay,
    total: parseFloat((pay + sickPay).toFixed(2)),
    shifts,
    hasRate: rate != null,
  };
}
