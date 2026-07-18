// localStorage persistence + employee shape migration. (Backend swap point.)
export const migrateEmployee=e=>({
  ...e,
  roles: e.roles || (e.role ? [e.role] : ['Other']),
  priority:       e.priority       ?? e.salaryPct ?? 100,
  contractType:   e.contractType   || 'hourly',
  contractPeriod: e.contractPeriod || 'week',
  wage:           e.wage           || 0,
  maxHours:       e.maxHours       ?? 40,
  // Soft weekly-hours preference for the schedule builder. Defaults to
  // maxHours (i.e. no different preference) until a manager sets one.
  targetHours:    (e.targetHours!=null && e.targetHours>0) ? e.targetHours : (e.maxHours ?? 40),
});
export const load=(k,fb)=>{
  try{
    const v=localStorage.getItem(k);
    if(!v) return fb;
    const parsed=JSON.parse(v);
    if(k==='sa2_emps'&&Array.isArray(parsed)) return parsed.map(migrateEmployee);
    return parsed;
  }catch{ return fb; }
};
export const save=(k,v)=>{ try{ localStorage.setItem(k,JSON.stringify(v)); }catch{}};
