import { DAYS } from './constants';
import { toMin, dateToISO } from './dates';

export function blockHours(b){ const s=toMin(b.start); let e=toMin(b.end); if(e<=s) e+=1440; return (e-s)/60; }
// An assignment's actual hours, which may have its own custom start/end that
// differ from the block's nominal window (falls back to the block's when
// unset). Was previously redefined identically in both App.jsx and
// EmployeeView.jsx — consolidated here so there's one definition to change.
export function assignmentHours(a,b){ return blockHours({start:a.start||b.start,end:a.end||b.end}); }

// What actually happened for an assignment, as opposed to what was planned
// (assignmentHours above). Falls back to the scheduled hours whenever
// nothing's been recorded yet — which is always true for a shift that
// hasn't happened yet, so this is safe to use anywhere "hours worked" is
// meant, not just for past shifts. `actualStart`/`actualEnd` are a further
// override on top of the assignment's own start/end (itself already an
// override of the block's nominal time) — set only when someone corrects a
// shift after the fact, e.g. left early or stayed late. `noShow` short-
// circuits to 0 regardless of any recorded times.
export function actualAssignmentHours(a,b){
  if(a.noShow) return 0;
  // blockHours treats an identical start/end as a full 24h wrap (the right
  // call for a genuinely round-the-clock scheduled block) — but two real
  // clock punches landing in the same minute (clocking in then straight back
  // out, e.g. while testing) mean essentially no time worked, not 24h.
  // Only short-circuit this for real actual punches, not whenever the
  // scheduled start/end themselves happen to match.
  if(a.actualStart && a.actualEnd && a.actualStart===a.actualEnd) return 0;
  return blockHours({start:a.actualStart||a.start||b.start,end:a.actualEnd||a.end||b.end});
}
const prio=e=>e.priority??e.salaryPct??100;

// Average weeks per calendar month — used to normalize a monthly salary into
// an hourly-equivalent rate so it can be compared against hourly wages.
export const WEEKS_PER_MONTH = 4.33;

// A single, correct definition of "cost per hour" for an employee, shared by
// the schedule builder (to pick the cheapest eligible candidate) and the
// Costs view (so what the builder optimizes for matches what's displayed).
// Returns null if no wage is set — callers should fall back to whatever
// non-monetary heuristic they already use (e.g. priority) in that case.
export function effectiveHourlyRate(e){
  const wage=e?.wage||0;
  if(!wage) return null;
  if((e.contractType||'hourly')==='hourly') return wage;
  const weeklyHours=e.maxHours||40;
  const period=e.contractPeriod||'week';
  return period==='month' ? wage/(weeklyHours*WEEKS_PER_MONTH) : wage/weeklyHours;
}

// An employee's preferred weekly hours — a softer target than maxHours. The
// builder tries not to exceed it, but will if that's the only way to cover a
// required slot. Falls back to maxHours (today's behavior) when unset.
function targetHoursOf(e){
  const t=e?.targetHours;
  return (t!=null && t>0) ? t : (e?.maxHours ?? 40);
}
export function coversBlock(av,b){ if(!av) return false; const es=toMin(av.from); let ee=toMin(av.to); if(ee<=es) ee+=1440; const bs=toMin(b.start); let be=toMin(b.end); if(be<=bs) be+=1440; return es<=bs&&ee>=be; }
export function getBlockRoles(b,day){ return (b.overrides&&b.overrides[day])?b.overrides[day]:b.roles; }
// What it costs to schedule an employee for a given number of hours this
// week. Falls back to a priority-based heuristic (same scale schedule
// generation itself uses to rank candidates) when no hourly/monthly wage is
// set, so the Costs view always has *something* comparable to show even for
// orgs that haven't entered pay rates yet. Previously duplicated inline in
// App.jsx — moved here so the Costs view and any future caller (and its
// tests) share one definition instead of two that could drift apart.
export function calcWageCost(e,hours){
  const rate=effectiveHourlyRate(e);
  if(rate==null) return parseFloat((hours*(e.priority||100)/100).toFixed(2));
  return parseFloat((hours*rate).toFixed(2));
}

// An employee's "effective" roles for a given week — their configured
// job roles, PLUS whatever role(s) they're actually scheduled under this
// week. Without the second part, someone whose configured role is e.g.
// Manager but who picked up a one-off Waiter shift (to cover a gap) would
// only ever show up in the Manager group in the Team view, even though the
// day/week grid clearly shows them working as a Waiter that day — confusing
// since the same person's shift is visibly filed under a role they don't
// appear grouped under.
export function effectiveRolesFor(emp,schedule,blocks){
  const roles=new Set(emp.roles||[]);
  if(schedule) DAYS.forEach(day=>blocks.forEach(b=>(schedule[day]?.[b.id]||[]).forEach(a=>{ if(a.empId===emp.id) roles.add(a.role); })));
  return roles;
}
export function isOnTimeOff(empId,date,list){ const iso=dateToISO(date); return list.some(t=>t.empId===empId&&t.status==='Approved'&&t.startDate<=iso&&t.endDate>=iso); }
// Minimum rest between the end of one shift and the start of the next, in
// minutes (11h — the EU Working Time Directive daily-rest minimum). Also
// doubles as the guard against literally double-booking someone into two
// overlapping shifts, which the previous version of this function didn't
// check for at all.
export const MIN_REST_MINUTES = 11*60;

export function buildSchedule(employees,blocks,weekDates,timeOffList,allRoles){
  const hw={},wd={}; employees.forEach(e=>{ hw[e.id]=0; wd[e.id]=new Set(); });
  const isManager=e=>(e?.roles||[]).includes('Manager');

  // Lookup by id instead of a linear employees.find(...) scan on every hit.
  const empById=new Map(employees.map(e=>[e.id,e]));

  // Priority-sorted pool per role, computed once instead of re-filtering and
  // re-sorting the whole employee list for every day x block x role check.
  // (Final selection order is re-ranked by cost at the point of use — this
  // cache just avoids re-scanning the full employee list repeatedly.)
  const byRoleCache=new Map();
  new Set([...allRoles,'Manager']).forEach(role=>{
    byRoleCache.set(role,[...employees].filter(e=>(e.roles||[]).includes(role)).sort((a,b)=>prio(a)-prio(b)));
  });
  const byRole=role=>byRoleCache.get(role)||[];

  // Approved time-off grouped per employee, so checking a single employee's
  // availability on a given day scans a few of their own entries instead of
  // the whole org's time-off list.
  const approvedOffByEmp=new Map();
  timeOffList.forEach(to=>{
    if(to.status!=='Approved') return;
    if(!approvedOffByEmp.has(to.empId)) approvedOffByEmp.set(to.empId,[]);
    approvedOffByEmp.get(to.empId).push(to);
  });
  const isOff=(empId,iso)=>{
    const list=approvedOffByEmp.get(empId);
    return !!list&&list.some(to=>to.startDate<=iso&&to.endDate>=iso);
  };

  // Every employee's assigned shifts this week, as absolute minutes since the
  // start of the week (dayIndex*1440 + local minutes; overnight blocks that
  // roll past midnight get an end > 1440 for that day, same convention as
  // blockHours). Used to reject overlaps and enforce minimum rest.
  const timeline=new Map(employees.map(e=>[e.id,[]]));
  const conflictsWithRest=(empId,startAbs,endAbs)=>{
    const segs=timeline.get(empId);
    if(!segs) return false;
    return segs.some(s=>{
      if(startAbs<s.end && s.start<endAbs) return true; // literal overlap
      const gap = startAbs>=s.end ? startAbs-s.end : s.start-endAbs;
      return gap<MIN_REST_MINUTES;
    });
  };
  const recordAssignment=(empId,startAbs,endAbs)=>{
    const segs=timeline.get(empId); if(segs) segs.push({start:startAbs,end:endAbs});
  };

  // Rank an eligible pool cheapest-first (effectiveHourlyRate ascending,
  // priority as tie-break — including when no wage is set at all, which
  // reproduces the old priority-only behavior). Candidates still under their
  // target hours are preferred over those already at/over target, so the
  // cheapest person doesn't automatically absorb every remaining hour.
  const rankPool=(pool,bh)=>{
    const costOf=e=>{ const r=effectiveHourlyRate(e); return r==null?Infinity:r; };
    const sorted=[...pool].sort((a,b)=>{ const ra=costOf(a),rb=costOf(b); if(ra===rb) return prio(a)-prio(b); return ra-rb; });
    const underTarget=sorted.filter(e=>hw[e.id]+bh<=targetHoursOf(e));
    const overTarget =sorted.filter(e=>hw[e.id]+bh>targetHoursOf(e));
    return [...underTarget,...overTarget];
  };

  const result={},noMgr=[];

  DAYS.forEach((day,di)=>{
    const date=weekDates[di],iso=dateToISO(date); result[day]={};
    const dayAbs=di*1440;

    blocks.forEach(b=>{
      const bh=blockHours(b),rr=getBlockRoles(b,day),assigned=[],assignedInBlock=new Set();
      const bs=toMin(b.start); let be=toMin(b.end); if(be<=bs) be+=1440;
      const startAbs=dayAbs+bs,endAbs=dayAbs+be;
      allRoles.forEach(role=>{ const need=rr[role]||0; if(!need) return;
        const eligible=byRole(role).filter(e=>coversBlock(e.availability[day],b)&&!isOff(e.id,iso)&&hw[e.id]+bh<=e.maxHours&&!assignedInBlock.has(e.id)&&!conflictsWithRest(e.id,startAbs,endAbs));
        const ranked=rankPool(eligible,bh);
        for(let i=0;i<need;i++){ if(ranked[i]){ assigned.push({empId:ranked[i].id,name:ranked[i].name,role}); assignedInBlock.add(ranked[i].id); } }
      });
      const hasMgr=assigned.some(a=>isManager(empById.get(a.empId)));
      if(!hasMgr&&assigned.length>0){
        const mgrPool=byRole('Manager').filter(e=>coversBlock(e.availability[day],b)&&!isOff(e.id,iso)&&hw[e.id]+bh<=e.maxHours&&!assignedInBlock.has(e.id)&&!conflictsWithRest(e.id,startAbs,endAbs));
        const mgr=rankPool(mgrPool,bh)[0];
        if(mgr){ assigned.push({empId:mgr.id,name:mgr.name,role:'Manager'}); assignedInBlock.add(mgr.id); }
      }
      const seen=new Set(); assigned.forEach(a=>{ if(!seen.has(a.empId)){ hw[a.empId]+=bh; wd[a.empId].add(di); recordAssignment(a.empId,startAbs,endAbs); seen.add(a.empId); } });
      result[day][b.id]=assigned;
    });

    blocks.forEach(b=>{
      const bh=blockHours(b);
      const bs=toMin(b.start); let be=toMin(b.end); if(be<=bs) be+=1440;
      const startAbs=dayAbs+bs,endAbs=dayAbs+be;
      const assigned=result[day][b.id];
      const hasMgr=assigned.some(a=>isManager(empById.get(a.empId)));
      if(hasMgr||assigned.length===0) return;

      const hiddenMgr=assigned.find(a=>isManager(empById.get(a.empId)));
      if(hiddenMgr){ hiddenMgr.role='Manager'; return; }

      let fixed=false;
      blocks.forEach(otherB=>{
        if(fixed||otherB.id===b.id) return;
        const otherAssigned=result[day][otherB.id]||[];
        const mgrEntry=otherAssigned.find(a=>isManager(empById.get(a.empId)));
        if(!mgrEntry) return;
        const mgrEmp=empById.get(mgrEntry.empId);
        if(!mgrEmp||!coversBlock(mgrEmp.availability[day],b)) return;
        if(hw[mgrEmp.id]+bh>mgrEmp.maxHours) return; // still respect hours cap
        if(conflictsWithRest(mgrEmp.id,startAbs,endAbs)) return; // don't double-book / break rest
        hw[mgrEmp.id]+=bh;
        recordAssignment(mgrEmp.id,startAbs,endAbs);
        result[day][b.id]=[...assigned,{empId:mgrEmp.id,name:mgrEmp.name,role:'Manager'}];
        fixed=true;
      });
      if(fixed) return;

      noMgr.push({day,block:b.name});
    });
  });

  const total=Object.values(result).flatMap(d=>Object.values(d)).flat().length;
  return { schedule:result, total, noMgr };
}
export function dayCoverage(schedule,blocks,day,allRoles){ if(!schedule||!schedule[day]) return 'empty'; let tot=0,fill=0; blocks.forEach(b=>{ const r=getBlockRoles(b,day); allRoles.forEach(role=>{ tot+=r[role]||0; fill+=Math.min(r[role]||0,(schedule[day][b.id]||[]).filter(a=>a.role===role).length); }); }); if(tot===0) return 'empty'; const p=fill/tot; return p>=1?'full':p>=0.6?'partial':'low'; }
