// Date utilities shared across the app.

export let LOCALE = 'en-GB';
export function setLocale(l){ LOCALE = l; }

export function startOfToday(){
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