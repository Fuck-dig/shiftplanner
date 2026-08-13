import { T, DAYS } from '../lib/constants';
import { LOCALE, fmt } from '../lib/dates';
import { WeekPicker } from './ui';
import { periodUnit, stepMonth } from '../lib/period';

// The ‹ date ›  [Today] control at the top of every schedule.
//
// This existed twice — once in Dashboard for the manager, once in EmployeeView
// for staff — as ~25 lines of identical branching each. Identical in behaviour
// and different in appearance: the manager's was 13px with 10px padding and a
// 150px label, the staff one 14px with 12px padding and a 130/160px label. Two
// visual treatments of one control, which nobody chose; they drifted.
//
// Worth extracting rather than tolerating because of what the branching is.
// Every one of these buttons means three different things depending on
// calMode, and "isolated day" is a fourth state layered on top of week:
//
//   month           → step a month, label the month
//   week + dayFilter → step a DAY, label that day
//   week            → step a week, label the range
//
// A change to that logic had to be made in two files or the two schedules
// would disagree about what "previous" means — for the same restaurant, in the
// same week. Now there is one definition.
//
// The parent keeps its own sticky wrapper and ref; this is only the two
// controls, returned as a fragment so it drops into either bar unchanged.
export default function PeriodNav({
  calMode, dayFilter, weekDates, displayMonth,
  setDisplayMonth, setWeekOffset, setDayFilter, setCalMode,
  shiftDay, weekOffsetFromDate, isMobile, t,
}){
  const monthDate = new Date(displayMonth.y, displayMonth.m, 1);
  const isDay = calMode === 'week' && dayFilter;
  const dayIndex = dayFilter ? DAYS.indexOf(dayFilter) : 0;

  const step = (dir) => {
    const unit = periodUnit(calMode, dayFilter);
    if (unit === 'month') setDisplayMonth(p => stepMonth(p, dir));
    else if (unit === 'day') shiftDay(dir);
    else setWeekOffset(w => w + dir);
  };

  const label = calMode === 'month'
    ? monthDate.toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' })
    : isDay
      ? `${t('day.' + dayFilter)} ${fmt(weekDates[dayIndex])}`
      : `${fmt(weekDates[0])} – ${fmt(weekDates[6])}`;

  const arrow = { padding:'4px 12px', borderRadius:6, background:'none', border:'none',
                  cursor:'pointer', color:T.text2, fontFamily:'inherit', fontSize:13 };

  return (<>
    <div style={{display:'flex',alignItems:'center',gap:4,background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:3}}>
      <button onClick={()=>step(-1)} style={arrow}>‹</button>
      <WeekPicker
        value={calMode==='month'?monthDate:weekDates[0]}
        highlightStart={calMode==='month'?null:(isDay?weekDates[dayIndex]:weekDates[0])}
        highlightEnd={calMode==='month'?null:(isDay?weekDates[dayIndex]:weekDates[6])}
        onPick={d=>{
          if(calMode==='month'){ setDisplayMonth({y:d.getFullYear(),m:d.getMonth()}); return; }
          setWeekOffset(weekOffsetFromDate(d));
          // Picking a date while a single day is isolated should move to THAT
          // day, not merely to its week.
          if(isDay){ const dow=d.getDay(); setDayFilter(DAYS[dow===0?6:dow-1]); }
        }}
        trigger={<span style={{fontSize:13,fontWeight:500,minWidth:isMobile?130:150,textAlign:'center',color:T.text,padding:'0 4px',display:'inline-block'}}>{label}</span>}
      />
      <button onClick={()=>step(1)} style={arrow}>›</button>
    </div>
    {/* Today lands you on today ITSELF, not merely today's week — it switches
        to Week isolated to the current day. Month is the exception: there
        "today" sensibly means the current month, and yanking someone out of a
        month overview into a single day is a bigger jump than they asked for. */}
    <button onClick={()=>{
      const n=new Date();
      setWeekOffset(0);
      setDisplayMonth({y:n.getFullYear(),m:n.getMonth()});
      if(calMode!=='month'){
        const jsDay=n.getDay();
        setCalMode('week');
        setDayFilter(DAYS[jsDay===0?6:jsDay-1]);
      }
    }} style={{padding:'5px 12px',borderRadius:8,background:T.surface,border:`1px solid ${T.border}`,cursor:'pointer',fontSize:12,color:T.text2,fontFamily:'inherit'}}>{t('common.today')}</button>
  </>);
}
