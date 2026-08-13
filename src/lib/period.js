// What the ‹ › arrows step, and where a month step lands.
//
// Pulled out of PeriodNav so the three-way branch is testable. It was written
// twice — Dashboard and EmployeeView — and a change to it had to be made in
// both files or the manager's schedule and the staff schedule would disagree
// about what "previous" means for the same restaurant in the same week.

// Month view steps months. Week view steps weeks — UNLESS a single day is
// isolated, in which case it steps days: the arrows should move whatever you
// are actually looking at, and when one day fills the screen that is the day.
export function periodUnit(calMode, dayFilter){
  if (calMode === 'month') return 'month';
  if (calMode === 'week' && dayFilter) return 'day';
  return 'week';
}

// Month arithmetic on a {y,m} pair, wrapping the year. `m` is 0-based, as in
// the Date it comes from — the wrap is the only part anyone gets wrong.
export function stepMonth({ y, m }, dir){
  const n = m + dir;
  if (n < 0)   return { y: y - 1, m: 11 };
  if (n > 11)  return { y: y + 1, m: 0 };
  return { y, m: n };
}
