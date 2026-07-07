import { DAYS } from './constants';
import { toMin, dateToISO } from './dates';

export function blockHours(b){ const s=toMin(b.start); let e=toMin(b.end); if(e<=s) e+=1440; return (e-s)/60; }
export function assignHours(b,a){ const s=toMin((a&&a.start)||b.start); let e=toMin((a&&a.end)||b.end); if(e<=s) e+=1440; return (e-s)/60; }
export const prio=e=>e.priority??e.salaryPct??100;
export function coversBlock(av,b){ if(!av) return false; const es=toMin(av.from); let ee=toMin(av.to); if(ee<=es) ee+=1440; const bs=toMin(b.start); let be=toMin(b.end); if(be<=bs) be+=1440; return es<=bs&&ee>=be; }
export function getBlockRoles(b,day){ return (b.overrides&&b.overrides[day])?b.overrides[day]:b.roles; }
export function isOnTimeOff(empId,date,list){ const iso=dateToISO(date); return list.some(t=>t.empId===empId&&t.status==='Approved'&&t.startDate<=iso&&t.endDate>=iso); }
export function buildSchedule(employees,blocks,weekDates,timeOffList,allRoles){
  const hw={},wd={}; employees.forEach(e=>{ hw[e.id]=0; wd[e.id]=new Set(); });
  const byRole=role=>[...employees].filter(e=>(e.roles||[]).includes(role)).sort((a,b)=>prio(a)-prio(b));
  const isManager=e=>(e.roles||[]).includes('Manager');
  const result={},noMgr=[];

  DAYS.forEach((day,di)=>{
    const date=weekDates[di]; result[day]={};

    blocks.forEach(b=>{
      const bh=blockHours(b),rr=getBlockRoles(b,day),assigned=[],assignedInBlock=new Set();
      allRoles.forEach(role=>{ const need=rr[role]||0; if(!need) return;
        const pool=byRole(role).filter(e=>coversBlock(e.availability[day],b)&&!isOnTimeOff(e.id,date,timeOffList)&&hw[e.id]+bh<=e.maxHours&&!assignedInBlock.has(e.id));
        for(let i=0;i<need;i++){ if(pool[i]){ assigned.push({empId:pool[i].id,name:pool[i].name,role}); assignedInBlock.add(pool[i].id); } }
      });
      const hasMgr=assigned.some(a=>isManager(employees.find(e=>e.id===a.empId)));
      if(!hasMgr&&assigned.length>0){
        const mgr=byRole('Manager').find(e=>coversBlock(e.availability[day],b)&&!isOnTimeOff(e.id,date,timeOffList)&&hw[e.id]+bh<=e.maxHours&&!assignedInBlock.has(e.id));
        if(mgr){ assigned.push({empId:mgr.id,name:mgr.name,role:'Manager'}); assignedInBlock.add(mgr.id); }
      }
      const seen=new Set(); assigned.forEach(a=>{ if(!seen.has(a.empId)){ hw[a.empId]+=bh; wd[a.empId].add(di); seen.add(a.empId); } });
      result[day][b.id]=assigned;
    });

    blocks.forEach(b=>{
      const bh=blockHours(b);
      const assigned=result[day][b.id];
      const hasMgr=assigned.some(a=>isManager(employees.find(e=>e.id===a.empId)));
      if(hasMgr||assigned.length===0) return;

      const hiddenMgr=assigned.find(a=>isManager(employees.find(e=>e.id===a.empId)));
      if(hiddenMgr){ hiddenMgr.role='Manager'; return; }

      let fixed=false;
      blocks.forEach(otherB=>{
        if(fixed||otherB.id===b.id) return;
        const otherAssigned=result[day][otherB.id]||[];
        const mgrEntry=otherAssigned.find(a=>isManager(employees.find(e=>e.id===a.empId)));
        if(!mgrEntry) return;
        const mgrEmp=employees.find(e=>e.id===mgrEntry.empId);
        if(!mgrEmp||!coversBlock(mgrEmp.availability[day],b)) return;
        if(hw[mgrEmp.id]+bh>mgrEmp.maxHours) return; // still respect hours cap
        hw[mgrEmp.id]+=bh;
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
