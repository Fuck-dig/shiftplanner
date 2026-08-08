import { DAYS } from './constants';
import { toMin, dateToISO } from './dates';

export function blockHours(b){ const s=toMin(b.start); let e=toMin(b.end); if(e<=s) e+=1440; return (e-s)/60; }
// An assignment's actual hours, which may have its own custom start/end that
// differ from the block's nominal window (falls back to the block's when
// unset). Was previously redefined identically in both App.jsx and
// EmployeeView.jsx — consolidated here so there's one definition to change.
export function assignmentHours(a,b){ return blockHours({start:a.start||b.start,end:a.end||b.end}); }

// Converts an assignment's actual/scheduled times into a single minute-space
// {startMin, endMin, hasActual, ongoing} range. This is the ONE place that
// knows how to turn actualStart/actualEnd into real minutes, including the
// two edge cases that are easy to get wrong: an overnight shift wrapping
// past midnight, and a same-minute clock in/out (which means ~0 minutes
// worked, not a wrap to a full 24h day — the same values blockHours would
// otherwise read as "a round-the-clock block"). actualAssignmentHours below
// uses it, and so do the Gantt bars in WeekView.jsx/EmployeeView.jsx, which
// need the same start/end in minutes to position and size a bar — before
// this helper existed, both Gantt views had their own hand-copied version of
// this exact logic, which is exactly the kind of thing that quietly drifts.
//
// - hasActual is false when nothing's been recorded yet (a future/untouched
//   shift, or a no-show) — startMin/endMin still describe the scheduled
//   window in that case, so a caller that just wants "the current
//   best-known span" can ignore hasActual entirely.
// - ongoing is true only once actualStart is recorded but actualEnd isn't
//   (currently clocked in) — endMin in that case is a placeholder (the
//   scheduled end, wrapped as needed), not a real recorded time.
export function actualTimeRange(a,b){
  const schedStart=toMin(a.start||b.start);
  let schedEnd=toMin(a.end||b.end); if(schedEnd<=schedStart) schedEnd+=1440;
  if(a.noShow || (!a.actualStart && !a.actualEnd)) return { startMin:schedStart, endMin:schedEnd, hasActual:false, ongoing:false };
  const startMin=a.actualStart?toMin(a.actualStart):schedStart;
  if(!a.actualEnd) return { startMin, endMin:schedEnd, hasActual:true, ongoing:true };
  if(a.actualStart && a.actualStart===a.actualEnd) return { startMin, endMin:startMin, hasActual:true, ongoing:false };
  let endMin=toMin(a.actualEnd); if(endMin<=startMin) endMin+=1440;
  return { startMin, endMin, hasActual:true, ongoing:false };
}

// What actually happened for an assignment, as opposed to what was planned
// (assignmentHours above). Falls back to the scheduled hours whenever
// nothing's been recorded yet — which is always true for a shift that
// hasn't happened yet, so this is safe to use anywhere "hours worked" is
// meant, not just for past shifts. `actualStart`/`actualEnd` are a further
// override on top of the assignment's own start/end (itself already an
// override of the block's nominal time) — set only when someone corrects a
// shift after the fact, e.g. left early or stayed late, or the punch
// clock/kiosk records it live. `noShow` short-circuits to 0 regardless of
// any recorded times.
export function actualAssignmentHours(a,b){
  // `sick` behaves like `noShow` HERE and only here: nobody worked those
  // hours, so anything counting hours worked — the "32h of 40" figure, the
  // over-max warning, coverage — must not see them. What makes sick different
  // from a no-show is that you still PAY for it, at whatever rate applies; that
  // lives in sickHoursFor/calcSickCost below rather than being smuggled into
  // the hours total, so hours keeps meaning one thing.
  if(a.noShow||a.sick) return 0;
  const { startMin, endMin } = actualTimeRange(a,b);
  return (endMin-startMin)/60;
}

// Hours someone is being PAID for but did not work, because the shift was
// marked sick. Deliberately the SCHEDULED length, not any actual/clocked
// range: a sick shift has no clocked times, and what you owe is based on the
// shift they were rostered for.
export function sickHoursFor(a,b){
  if(!a?.sick) return 0;
  return assignmentHours(a,b);
}

// A sick shift is still an unfilled slot. Coverage counts what will actually
// be staffed, so a shift nobody is turning up for must read as a gap — that's
// the operationally useful half of marking someone sick, and it is separate
// from the money.
export function coversSlot(a){ return !!a && !a.sick; }

// The percentage of normal pay a sick shift costs. Per-employee value wins
// when set; otherwise the org default. Deliberately NOT defaulted to 100 here
// — an org that has never configured this should get 0 and see no phantom
// cost, rather than have the app quietly invent a liability. The org default
// is what carries the 100, and it is set explicitly.
export function effectiveSickPct(emp, orgDefault){
  const own = emp?.sickPayPct;
  if(own!=null && own!=='' && !Number.isNaN(Number(own))) return Number(own);
  const org = Number(orgDefault);
  return Number.isFinite(org) ? org : 0;
}

// What a run of sick hours costs. Uses the same effectiveHourlyRate as normal
// pay so salaried and hourly staff are handled identically, and falls back to
// the priority heuristic when no wage is set, exactly like calcWageCost — so
// the two modes of the Costs tab stay internally consistent.
export function calcSickCost(emp, sickHrs, pct){
  if(!sickHrs) return 0;
  const share = (Number(pct)||0)/100;
  if(share<=0) return 0;
  const rate = effectiveHourlyRate(emp);
  if(rate==null) return parseFloat((sickHrs*(emp?.priority||100)/100*share).toFixed(2));
  return parseFloat((sickHrs*rate*share).toFixed(2));
}
const prio=e=>e.priority??e.salaryPct??100;

// Deleting an employee never used to cascade into the schedule — their old
// assignments stayed behind in every week, still pointing at an id that no
// longer exists anywhere in the roster. That orphaned assignment then showed
// up inconsistently depending on which view rendered it: the Team grid only
// matches assignments against the CURRENT employee list, so it silently
// disappeared there ("0 scheduled" even on a day with real shifts), while
// the Week grid falls back to the assignment's own frozen name and kept
// showing it — with a generic default color, since the per-person color
// also comes from looking up the (now-missing) employee record. This strips
// any assignment whose empId isn't in validEmpIds out of every week/day/
// block, so every view agrees again. Used both right after a delete (so it
// takes effect immediately) and once on load (to clean up anything a delete
// from before this existed already left behind).
// The pure core of drag-and-drop reassignment, kept out of App.jsx so it can
// actually be tested — getting this wrong duplicates or silently drops
// somebody's shift, which is the kind of bug you find out about when a person
// doesn't turn up.
//
//   src = {day, blockId, idx}
//   dst = {day, blockId, role}        -> move into that role's slot
//   dst = {day, blockId, role, idx}   -> swap with whoever is already there
//
// Returns a NEW schedule object, or null when the drop is a no-op or refers
// to something that isn't there (dropped on itself, stale index after a
// concurrent edit, unknown day/block). Callers should treat null as "do
// nothing" rather than as an error.
//
// Convention, matching the pre-existing click-to-move behaviour: whoever
// lands in a slot takes on THAT slot's role. So dropping a waiter onto a
// manager slot makes them the manager there, and in a swap the two people
// exchange roles along with positions.
export function applyAssignmentDrop(schedule, src, dst) {
  if (!schedule || !src || !dst) return null;
  if (src.day === dst.day && src.blockId === dst.blockId && src.idx === dst.idx) return null;
  const ns = JSON.parse(JSON.stringify(schedule));
  const srcList = ns[src.day]?.[src.blockId];
  const srcEntry = srcList?.[src.idx];
  if (!srcEntry) return null;
  if (dst.idx != null) {
    const dstList = ns[dst.day]?.[dst.blockId];
    const dstEntry = dstList?.[dst.idx];
    if (!dstEntry) return null;
    srcList[src.idx] = { ...dstEntry, role: srcEntry.role };
    dstList[dst.idx] = { ...srcEntry, role: dstEntry.role };
  } else {
    if (!ns[dst.day]) return null;
    // Nobody can hold the same block twice. Without this, dragging someone
    // onto empty space in a block they're ALREADY in appends a second copy —
    // and once that happens the UI can't tell the two apart (it maps a card
    // back to its assignment by employee id, so both rows resolve to the
    // first one, and editing or dragging either silently acts on the other).
    // Treated as a no-op rather than an error: the drop simply isn't a
    // meaningful move.
    const already = (ns[dst.day][dst.blockId] || [])
      .some((a, i) => a.empId === srcEntry.empId && !(dst.day === src.day && dst.blockId === src.blockId && i === src.idx));
    if (already) return null;
    const moved = srcList.splice(src.idx, 1)[0];
    ns[dst.day][dst.blockId] = [...(ns[dst.day][dst.blockId] || []), { ...moved, role: dst.role }];
  }
  return ns;
}

export function pruneOrphanedAssignments(schedulesByWeek, validEmpIds) {
  const valid = validEmpIds instanceof Set ? validEmpIds : new Set(validEmpIds);
  let removed = 0;
  const cleaned = {};
  for (const [wk, entry] of Object.entries(schedulesByWeek || {})) {
    if (!entry?.schedule) { cleaned[wk] = entry; continue; }
    const newSchedule = {};
    for (const [day, byBlock] of Object.entries(entry.schedule)) {
      const newByBlock = {};
      for (const [blockId, assignments] of Object.entries(byBlock || {})) {
        const kept = (assignments || []).filter(a => valid.has(a.empId));
        removed += (assignments || []).length - kept.length;
        newByBlock[blockId] = kept;
      }
      newSchedule[day] = newByBlock;
    }
    cleaned[wk] = { ...entry, schedule: newSchedule };
  }
  return { schedules: cleaned, removed };
}

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
// Everyone still on the team.
//
// Archiving is deliberately NOT deletion: an archived person stays in the
// `employees` array because historical assignments reference them by id, so
// every name lookup, every past week's cost, and pruneOrphanedAssignments all
// need them present. The rule is therefore a split, not a removal:
//
//   activeOnly(employees) -> anything FORWARD-looking (rosters, pickers,
//                            directories, headcounts, who-can-I-give-a-shift-to)
//   employees             -> anything HISTORICAL (name/colour lookups by id)
//
// This lives here, named once, because the same filter had been written
// inline in six places under three different names — and was simply absent
// from the staff and kiosk views, so staff kept seeing colleagues the
// manager had already archived.
// How many people are actually working a given day, for the column tallies
// under the grids.
//
// Counting distinct empIds straight out of the schedule — which is what these
// tallies used to do — counts anyone still holding an assignment, including
// people who have been archived and whose ROW is hidden. The result was a
// footer saying "10 working" above nine visible rows: not merely wrong, but
// wrong in a way that contradicts what's on screen right next to it.
export function workingCount(schedule, blocks, day, employees){
  const active = new Set(activeOnly(employees).map(e=>e.id));
  const ids = new Set();
  for (const b of (blocks||[])) {
    for (const a of (schedule?.[day]?.[b.id] || [])) {
      if (active.has(a.empId)) ids.add(a.empId);
    }
  }
  return ids.size;
}

// How many people on the roster have at least one shift anywhere in the week,
// and how many are on the roster at all — the "{n} of {total} scheduled"
// counter above the Team grid.
//
// Both halves must ignore archived people. `total` counting them was the more
// visible half: archiving someone left the denominator unchanged, so the
// counter claimed a headcount that no longer matched the rows beneath it.
export function scheduledCount(schedule, employees){
  const active = activeOnly(employees);
  const ids = new Set();
  for (const day of Object.values(schedule || {})) {
    for (const list of Object.values(day || {})) {
      for (const a of (list || [])) ids.add(a.empId);
    }
  }
  return { n: active.filter(e => ids.has(e.id)).length, total: active.length };
}

// Who gets a ROW in a person-per-row grid for one particular week.
//
// activeOnly() is right for pickers and headcounts — you can't roster someone
// who has left. But a grid is also a record of what HAPPENED, and filtering
// archived people out of it created two separate problems:
//
//   * Scroll back to a finished week and the person who worked it has no row,
//     even though their shift is sitting there in the data. Week view (grouped
//     by role) still showed them, so the two grids disagreed about history.
//   * Worse: archiving someone while they still hold an UPCOMING shift left
//     that shift completely invisible in the view a manager actually uses.
//     Seen live on 4 Aug — Lars Lang in Former Staff, still on Sat 8 Aug, and
//     no row anywhere to notice or remove it from.
//
// So: everyone still on the team, PLUS anyone archived who actually has an
// assignment in THIS week. Archived people don't clutter weeks they had
// nothing to do with, and a shift can never hide behind an archived person.
export function rosterForWeek(employees, schedule){
  const assigned = new Set();
  for (const day of Object.values(schedule || {})) {
    for (const list of Object.values(day || {})) {
      for (const a of (list || [])) assigned.add(a.empId);
    }
  }
  return (employees || []).filter(e => !e.archived || assigned.has(e.id));
}

export function activeOnly(employees){ return (employees||[]).filter(e=>!e.archived); }

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

// A single block's [start,end) as absolute minutes since the start of the
// week (dayIndex*1440 + local minutes, overnight blocks rolling past
// midnight the same way blockHours already does). Deliberately uses the
// block's own nominal start/end, not any assignment's actual/custom
// override — these manual-editing warnings are about the SCHEDULE you're
// building, not clocked time, matching the auto-scheduler's own timeline
// checks below.
function blockAbsRange(dayIndex,block){
  const bs=toMin(block.start); let be=toMin(block.end); if(be<=bs) be+=1440;
  const dayAbs=dayIndex*1440;
  return { start: dayAbs+bs, end: dayAbs+be };
}

// True if placing `empId` into (day,blockId) would overlap, or leave less
// than MIN_REST_MINUTES around, any of their OTHER already-scheduled blocks
// that week. This is the same check buildSchedule's own conflictsWithRest
// enforces automatically for auto-generated schedules — exported here so
// manual edits (the picker, the edit-shift modal) can surface it as a soft
// warning instead of a hard block. Only checks within the visible week
// (like buildSchedule), so a Sunday-night shift's rest against next
// Monday's isn't caught — a known, pre-existing scope limit.
//
// `override` (optional {start,end}) lets a caller check a CUSTOM time for
// the target slot — e.g. the edit-shift modal's free-typed start/end —
// instead of the block's own nominal window, without needing that custom
// time to already be saved into `schedule`.
export function hasRestConflict(empId,day,blockId,schedule,blocks,override){
  if(!schedule) return false;
  const targetBlock=blocks.find(b=>b.id===blockId);
  if(!targetBlock) return false;
  const dayIdx=DAYS.indexOf(day);
  const {start:startAbs,end:endAbs}=blockAbsRange(dayIdx,override||targetBlock);
  return DAYS.some((d,di)=>blocks.some(b=>{
    if(d===day&&b.id===blockId) return false; // don't compare the slot against itself
    const assigned=schedule[d]?.[b.id]||[];
    if(!assigned.some(a=>a.empId===empId)) return false;
    const {start:s,end:e}=blockAbsRange(di,b);
    if(startAbs<e && s<endAbs) return true; // literal overlap
    const gap = startAbs>=e ? startAbs-e : s-endAbs;
    return gap<MIN_REST_MINUTES;
  }));
}

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

      // Removed here: a `assigned.find(isManager)` branch that relabelled a
      // "hidden" manager. It was unreachable — `hasMgr` is `.some()` of the
      // same predicate over the same array, so reaching this line already
      // guarantees `.find()` returns undefined. Dead since it was written.

      // Borrow a manager already working another block today. NOTE: in
      // practice this almost never succeeds, because any other block on the
      // same day is within MIN_REST_MINUTES of this one, so conflictsWithRest
      // rejects it. Kept because it is correct and cheap, but it is not the
      // safety net it looks like — see the noMgr list, which is what actually
      // tells you a block went unsupervised.
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

// Strip someone's UPCOMING assignments (on or after `fromISO`) while leaving
// everything earlier untouched. Used when archiving a departed employee: the
// point of archiving is that their history survives, but leaving them rostered
// for next week isn't "kept history", it's a gap someone discovers on the day.
//
// Returns a NEW schedules map plus a count, or null if nothing changed — so a
// caller can skip a pointless write and skip prompting when there's nothing to
// remove.
export function removeUpcomingAssignments(schedulesByWeek, empId, fromISO, weekKeyToMondayFn, days) {
  let removed = 0;
  const cleared = [];
  const out = {};
  for (const [wk, entry] of Object.entries(schedulesByWeek || {})) {
    if (!entry?.schedule) { out[wk] = entry; continue; }
    let monday;
    try { monday = weekKeyToMondayFn(wk); } catch { out[wk] = entry; continue; }
    const newSchedule = {};
    for (const [day, byBlock] of Object.entries(entry.schedule)) {
      const di = days.indexOf(day);
      const d = new Date(monday); d.setDate(monday.getDate() + (di < 0 ? 0 : di));
      // Compare as YYYY-MM-DD to sidestep timezone drift on the boundary.
      const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const future = iso >= fromISO;
      const newByBlock = {};
      for (const [blockId, list] of Object.entries(byBlock || {})) {
        if (!future) { newByBlock[blockId] = list; continue; }
        const kept = (list || []).filter(a => a.empId !== empId);
        // Record each dropped assignment, not just a tally. A count is enough
        // to write "cleared 3 shifts" in the audit log but useless for doing
        // anything ABOUT those three shifts — which is why archiving used to
        // be quietly irreversible: the information needed to reinstate or
        // re-advertise them was thrown away at the moment of deletion.
        for (const a of (list || [])) {
          if (a.empId === empId) cleared.push({ weekKey: wk, day, blockId, role: a.role });
        }
        removed += (list || []).length - kept.length;
        newByBlock[blockId] = kept;
      }
      newSchedule[day] = newByBlock;
    }
    out[wk] = { ...entry, schedule: newSchedule };
  }
  return removed ? { schedules: out, removed, cleared } : null;
}
