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

// The shared walk: every shift one person has inside a date range, summed.
//
// Extracted on 13 Aug because the manager's Costs tab and the staff pay card
// disagreed by 67.5 hours for the same person in the same month. Costs used
// getMonthOffsets, which returns six whole WEEKS — for August 2026 that is
// 27 July to 6 September, 42 days, labelled "August 2026". The pay card used
// the calendar month. Both were internally consistent and they described
// different things.
//
// Now there is one definition of "this person, these dates", and both callers
// use it. They can't drift apart again without someone deliberately writing a
// second walk.
export function collectShiftsInRange({ schedules, blocks, empId, range, todayISO }) {
  const out = { hours: 0, sickHours: 0, upcomingHours: 0, corrected: 0, shifts: [] };
  if (!empId || !range || !schedules) return out;
  const blockById = new Map((blocks || []).map(b => [b.id, b]));

  // Walk every loaded week rather than computing which weeks a range touches.
  // The app already holds them all in memory, so the cost is trivial, and there
  // is no off-by-one week to get wrong at the boundaries — which is precisely
  // the class of bug this function exists to end.
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
          if (a.empId !== empId) continue;
          const worked = actualAssignmentHours(a, block);
          const sick = sickHoursFor(a, block);
          out.hours += worked;
          out.sickHours += sick;
          if (a.noShow || a.sick || a.actualStart || a.actualEnd) out.corrected++;
          // "Upcoming" means the day hasn't arrived, not that nothing was
          // recorded — a shift today that someone is midway through is neither
          // finished nor an estimate of a future one.
          if (todayISO && iso > todayISO) out.upcomingHours += worked;
          out.shifts.push({
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
  out.shifts.sort((x, y) => x.iso.localeCompare(y.iso) || x.start.localeCompare(y.start));
  return out;
}

export function earningsInRange({ schedules, blocks, emp, range, orgSickPct, todayISO }) {
  const empty = { hours: 0, sickHours: 0, pay: 0, sickPay: 0, shifts: [], upcomingHours: 0, hasRate: false };
  if (!emp || !range || !schedules) return empty;

  const rate = effectiveHourlyRate(emp);
  const sickPct = effectiveSickPct(emp, orgSickPct);
  const walk = collectShiftsInRange({ schedules, blocks, empId: emp.id, range, todayISO });

  // Per-shift money, so the rows always add up to the total above them — a
  // breakdown that doesn't reconcile is worse than no breakdown.
  const shifts = walk.shifts.map(sh => ({
    ...sh,
    pay: rate == null ? 0
       : sh.sick ? calcSickCost(emp, sh.sickHours, sickPct)
       : parseFloat((sh.hours * rate).toFixed(2)),
  }));

  // No wage set: report the hours honestly and no money at all, rather than
  // inventing a figure from the manager's "cost index" fallback. An employee
  // being shown a number that isn't their pay is worse than being shown none.
  const pay = rate == null ? 0 : parseFloat((walk.hours * rate).toFixed(2));
  const sickPay = rate == null ? 0 : calcSickCost(emp, walk.sickHours, sickPct);

  return {
    hours: parseFloat(walk.hours.toFixed(2)),
    sickHours: parseFloat(walk.sickHours.toFixed(2)),
    upcomingHours: parseFloat(walk.upcomingHours.toFixed(2)),
    pay, sickPay,
    total: parseFloat((pay + sickPay).toFixed(2)),
    shifts,
    hasRate: rate != null,
  };
}
