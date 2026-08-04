// Date utilities shared across the app.

export let LOCALE = 'en-GB';
export function setLocale(l){ LOCALE = l; }

// Not exported: used only by getWeekDates/todayISO below. It was exported
// for no caller.
function startOfToday(){
  const d = new Date(); d.setHours(0,0,0,0); return d;
}

export function getMondayDate(off=0){
  const n=startOfToday(), dy=n.getDay(), m=new Date(n);
  m.setDate(n.getDate() - dy + (dy===0 ? -6 : 1) + off*7);
  m.setHours(0,0,0,0);
  return m;
}

export function getWeekDates(off=0){
  const m=getMondayDate(off);
  return ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((_,i)=>{
    const d=new Date(m); d.setDate(m.getDate()+i); return d;
  });
}

// Inverse-ish of getMondayDate — given any date, returns the weekOffset
// (relative to the current real-world week) whose Monday-to-Sunday range
// contains it. Used by the week-picker popover: the user clicks a day on a
// calendar grid and we need to know which week that lands in.
export function weekOffsetFromDate(date){
  const dow=date.getDay();
  const monday=new Date(date); monday.setDate(date.getDate()-(dow===0?6:dow-1));
  monday.setHours(0,0,0,0);
  const baseMonday=getMondayDate(0);
  return Math.round((monday-baseMonday)/(7*24*3600*1000));
}

// Step the isolated-day view forward/back by `delta` days, returning where it
// lands: which week offset, and which weekday.
//
// Both the manager's and the employee's schedule had their own copy of this.
// The manager's inlined its own version of weekOffsetFromDate, omitting the
// setHours(0,0,0,0) normalisation. I assumed that was a latent bug and wrote a
// DST test for it — then mutation-tested by deleting the guard, and every test
// still passed. It turns out the guard cannot change the answer: the worst
// combined drift (a full day of time-of-day plus an hour of DST) is 0.15 of a
// week, and Math.round needs 0.5 to flip. So the two implementations were
// always equivalent; this is deduplication, not a bug fix. The guard stays
// because it costs nothing and makes the intent obvious.
//
// `days` is passed in rather than imported to keep this module free of
// constants.js (which imports from here).
export function stepDay(current, delta, days){
  const nd = new Date(current);
  nd.setDate(current.getDate() + delta);
  const dow = nd.getDay();
  return { weekOffset: weekOffsetFromDate(nd), day: days[dow === 0 ? 6 : dow - 1] };
}

export function weekKey(off){
  const m=getMondayDate(off);
  return `${m.getFullYear()}-${String(m.getMonth()+1).padStart(2,'0')}-${String(m.getDate()).padStart(2,'0')}`;
}

// Inverse of weekKey() — turns a "YYYY-MM-DD" (Monday) key back into a Date,
// for anything that only stores the string (e.g. shift_swaps.week_key) but
// needs a real date to check time-off against or to display.
export function weekKeyToMonday(key){
  const [y,m,d]=key.split('-').map(Number);
  return new Date(y,m-1,d);
}

export function dateToISO(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function fmt(d){
  return d.toLocaleDateString(LOCALE, {day:'2-digit', month:'short'});
}

export function fmtLong(iso){
  const [y,m,d] = iso.split('-');
  return new Date(y, m-1, d).toLocaleDateString(LOCALE, {day:'numeric', month:'long', year:'numeric'});
}

export function toMin(t){
  const [h,m] = t.split(':').map(Number); return h*60+m;
}

export function getMonthOffsets(ym){
  // ym can be {y,m} object or a weekOffset number (legacy)
  const ref = typeof ym==='object' ? new Date(ym.y, ym.m, 15) : getMondayDate(ym);
  const fom = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const fd  = fom.getDay();
  const fm  = new Date(fom);
  fm.setDate(fom.getDate() - (fd===0 ? 6 : fd-1));
  const offsets = [];
  for(let i=0; i<6; i++){
    const d  = new Date(fm); d.setDate(fm.getDate()+i*7);
    const we = new Date(d);  we.setDate(d.getDate()+6);
    if(d.getMonth()===ref.getMonth() || we.getMonth()===ref.getMonth()){
      const base = getMondayDate(0);
      offsets.push(Math.round((d-base)/(7*24*3600*1000)));
    }
  }
  return offsets;
}

export function todayISO(){
  return dateToISO(startOfToday());
}