import { useState, useEffect } from "react";

// ─── Design tokens ────────────────────────────────────────────────────────────
const THEMES = {
  light: {
    bg:"#F5F0E6",surface:"#FFFEFB",surfaceWarm:"#FBF6EE",border:"#E6DDCD",
    text:"#211B15",text2:"#5C5248",text3:"#9C9088",
    accent:"#BF5A2C",accentLight:"#F5EAE2",accentText:"#7A3318",
    success:"#3D7A52",successLight:"#E5F0E9",
    warning:"#956B18",warningLight:"#FBF0D5",
    danger:"#963030",dangerLight:"#F5E2E2",
  },
  dark: {
    bg:"#1A1714",surface:"#221E1A",surfaceWarm:"#2A2520",border:"#3A332B",
    text:"#F2EDE6",text2:"#B8ACA0",text3:"#867A6E",
    accent:"#D97A4A",accentLight:"#3A2A1E",accentText:"#F0A578",
    success:"#5FAE7A",successLight:"#1E2E22",
    warning:"#D4A53E",warningLight:"#2E2718",
    danger:"#D6685E",dangerLight:"#2E1E1C",
  },
};
const T = {
  bg:          '#F7F4EF',
  surface:     '#FFFFFF',
  surfaceWarm: '#FDFAF6',
  border:      '#E8E0D4',
  text:        '#1C1815',
  text2:       '#5C5248',
  text3:       '#9C9088',
  accent:      '#BF5A2C',
  accentLight: '#F5EAE2',
  accentText:  '#7A3318',
  success:     '#3D7A52',
  successLight:'#E5F0E9',
  warning:     '#956B18',
  warningLight:'#FBF0D5',
  danger:      '#963030',
  dangerLight: '#F5E2E2',
};

// ─── Role system ──────────────────────────────────────────────────────────────
const ROLE_COLOR_PALETTE = [
  { dot:'#534AB7', bg:'#F0EFFE', text:'#4039A0', border:'#C8C4F8' },
  { dot:'#1A6FA8', bg:'#EAF3FB', text:'#165C8C', border:'#A8D4F0' },
  { dot:'#2D7A4F', bg:'#E8F5EE', text:'#236040', border:'#9FD8B8' },
  { dot:'#8A5A10', bg:'#FBF3E5', text:'#6E4809', border:'#F0CC84' },
  { dot:'#5C5A58', bg:'#F2F1EF', text:'#4A4844', border:'#C8C4BE' },
  { dot:'#B03868', bg:'#FBE8F0', text:'#7A2848', border:'#F0B8D0' },
  { dot:'#BF5A2C', bg:'#F5EAE2', text:'#7A3318', border:'#E8C0A0' },
  { dot:'#2D7A80', bg:'#E5F5F5', text:'#1A5C60', border:'#90D8D8' },
  { dot:'#6B3A9E', bg:'#F3EBF9', text:'#52288A', border:'#D4B8F0' },
  { dot:'#3A7A3A', bg:'#EBF5EB', text:'#286028', border:'#B0D8B0' },
];
const DEFAULT_ROLE_STYLES = {
  Manager:   { dot:'#534AB7', bg:'#F0EFFE', text:'#4039A0', border:'#C8C4F8' },
  Bartender: { dot:'#1A6FA8', bg:'#EAF3FB', text:'#165C8C', border:'#A8D4F0' },
  Waiter:    { dot:'#2D7A4F', bg:'#E8F5EE', text:'#236040', border:'#9FD8B8' },
  Kitchen:   { dot:'#8A5A10', bg:'#FBF3E5', text:'#6E4809', border:'#F0CC84' },
  Other:     { dot:'#5C5A58', bg:'#F2F1EF', text:'#4A4844', border:'#C8C4BE' },
};
// ROLE_STYLES and ALL_ROLES are now dynamic — read from state in App

// ─── Employee colour system ───────────────────────────────────────────────────
const EMP_PALETTE = [
  { bg:'#EAF3FB', text:'#165C8C', dot:'#1A6FA8' },
  { bg:'#E8F5EE', text:'#236040', dot:'#2D7A4F' },
  { bg:'#F5EAE2', text:'#7A3318', dot:'#BF5A2C' },
  { bg:'#F0EFFE', text:'#4039A0', dot:'#534AB7' },
  { bg:'#FBF3E5', text:'#6E4809', dot:'#8A5A10' },
  { bg:'#F0F8F0', text:'#2D5C30', dot:'#3D7A52' },
  { bg:'#FBE8F0', text:'#7A2848', dot:'#B03868' },
];

const TIMEOFF_TYPES  = ['Holiday','Sick','Personal','Other'];
const DAYS           = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const AVAIL_TEMPLATES = {
  'Full-time (Mon–Fri)': Object.fromEntries([...['Mon','Tue','Wed','Thu','Fri'].map(d=>[d,{from:'09:00',to:'17:00'}]),...['Sat','Sun'].map(d=>[d,null])]),
  'Evenings only':       Object.fromEntries(DAYS.map(d=>[d,{from:'16:00',to:'00:00'}])),
  'Weekends only':       Object.fromEntries([...['Mon','Tue','Wed','Thu','Fri'].map(d=>[d,null]),...['Sat','Sun'].map(d=>[d,{from:'10:00',to:'00:00'}])]),
  'Full availability':   Object.fromEntries(DAYS.map(d=>[d,{from:'09:00',to:'00:00'}])),
  'Not available':       Object.fromEntries(DAYS.map(d=>[d,null])),
};

// ─── Default data ─────────────────────────────────────────────────────────────
const DEFAULT_BLOCKS = [
  { id:'lunch',  name:'Lunch',  start:'10:00', end:'16:00', roles:{ Manager:1, Waiter:2, Kitchen:1, Bartender:0, Other:0 } },
  { id:'dinner', name:'Dinner', start:'16:30', end:'00:00', roles:{ Manager:1, Waiter:3, Kitchen:2, Bartender:1, Other:0 },
    overrides:{ Fri:{ Manager:1, Waiter:4, Kitchen:2, Bartender:1, Other:0 }, Sat:{ Manager:1, Waiter:4, Kitchen:2, Bartender:1, Other:0 } } },
];
const DEFAULT_EMPLOYEES = [
  {id:'1', name:'Mads Larsen',       roles:['Manager'],   salaryPct:100, palIdx:0, maxHours:40, availability:{Mon:{from:'09:00',to:'16:00'},Tue:{from:'09:00',to:'16:00'},Wed:{from:'09:00',to:'16:00'},Thu:{from:'09:00',to:'16:00'},Fri:{from:'09:00',to:'16:00'},Sat:null,Sun:null}},
  {id:'2', name:'Sofie Hansen',      roles:['Manager'],   salaryPct:100, palIdx:1, maxHours:40, availability:{Mon:null,Tue:null,Wed:{from:'16:00',to:'00:00'},Thu:{from:'16:00',to:'00:00'},Fri:{from:'16:00',to:'00:00'},Sat:{from:'16:00',to:'00:00'},Sun:{from:'16:00',to:'00:00'}}},
  {id:'3', name:'Jonas Møller',      roles:['Waiter'],    salaryPct:80,  palIdx:2, maxHours:40, availability:{Mon:{from:'10:00',to:'16:00'},Tue:{from:'10:00',to:'16:00'},Wed:{from:'10:00',to:'16:00'},Thu:{from:'16:00',to:'00:00'},Fri:{from:'16:00',to:'00:00'},Sat:{from:'16:00',to:'00:00'},Sun:{from:'16:00',to:'00:00'}}},
  {id:'4', name:'Emma Nielsen',      roles:['Waiter'],    salaryPct:80,  palIdx:3, maxHours:40, availability:{Mon:{from:'10:00',to:'00:00'},Tue:{from:'10:00',to:'00:00'},Wed:{from:'10:00',to:'00:00'},Thu:{from:'10:00',to:'16:00'},Fri:{from:'10:00',to:'00:00'},Sat:{from:'16:00',to:'00:00'},Sun:null}},
  {id:'5', name:'Tobias Jensen',     roles:['Kitchen'],   salaryPct:80,  palIdx:4, maxHours:40, availability:{Mon:null,Tue:{from:'16:00',to:'00:00'},Wed:{from:'16:00',to:'00:00'},Thu:{from:'10:00',to:'00:00'},Fri:{from:'16:00',to:'00:00'},Sat:{from:'10:00',to:'00:00'},Sun:{from:'10:00',to:'00:00'}}},
  {id:'6', name:'Laura Christensen', roles:['Kitchen'],   salaryPct:80,  palIdx:5, maxHours:40, availability:{Mon:{from:'10:00',to:'16:00'},Tue:{from:'10:00',to:'16:00'},Wed:null,Thu:{from:'10:00',to:'16:00'},Fri:{from:'10:00',to:'00:00'},Sat:{from:'10:00',to:'00:00'},Sun:{from:'10:00',to:'16:00'}}},
  {id:'7', name:'Mikkel Andersen',   roles:['Bartender'], salaryPct:80,  palIdx:6, maxHours:40, availability:{Mon:{from:'10:00',to:'16:00'},Tue:null,Wed:{from:'10:00',to:'16:00'},Thu:{from:'16:00',to:'00:00'},Fri:{from:'16:00',to:'00:00'},Sat:{from:'10:00',to:'00:00'},Sun:{from:'16:00',to:'00:00'}}},
  {id:'8', name:'Ida Pedersen',      roles:['Waiter'],    salaryPct:50,  palIdx:0, maxHours:20, availability:{Mon:null,Tue:null,Wed:{from:'16:00',to:'00:00'},Thu:{from:'16:00',to:'00:00'},Fri:{from:'16:00',to:'00:00'},Sat:{from:'10:00',to:'00:00'},Sun:{from:'16:00',to:'00:00'}}},
  {id:'9', name:'Oliver Thomsen',    roles:['Waiter'],    salaryPct:50,  palIdx:1, maxHours:20, availability:{Mon:{from:'16:00',to:'00:00'},Tue:{from:'16:00',to:'00:00'},Wed:{from:'16:00',to:'00:00'},Thu:null,Fri:{from:'16:00',to:'00:00'},Sat:{from:'16:00',to:'00:00'},Sun:null}},
  {id:'10',name:'Maja Kristensen',   roles:['Kitchen'],   salaryPct:55,  palIdx:2, maxHours:20, availability:{Mon:null,Tue:null,Wed:{from:'16:00',to:'00:00'},Thu:{from:'10:00',to:'00:00'},Fri:{from:'10:00',to:'00:00'},Sat:{from:'16:00',to:'00:00'},Sun:{from:'10:00',to:'00:00'}}},
  {id:'11',name:'Rasmus Olsen',      roles:['Bartender'], salaryPct:50,  palIdx:3, maxHours:20, availability:{Mon:{from:'16:00',to:'00:00'},Tue:null,Wed:{from:'16:00',to:'00:00'},Thu:{from:'16:00',to:'00:00'},Fri:{from:'16:00',to:'00:00'},Sat:{from:'16:00',to:'00:00'},Sun:null}},
  {id:'12',name:'Freja Madsen',      roles:['Bartender'], salaryPct:60,  palIdx:4, maxHours:24, availability:{Mon:null,Tue:{from:'16:00',to:'00:00'},Wed:null,Thu:{from:'16:00',to:'00:00'},Fri:{from:'16:00',to:'00:00'},Sat:{from:'10:00',to:'00:00'},Sun:{from:'16:00',to:'00:00'}}},
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getMondayDate(off=0){ const n=new Date('2026-05-11'),dy=n.getDay(),m=new Date(n); m.setDate(n.getDate()-dy+(dy===0?-6:1)+off*7); m.setHours(0,0,0,0); return m; }
function getWeekDates(off=0){ const m=getMondayDate(off); return DAYS.map((_,i)=>{ const d=new Date(m); d.setDate(m.getDate()+i); return d; }); }
function weekKey(off){ const m=getMondayDate(off); return `${m.getFullYear()}-${String(m.getMonth()+1).padStart(2,'0')}-${String(m.getDate()).padStart(2,'0')}`; }
function dateToISO(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function fmt(d){ return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'}); }
function fmtLong(iso){ const [y,m,d]=iso.split('-'); return new Date(y,m-1,d).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}); }
function toMin(t){ const[h,m]=t.split(':').map(Number); return h*60+m; }
function blockHours(b){ const s=toMin(b.start); let e=toMin(b.end); if(e<=s) e+=1440; return (e-s)/60; }
function coversBlock(av,b){ if(!av) return false; const es=toMin(av.from); let ee=toMin(av.to); if(ee<=es) ee+=1440; const bs=toMin(b.start); let be=toMin(b.end); if(be<=bs) be+=1440; return es<=bs&&ee>=be; }
function getBlockRoles(b,day){ return (b.overrides&&b.overrides[day])?b.overrides[day]:b.roles; }
function isOnTimeOff(empId,date,list){ const iso=dateToISO(date); return list.some(t=>t.empId===empId&&t.status==='Approved'&&t.startDate<=iso&&t.endDate>=iso); }
function getMonthOffsets(ym){ 
  // ym can be {y,m} or a weekOffset number (legacy)
  const ref = typeof ym==='object' ? new Date(ym.y, ym.m, 15) : getMondayDate(ym);
  const fom=new Date(ref.getFullYear(),ref.getMonth(),1),fd=fom.getDay(),fm=new Date(fom);
  fm.setDate(fom.getDate()-(fd===0?6:fd-1));
  const offsets=[];
  for(let i=0;i<6;i++){
    const d=new Date(fm); d.setDate(fm.getDate()+i*7);
    const we=new Date(d); we.setDate(d.getDate()+6);
    if(d.getMonth()===ref.getMonth()||we.getMonth()===ref.getMonth()){
      const base=getMondayDate(0);
      offsets.push(Math.round((d-base)/(7*24*3600*1000)));
    }
  }
  return offsets;
}
function todayISO(){ return dateToISO(new Date('2026-05-11')); }
function initials(name){ return name.split(' ').map(n=>n[0]).join(''); }

// ─── Scheduler ────────────────────────────────────────────────────────────────
function buildSchedule(employees,blocks,weekDates,timeOffList,allRoles){
  const hw={},wd={}; employees.forEach(e=>{ hw[e.id]=0; wd[e.id]=new Set(); });
  const byRole=role=>[...employees].filter(e=>(e.roles||[]).includes(role)).sort((a,b)=>a.salaryPct-b.salaryPct);
  const isManager=e=>(e.roles||[]).includes('Manager');
  const result={},warnings=[];

  DAYS.forEach((day,di)=>{
    const date=weekDates[di]; result[day]={};

    // ── PASS 1: Greedy fill ──────────────────────────────────────────────────
    blocks.forEach(b=>{
      const bh=blockHours(b),rr=getBlockRoles(b,day),assigned=[],assignedInBlock=new Set();
      allRoles.forEach(role=>{ const need=rr[role]||0; if(!need) return;
        const pool=byRole(role).filter(e=>coversBlock(e.availability[day],b)&&!isOnTimeOff(e.id,date,timeOffList)&&!wd[e.id].has(di)&&hw[e.id]+bh<=e.maxHours&&!assignedInBlock.has(e.id));
        for(let i=0;i<need;i++){ if(pool[i]){ assigned.push({empId:pool[i].id,name:pool[i].name,role}); assignedInBlock.add(pool[i].id); } else warnings.push(`${day} ${b.name}: missing ${role}`); }
      });
      // Tentative manager add (may be pulled out in pass 2)
      const hasMgr=assigned.some(a=>isManager(employees.find(e=>e.id===a.empId)));
      if(!hasMgr&&assigned.length>0){
        const mgr=byRole('Manager').find(e=>coversBlock(e.availability[day],b)&&!isOnTimeOff(e.id,date,timeOffList)&&!wd[e.id].has(di)&&hw[e.id]+bh<=e.maxHours&&!assignedInBlock.has(e.id));
        if(mgr){ assigned.push({empId:mgr.id,name:mgr.name,role:'Manager'}); assignedInBlock.add(mgr.id); }
      }
      const seen=new Set(); assigned.forEach(a=>{ if(!seen.has(a.empId)){ hw[a.empId]+=bh; wd[a.empId].add(di); seen.add(a.empId); } });
      result[day][b.id]=assigned;
    });

    // ── PASS 2: Fix manager gaps by swapping ────────────────────────────────
    // For each block without a manager, try to fix it:
    //  (a) Check if any assigned employee in that block is also a Manager
    //      but was assigned under a different role label — mark them as Manager
    //  (b) Find a manager assigned to another block on the same day who can
    //      cover this block too (multi-role: remove from other block, add here)
    //  (c) Find an unassigned manager who wasn't used in pass 1 (e.g. their
    //      hours capacity was reached due to earlier blocks)
    blocks.forEach(b=>{
      const bh=blockHours(b);
      const assigned=result[day][b.id];
      const hasMgr=assigned.some(a=>isManager(employees.find(e=>e.id===a.empId)));
      if(hasMgr||assigned.length===0) return;

      // (a) Any assigned employee who is also a manager? Relabel them.
      const hiddenMgr=assigned.find(a=>isManager(employees.find(e=>e.id===a.empId)));
      if(hiddenMgr){ hiddenMgr.role='Manager'; return; }

      // (b) Find a manager assigned elsewhere today who also covers this block
      // and whose hours can absorb an extra block
      let fixed=false;
      blocks.forEach(otherB=>{
        if(fixed||otherB.id===b.id) return;
        const otherAssigned=result[day][otherB.id]||[];
        const mgrEntry=otherAssigned.find(a=>isManager(employees.find(e=>e.id===a.empId)));
        if(!mgrEntry) return;
        const mgrEmp=employees.find(e=>e.id===mgrEntry.empId);
        if(!mgrEmp||!coversBlock(mgrEmp.availability[day],b)) return;
        // They cover both blocks — check if adding this block's hours is ok
        // (they're already counted for otherB, so we only add the delta)
        if(hw[mgrEmp.id]+bh>mgrEmp.maxHours) return;
        // Add manager to this block too (they work both blocks)
        hw[mgrEmp.id]+=bh;
        result[day][b.id]=[...assigned,{empId:mgrEmp.id,name:mgrEmp.name,role:'Manager'}];
        fixed=true;
      });
      if(fixed) return;

      // (c) No manager found at all
      warnings.push(`⚠️ ${day} ${b.name}: No manager available!`);
    });
  });

  const total=Object.values(result).flatMap(d=>Object.values(d)).flat().length;
  const nm=warnings.filter(w=>w.startsWith('⚠️'));
  return {
    schedule:result, warnings,
    notes: nm.length>0
      ? `${total} slots filled — ${nm.length} block(s) could not get a manager. Review staffing.`
      : `${total} slots filled across all blocks with full manager coverage.`
  };
}
function dayCoverage(schedule,blocks,day,allRoles){ if(!schedule||!schedule[day]) return 'empty'; let tot=0,fill=0; blocks.forEach(b=>{ const r=getBlockRoles(b,day); allRoles.forEach(role=>{ tot+=r[role]||0; fill+=Math.min(r[role]||0,(schedule[day][b.id]||[]).filter(a=>a.role===role).length); }); }); if(tot===0) return 'empty'; const p=fill/tot; return p>=1?'full':p>=0.6?'partial':'low'; }

// ─── Persistence ──────────────────────────────────────────────────────────────
const migrateEmployee=e=>({
  ...e,
  roles: e.roles || (e.role ? [e.role] : ['Other']),
  // offDays removed - use Time Off system instead
});
const load=(k,fb)=>{ 
  try{ 
    const v=localStorage.getItem(k); 
    if(!v) return fb;
    const parsed=JSON.parse(v);
    // Migrate employee data
    if(k==='sa2_emps'&&Array.isArray(parsed)) return parsed.map(migrateEmployee);
    return parsed;
  }catch{ return fb; } 
};
const save=(k,v)=>{ try{ localStorage.setItem(k,JSON.stringify(v)); }catch{}};

// ─── Styled helpers ───────────────────────────────────────────────────────────
const pal=(e)=>EMP_PALETTE[e?.palIdx%EMP_PALETTE.length]||EMP_PALETTE[0];

function computeStyles(){
  return {
  card: { background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, padding:20, boxShadow:'0 1px 4px rgba(28,24,21,0.06)' },
  cardFlush: { background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, overflow:'hidden', boxShadow:'0 1px 4px rgba(28,24,21,0.06)' },
  input: { padding:'7px 11px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:13, fontFamily:'inherit', outline:'none', width:'100%', boxSizing:'border-box' },
  select: { padding:'7px 11px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:13, fontFamily:'inherit', outline:'none', width:'100%', boxSizing:'border-box', cursor:'pointer' },
  };
}
const styles = computeStyles();

// ─── Small components ─────────────────────────────────────────────────────────
function Avatar({emp,size=32}){ const p=pal(emp); return <div style={{width:size,height:size,borderRadius:'50%',background:p.bg,color:p.text,display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*0.35,fontWeight:600,flexShrink:0,border:`1.5px solid ${p.dot}22`}}>{initials(emp.name)}</div>; }

function RoleBadge({role,rs}){ const s=rs||{dot:'#9C9088',bg:'#F2F1EF',text:'#5C5248',border:'#C8C4BE'}; const isDark=T.bg==='#1A1714'; const bb=isDark?s.dot+'22':s.bg; const bt=isDark?s.dot:s.text; const bor=isDark?s.dot+'55':s.border; return <span style={{display:'inline-flex',alignItems:'center',gap:4,padding:'2px 8px',borderRadius:999,fontSize:11,fontWeight:500,background:bb,color:bt,border:`1px solid ${bor}`}}><span style={{width:5,height:5,borderRadius:'50%',background:s.dot,flexShrink:0}}/>{role}</span>; }

function EmpChip({emp,selected,onClick}){ const p=pal(emp); return <button onClick={onClick} style={{display:'inline-flex',alignItems:'center',gap:4,padding:'2px 8px 2px 4px',borderRadius:999,fontSize:11,fontWeight:500,background:selected?p.dot:p.bg,color:selected?'#fff':p.text,border:`1px solid ${selected?p.dot:p.dot+'44'}`,cursor:onClick?'pointer':'default',transition:'all 0.15s',whiteSpace:'nowrap'}}><span style={{width:16,height:16,borderRadius:'50%',background:selected?'rgba(255,255,255,0.3)':p.dot,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:700,flexShrink:0}}>{initials(emp.name)}</span>{emp.name.split(' ')[0]}</button>; }

function StatusBadge({status}){ const cfg={Approved:{bg:T.successLight,text:T.success,dot:'#3D7A52'},Pending:{bg:T.warningLight,text:T.warning,dot:'#956B18'},Rejected:{bg:T.dangerLight,text:T.danger,dot:'#963030'}}[status]||{}; return <span style={{display:'inline-flex',alignItems:'center',gap:4,padding:'2px 8px',borderRadius:999,fontSize:11,fontWeight:500,background:cfg.bg,color:cfg.text,border:`1px solid ${cfg.dot}33`}}><span style={{width:5,height:5,borderRadius:'50%',background:cfg.dot}}/>{status}</span>; }

function Btn({children,onClick,disabled,variant='primary',small}){
  const base={fontFamily:'inherit',fontWeight:500,borderRadius:8,cursor:disabled?'wait':'pointer',border:'none',transition:'all 0.15s',fontSize:small?12:13,padding:small?'5px 12px':'7px 16px',opacity:disabled?0.6:1};
  const vs={primary:{background:T.accent,color:'#fff'},secondary:{background:T.surfaceWarm,color:T.text,border:`1px solid ${T.border}`},ghost:{background:'transparent',color:T.text2,border:`1px solid ${T.border}`},danger:{background:T.dangerLight,color:T.danger,border:`1px solid ${T.danger}33`},success:{background:T.successLight,color:T.success,border:`1px solid ${T.success}33`}};
  return <button onClick={onClick} disabled={disabled} style={{...base,...vs[variant]}}>{children}</button>;
}

function SectionLabel({children}){ return <div style={{fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>{children}</div>; }

// ─── AddRoleInline component ─────────────────────────────────────────────────
function AddRoleInline({onAdd}){
  const [editing,setEditing]=useState(false);
  const [val,setVal]=useState('');
  if(!editing) return (
    <button onClick={()=>setEditing(true)} style={{display:'inline-flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:999,background:'transparent',border:`1px dashed ${T.border}`,color:T.text3,cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>+ Add role</button>
  );
  return (
    <div style={{display:'inline-flex',alignItems:'center',gap:4}}>
      <input autoFocus value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter'&&val.trim()){ onAdd(val.trim()); setVal(''); setEditing(false); } if(e.key==='Escape'){ setVal(''); setEditing(false); } }} placeholder="Role name…" style={{padding:'4px 8px',borderRadius:6,border:`1px solid ${T.border}`,background:'white',fontSize:12,fontFamily:'inherit',width:110,outline:'none'}}/>
      <button onClick={()=>{ if(val.trim()){ onAdd(val.trim()); setVal(''); setEditing(false); } }} style={{padding:'4px 8px',borderRadius:6,background:T.accent,color:'#fff',border:'none',fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>Add</button>
      <button onClick={()=>{ setVal(''); setEditing(false); }} style={{padding:'4px 8px',borderRadius:6,background:'transparent',border:`1px solid ${T.border}`,color:T.text3,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>✕</button>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App(){
  const [theme,setThemeRaw]=useState(()=>{try{return localStorage.getItem("sa2_theme")||"light"}catch{return "light"}});
  Object.assign(T,THEMES[theme]||THEMES.light);
  Object.assign(styles,computeStyles());
  const toggleTheme=()=>{const next=theme==="dark"?"light":"dark";setThemeRaw(next);try{localStorage.setItem("sa2_theme",next)}catch{}};
  const [view,        setView]      = useState('schedule');
  const [calMode,     setCalMode]   = useState('week');
  const [employees,   setEmpRaw]    = useState(()=>load('sa2_emps',DEFAULT_EMPLOYEES));
  const [blocks,      setBlocksRaw] = useState(()=>load('sa2_blocks',DEFAULT_BLOCKS));
  const [schedules,   setSchedsRaw] = useState(()=>load('sa2_scheds',{}));
  const [timeOff,     setTORaw]     = useState(()=>load('sa2_to',[]));
  const [weekOffset,  setWeekOffset]= useState(0);
  const [roleStyles,  setRoleStylesRaw] = useState(()=>load('sa2_roles', DEFAULT_ROLE_STYLES));
  const allRoles = Object.keys(roleStyles);
  const [displayMonth,  setDisplayMonth]  = useState(()=>{ const n=new Date('2026-05-11'); return {y:n.getFullYear(),m:n.getMonth()}; });
  const [editingRole,    setEditingRole]    = useState(null); // { name, newName, colorIdx }
  const [confirmDelete,  setConfirmDelete]  = useState(null); // role name
  const [generating,  setGenerating]= useState(false);
  const [selected,    setSelected]  = useState(null);
  const [openPicker,  setOpenPicker] = useState(null); // {day, blockId, role}
  const [expandedEmp, setExpandedEmp]=useState(null);
  const [showAddEmp,  setShowAddEmp]=useState(false);
  const [newEmp,      setNewEmp]    = useState({name:'',roles:['Manager'],salaryPct:100,maxHours:40});
  const [showAddTO,   setShowAddTO] = useState(false);
  const [newTO,       setNewTO]     = useState({empId:'',startDate:todayISO(),endDate:todayISO(),type:'Holiday',note:'',status:'Pending'});
  const [toFilter,    setToFilter]  = useState('all');
  const [costsMode,   setCostsMode]  = useState('week'); // 'week' | 'month'
  const [hourlyRate,  setHourlyRateRaw] = useState(()=>load('sa2_rate',{amount:150,currency:'kr'}));
  const setHourlyRate=v=>{ const val=typeof v==='function'?v(hourlyRate):v; setHourlyRateRaw(val); save('sa2_rate',val); };

  // Inject fonts
  useEffect(()=>{
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&family=DM+Sans:wght@400;500&display=swap';
    document.head.appendChild(link);
    return ()=>{ try{ document.head.removeChild(link); }catch{} };
  },[]);

  // Global styles
  useEffect(()=>{
    const s=document.createElement('style');
    s.textContent=`* { box-sizing:border-box; } input,select { font-family:'DM Sans',sans-serif !important; } input:focus,select:focus { outline:2px solid ${T.accent} !important; outline-offset:1px; } ::-webkit-scrollbar{width:6px;height:6px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:${T.border};border-radius:3px} `;
    document.head.appendChild(s);
    return ()=>{ try{ document.head.removeChild(s); }catch{} };
  },[]);

  const weekDates   = getWeekDates(weekOffset);
  const wKey        = weekKey(weekOffset);
  const weekData    = schedules[wKey]||null;
  const schedule    = weekData?.schedule||null;
  const notes       = weekData?.notes||'';
  const warnings    = weekData?.warnings||[];
  const confirmed   = weekData?.confirmed||false;
  const monthOff    = getMonthOffsets(calMode==='month' ? displayMonth : weekOffset);
  const pendingCount= timeOff.filter(t=>t.status==='Pending').length;

  const setEmployees=v=>{ const val=typeof v==='function'?v(employees):v; setEmpRaw(val); save('sa2_emps',val); };
  const setBlocks   =v=>{ const val=typeof v==='function'?v(blocks):v;    setBlocksRaw(val); save('sa2_blocks',val); };
  const setSchedules=v=>{ const val=typeof v==='function'?v(schedules):v; setSchedsRaw(val); save('sa2_scheds',val); };
  const setTimeOff   =v=>{ const val=typeof v==='function'?v(timeOff):v;   setTORaw(val); save('sa2_to',val); };
  const setRoleStyles=v=>{ const val=typeof v==='function'?v(roleStyles):v; setRoleStylesRaw(val); save('sa2_roles',val); };

  const confirmSchedule  =()=>setSchedules(p=>({...p,[wKey]:{...p[wKey],confirmed:true}}));
  const unconfirmSchedule=()=>setSchedules(p=>({...p,[wKey]:{...p[wKey],confirmed:false}}));
  const deleteSchedule   =()=>{ setSchedules(p=>{ const next={...p}; delete next[wKey]; return next; }); setSelected(null); };
  const deleteMonth      =()=>{
    const offsets=getMonthOffsets(displayMonth);
    setSchedules(p=>{ const next={...p}; offsets.forEach(off=>delete next[weekKey(off)]); return next; });
    setSelected(null);
  };

  const generate=(forOff=weekOffset)=>{
    setGenerating(true); setSelected(null);
    setTimeout(()=>{ const wd=getWeekDates(forOff); const {schedule:s,notes:n,warnings:w}=buildSchedule(employees,blocks,wd,timeOff,allRoles); setSchedules(p=>({...p,[weekKey(forOff)]:{schedule:s,notes:n,warnings:w}})); setGenerating(false); },350);
  };
  const generateMonth=()=>{
    setGenerating(true); setSelected(null);
    // Generate all weeks in the currently displayed month
    const offsets=getMonthOffsets(calMode==='month' ? displayMonth : weekOffset);
    setTimeout(()=>{
      const updates={};
      offsets.forEach(off=>{
        const wd=getWeekDates(off);
        const {schedule:s,notes:n,warnings:w}=buildSchedule(employees,blocks,wd,timeOff,allRoles);
        updates[weekKey(off)]={schedule:s,notes:n,warnings:w};
      });
      setSchedules(p=>({...p,...updates}));
      setGenerating(false);
    },100);
  };

  const handleSlotClick=(day,blockId,entry,idx)=>{ if(!schedule) return; setOpenPicker(null); if(!selected){ setSelected({...entry,day,blockId,idx}); return; } if(selected.day===day&&selected.blockId===blockId&&selected.idx===idx){ setSelected(null); return; } const ns=JSON.parse(JSON.stringify(schedule)); const src=ns[selected.day][selected.blockId],dst=ns[day][blockId]; const se=src[selected.idx],de=dst[idx]; src[selected.idx]={...de,role:se.role}; dst[idx]={...se,role:de.role}; setSchedules(p=>({...p,[wKey]:{...p[wKey],schedule:ns}})); setSelected(null); };
  const handleEmptySlotClick=(day,blockId,role)=>{ if(!selected||!schedule) return; const ns=JSON.parse(JSON.stringify(schedule)); const entry=ns[selected.day][selected.blockId].splice(selected.idx,1)[0]; ns[day][blockId]=[...(ns[day][blockId]||[]),{...entry,role}]; setSchedules(p=>({...p,[wKey]:{...p[wKey],schedule:ns}})); setSelected(null); };

  // Compute employees who could fill a specific gap slot
  const eligibleForSlot=(day,blockId,role)=>{
    if(!schedule) return [];
    const block=blocks.find(b=>b.id===blockId);
    if(!block) return [];
    const bh=blockHours(block);
    const date=weekDates[DAYS.indexOf(day)];
    // Who's already working that day (in any block)
    const alreadyWorking=new Set(
      blocks.flatMap(b=>(schedule[day]?.[b.id]||[]).map(a=>a.empId))
    );
    return employees
      .filter(e=>
        (e.roles||[]).includes(role) &&
        coversBlock(e.availability[day],block) &&
        !isOnTimeOff(e.id,date,timeOff) &&
        !alreadyWorking.has(e.id) &&
        empHours(e.id)+bh<=e.maxHours
      )
      .sort((a,b)=>a.salaryPct-b.salaryPct);
  };

  // Directly add an employee to a schedule slot
  const addToSlot=(day,blockId,role,emp)=>{
    const ns=JSON.parse(JSON.stringify(schedule));
    ns[day][blockId]=[...(ns[day][blockId]||[]),{empId:emp.id,name:emp.name,role}];
    setSchedules(p=>({...p,[wKey]:{...p[wKey],schedule:ns,confirmed:false}}));
    setOpenPicker(null);
  };

  const updateEmp=(id,f,v)=>setEmployees(p=>p.map(e=>e.id===id?{...e,[f]:v}:e));
  const updateAvail=(id,day,f,v)=>setEmployees(p=>p.map(e=>{ if(e.id!==id) return e; const cur=e.availability[day]||{from:'10:00',to:'18:00'}; return {...e,availability:{...e.availability,[day]:{...cur,[f]:v}}}; }));
  const toggleDay=(id,day)=>setEmployees(p=>p.map(e=>{ if(e.id!==id) return e; const cur=e.availability[day]; return {...e,availability:{...e.availability,[day]:cur?null:{from:'10:00',to:'18:00'}}}; }));
  const applyTemplate=(id,tpl)=>{ const t=AVAIL_TEMPLATES[tpl]; if(t) setEmployees(p=>p.map(e=>e.id===id?{...e,availability:JSON.parse(JSON.stringify(t))}:e)); };
  const duplicateEmp=emp=>setEmployees(p=>[...p,{...JSON.parse(JSON.stringify(emp)),id:String(Date.now()),name:emp.name+' (copy)',palIdx:p.length%EMP_PALETTE.length}]);
  const removeEmp=id=>{ setEmployees(p=>p.filter(e=>e.id!==id)); if(expandedEmp===id) setExpandedEmp(null); };
  const addEmployee=()=>{ if(!newEmp.name.trim()) return; setEmployees(p=>[...p,{...newEmp,id:String(Date.now()),palIdx:p.length%EMP_PALETTE.length,availability:Object.fromEntries(DAYS.map(d=>[d,null]))}]); setNewEmp({name:'',roles:['Manager'],salaryPct:100,maxHours:40}); setShowAddEmp(false); };
  const addTO=()=>{ if(!newTO.empId) return; setTimeOff(p=>[...p,{...newTO,id:String(Date.now())}]); setNewTO({empId:'',startDate:todayISO(),endDate:todayISO(),type:'Holiday',note:'',status:'Pending'}); setShowAddTO(false); };
  const updateTOStatus=(id,status)=>setTimeOff(p=>p.map(t=>t.id===id?{...t,status}:t));
  const removeTO=id=>setTimeOff(p=>p.filter(t=>t.id!==id));

  // Pre-compute hours for all employees once (not recalculated per call)
  const empHoursMap = employees.reduce((acc,e)=>{
    if(!schedule){ acc[e.id]=0; return acc; }
    let h=0;
    DAYS.forEach(day=>blocks.forEach(b=>{ if((schedule[day]?.[b.id]||[]).some(a=>a.empId===e.id)) h+=blockHours(b); }));
    acc[e.id]=h; return acc;
  },{});
  const empHours=id=>empHoursMap[id]||0;
  const totalStats=()=>{ if(!schedule) return null; let f=0,m=0; DAYS.forEach(day=>blocks.forEach(b=>{ const a=schedule[day]?.[b.id]||[],r=getBlockRoles(b,day); f+=a.length; allRoles.forEach(role=>{ const need=r[role]||0,got=a.filter(x=>x.role===role).length; if(got<need) m+=(need-got); }); })); return {filled:f,missing:m}; };
  const stats=totalStats();
  // Salary cost data — computed once per render
  const costData = employees.map(e=>{
    const h=empHours(e.id);
    const costUnits=parseFloat((h*(e.salaryPct/100)).toFixed(2));
    return {emp:e, hours:h, costUnits};
  });
  const totalCostUnits=costData.reduce((s,d)=>s+d.costUnits,0);
  const maxCostUnits=Math.max(...costData.map(d=>d.costUnits),0.01);

  // Month cost data — aggregate across all generated weeks in display month
  const monthCostData=employees.map(e=>{
    let totalH=0;
    getMonthOffsets(displayMonth).forEach(off=>{
      const ws=schedules[weekKey(off)]?.schedule;
      if(!ws) return;
      DAYS.forEach(day=>blocks.forEach(b=>{ if((ws[day]?.[b.id]||[]).some(a=>a.empId===e.id)) totalH+=blockHours(b); }));
    });
    return {emp:e, hours:totalH, costUnits:parseFloat((totalH*(e.salaryPct/100)).toFixed(2))};
  });
  const totalMonthCostUnits=monthCostData.reduce((s,d)=>s+d.costUnits,0);
  const maxMonthCostUnits=Math.max(...monthCostData.map(d=>d.costUnits),0.01);

  // Role cost breakdown — computed for both modes
  const buildRoleCosts=data=>allRoles.reduce((acc,role)=>{
    const roleEmps=data.filter(d=>(d.emp.roles||[]).includes(role));
    acc[role]=parseFloat(roleEmps.reduce((s,d)=>s+d.costUnits,0).toFixed(2));
    return acc;
  },{});
  const weekRoleCosts=buildRoleCosts(costData);
  const monthRoleCosts=buildRoleCosts(monthCostData);

  // Money conversion
  const toMoney=units=>{ const val=units*hourlyRate.amount; return val>=10000?`${hourlyRate.currency} ${Math.round(val/1000)}k`:`${hourlyRate.currency} ${Math.round(val).toLocaleString('da-DK')}`; };
  const offThisWeek=employees.filter(e=>weekDates.some(d=>isOnTimeOff(e.id,d,timeOff)));
  const wkISOs=weekDates.map(dateToISO);
  const filteredTO=timeOff.filter(t=>{ if(toFilter==='pending') return t.status==='Pending'; if(toFilter==='approved') return t.status==='Approved'; if(toFilter==='this-week') return wkISOs.some(iso=>t.startDate<=iso&&t.endDate>=iso); return true; }).sort((a,b)=>a.startDate.localeCompare(b.startDate));

  const coverageDot=s=>({full:{bg:'#D4F0E2',border:'#5AAE80',text:'#236040'},partial:{bg:'#FBF0D5',border:'#D4A830',text:'#7A5010'},low:{bg:'#F5E2E2',border:'#D06060',text:'#783030'},empty:{bg:T.bg,border:T.border,text:T.text3}}[s]);

  const navItems=[{k:'schedule',l:'Schedule'},{k:'employees',l:'Employees'},{k:'timeoff',l:pendingCount?`Time Off · ${pendingCount}`:'Time Off'},{k:'coverage',l:'Coverage'},{k:'costs',l:'Costs'}];

  return (
    <div style={{minHeight:'100vh',background:T.bg,fontFamily:"'DM Sans',sans-serif",color:T.text,fontSize:13}}>

      {/* ── Top navigation ── */}
      <div style={{background:T.surface,borderBottom:`1px solid ${T.border}`,padding:'0 24px',display:'flex',alignItems:'center',gap:0,height:56,position:'sticky',top:0,zIndex:100,boxShadow:`0 1px 3px rgba(28,24,21,0.04)`}}>
        {/* Brand */}
        <div style={{display:'flex',alignItems:'baseline',gap:8,marginRight:36}}>
          <span style={{fontFamily:"'Fraunces',serif",fontSize:18,fontWeight:600,color:T.text,letterSpacing:'-0.01em'}}>Rorota</span>
          <span style={{fontSize:11,color:T.text3,fontWeight:400}}>Restaurant</span>
        </div>
        {/* Nav */}
        <div style={{display:'flex',alignItems:'center',gap:0,flex:1}}>
          {navItems.map(({k,l})=>{
            const active=view===k;
            return (
              <button key={k} onClick={()=>setView(k)} style={{fontFamily:'inherit',padding:'0 16px',height:56,background:'none',border:'none',cursor:'pointer',fontSize:13,fontWeight:active?500:400,color:active?T.text:T.text2,position:'relative',transition:'color 0.15s',whiteSpace:'nowrap'}}>
                {l}
                {active&&<div style={{position:'absolute',bottom:0,left:16,right:16,height:2,background:T.accent,borderRadius:'2px 2px 0 0'}}/>}
              </button>
            );
          })}
        </div>
        {/* Generate */}
        <button onClick={()=>supabase.auth.signOut()} style={{height:34,padding:"0 14px",borderRadius:8,border:`1px solid ${T.border}`,background:T.surface,color:T.text2,cursor:"pointer",fontSize:12,fontFamily:"inherit",marginRight:10}}>↪ Log out</button><button onClick={toggleTheme} style={{width:34,height:34,marginRight:8,borderRadius:8,border:`1px solid ${T.border}`,background:T.surface,color:T.text2,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>{theme==="dark"?"☀":"☾"}</button><Btn onClick={()=>calMode==='month'?generateMonth():generate()} disabled={generating} variant="primary">
          {generating?'Generating…':'✦ Generate'}
        </Btn>
      </div>

      <div style={{maxWidth:1100,margin:'0 auto',padding:'24px 20px'}}>

        {/* ══ SCHEDULE ══ */}
        {view==='schedule'&&(
          <div>
            {/* Sub-nav */}
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:20,flexWrap:'wrap'}}>
              <div style={{display:'flex',alignItems:'center',gap:4,background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:3}}>
                <button onClick={()=>{
                  if(calMode==='month'){
                    setDisplayMonth(p=>p.m===0?{y:p.y-1,m:11}:{y:p.y,m:p.m-1});
                  } else {
                    setWeekOffset(w=>w-1);
                  }
                }} style={{padding:'4px 10px',borderRadius:6,background:'none',border:'none',cursor:'pointer',color:T.text2,fontFamily:'inherit',fontSize:13}}>‹</button>
                <span style={{fontSize:13,fontWeight:500,minWidth:calMode==='month'?120:150,textAlign:'center',color:T.text,padding:'0 4px'}}>
                  {calMode==='month'?new Date(displayMonth.y,displayMonth.m,1).toLocaleDateString('en-GB',{month:'long',year:'numeric'}):`${fmt(weekDates[0])} – ${fmt(weekDates[6])}`}
                </span>
                <button onClick={()=>{
                  if(calMode==='month'){
                    setDisplayMonth(p=>p.m===11?{y:p.y+1,m:0}:{y:p.y,m:p.m+1});
                  } else {
                    setWeekOffset(w=>w+1);
                  }
                }} style={{padding:'4px 10px',borderRadius:6,background:'none',border:'none',cursor:'pointer',color:T.text2,fontFamily:'inherit',fontSize:13}}>›</button>
              </div>
              <button onClick={()=>{ setWeekOffset(0); const n=new Date('2026-05-11'); setDisplayMonth({y:n.getFullYear(),m:n.getMonth()}); }} style={{padding:'5px 12px',borderRadius:8,background:T.surface,border:`1px solid ${T.border}`,cursor:'pointer',fontSize:12,color:T.text2,fontFamily:'inherit'}}>Today</button>
              {/* Mode toggle */}
              <div style={{display:'flex',background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:3,gap:2}}>
                {[['week','Week'],['month','Month'],['staff','Staff']].map(([k,l])=>(
                  <button key={k} onClick={()=>setCalMode(k)} style={{padding:'4px 12px',borderRadius:6,background:calMode===k?T.bg:'transparent',border:calMode===k?`1px solid ${T.border}`:'1px solid transparent',cursor:'pointer',fontSize:12,fontWeight:calMode===k?500:400,color:calMode===k?T.text:T.text2,fontFamily:'inherit',transition:'all 0.15s'}}>{l}</button>
                ))}
              </div>
              {calMode==='week'&&schedule&&(
                <div style={{marginLeft:'auto',display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                  <span style={{fontSize:12,color:T.text2}}>{stats?.filled||0} slots</span>
                  {stats?.missing>0&&<span style={{fontSize:12,color:T.danger,fontWeight:500,background:T.dangerLight,padding:'2px 10px',borderRadius:999,border:`1px solid ${T.danger}33`}}>{stats.missing} missing</span>}
                  {stats?.missing===0&&<span style={{fontSize:12,color:T.success,fontWeight:500,background:T.successLight,padding:'2px 10px',borderRadius:999,border:`1px solid ${T.success}33`}}>Full coverage ✓</span>}
                  <div style={{width:1,height:16,background:T.border,marginLeft:4}}/>
                  {confirmed
                    ? <span style={{fontSize:12,color:T.success,fontWeight:500,background:T.successLight,padding:'2px 10px',borderRadius:999,border:`1px solid ${T.success}33`,display:'inline-flex',alignItems:'center',gap:4}}>✓ Confirmed</span>
                    : <span style={{fontSize:12,color:T.text3,background:T.surfaceWarm,padding:'2px 10px',borderRadius:999,border:`1px solid ${T.border}`}}>Draft</span>
                  }
                  {confirmed
                    ? <Btn small variant="ghost" onClick={unconfirmSchedule}>Unconfirm</Btn>
                    : <Btn small variant="success" onClick={confirmSchedule}>Confirm schedule</Btn>
                  }
                  <Btn small variant="danger" onClick={deleteSchedule}>Delete</Btn>
                </div>
              )}
            </div>

            {/* Off this week */}
            {offThisWeek.length>0&&calMode!=='month'&&(
              <div style={{background:T.warningLight,border:`1px solid ${T.warning}33`,borderRadius:10,padding:'10px 14px',marginBottom:16,display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                <span style={{fontSize:13,color:T.warning}}>🌴</span>
                <span style={{fontSize:12,fontWeight:500,color:T.warning}}>On approved leave this week</span>
                <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>{offThisWeek.map(e=><EmpChip key={e.id} emp={e}/>)}</div>
              </div>
            )}

            {/* Swap hint */}
            {selected&&(
              <div style={{background:T.accentLight,border:`1px solid ${T.accent}44`,borderRadius:10,padding:'10px 14px',marginBottom:16,display:'flex',alignItems:'center',gap:10}}>
                <span style={{fontSize:16}}>✋</span>
                <span style={{fontSize:12,color:T.accentText}}><b>{selected.name}</b> selected — click another to swap, or a gap slot to move them.</span>
                <button onClick={()=>setSelected(null)} style={{marginLeft:'auto',padding:'4px 10px',borderRadius:6,background:'transparent',border:`1px solid ${T.accent}55`,color:T.accent,cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>Cancel</button>
              </div>
            )}

            {/* Confirmed banner */}
            {confirmed&&calMode!=='month'&&(
              <div style={{background:T.successLight,border:`1px solid ${T.success}44`,borderRadius:10,padding:'10px 16px',marginBottom:16,display:'flex',alignItems:'center',gap:10}}>
                <span style={{fontSize:15}}>✅</span>
                <div style={{flex:1}}>
                  <span style={{fontSize:12,fontWeight:600,color:T.success}}>Schedule confirmed</span>
                  <span style={{fontSize:12,color:T.success,marginLeft:8,opacity:0.8}}>This rota has been published to staff.</span>
                </div>
                <Btn small variant="ghost" onClick={unconfirmSchedule} style={{color:T.success}}>Unconfirm</Btn>
              </div>
            )}

            {/* Notes */}
            {notes&&<div style={{fontSize:12,color:T.text2,background:T.surfaceWarm,border:`1px solid ${T.border}`,borderRadius:10,padding:'10px 14px',marginBottom:16,display:'flex',gap:8}}><span>💡</span><span>{notes}</span></div>}
            {warnings.filter(w=>w.startsWith('⚠️')).map((w,i)=><div key={i} style={{fontSize:12,color:T.danger,background:T.dangerLight,border:`1px solid ${T.danger}33`,borderRadius:10,padding:'8px 14px',marginBottom:8}}>{w}</div>)}

            {/* ── MONTH VIEW ── */}
            {calMode==='month'&&(
              <div style={{...styles.card,padding:0,overflow:'hidden'}}>
                {/* Day headers */}
                <div style={{display:'grid',gridTemplateColumns:'48px repeat(7,1fr)',borderBottom:`1px solid ${T.border}`,background:T.surfaceWarm}}>
                  <div/>
                  {DAYS.map(d=><div key={d} style={{padding:'10px 4px',textAlign:'center',fontSize:11,fontWeight:600,color:T.text2,textTransform:'uppercase',letterSpacing:'0.06em'}}>{d}</div>)}
                </div>
                {monthOff.map(off=>{
                  const wd=getWeekDates(off),k=weekKey(off),ws=schedules[k]?.schedule||null,wConf=schedules[k]?.confirmed||false,isCur=off===weekOffset;
                  return (
                    <div key={off} style={{display:'grid',gridTemplateColumns:'48px repeat(7,1fr)',borderBottom:`1px solid ${T.border}`,background:isCur?T.accentLight:wConf?T.successLight+'88':'transparent',transition:'background 0.2s'}}>
                      <div style={{display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',gap:4,padding:'8px 4px',borderRight:`1px solid ${T.border}`}}>
                        {wConf&&<span style={{fontSize:9,color:T.success,fontWeight:600}}>✓</span>}
                        <button onClick={()=>{setWeekOffset(off);setCalMode('week');}} style={{fontSize:9,padding:'2px 6px',borderRadius:4,cursor:'pointer',border:`1px solid ${isCur?T.accent:T.border}`,background:isCur?T.accent:'transparent',color:isCur?'#fff':T.text3,fontFamily:'inherit'}}>view</button>
                        {!ws&&<button onClick={()=>generate(off)} style={{fontSize:9,padding:'2px 6px',borderRadius:4,cursor:'pointer',border:`1px solid ${T.accent}`,background:'transparent',color:T.accent,fontFamily:'inherit'}}>gen</button>}
                      </div>
                      {wd.map((d,di)=>{
                        const dayName=DAYS[di],inMonth=d.getMonth()===displayMonth.m&&d.getFullYear()===displayMonth.y;
                        const status=ws?dayCoverage(ws,blocks,dayName,allRoles):'empty',dot=coverageDot(status);
                        const empCount=ws?[...new Set(Object.values(ws[dayName]||{}).flatMap(a=>a.map(x=>x.empId)))].length:0;
                        const offCount=employees.filter(e=>isOnTimeOff(e.id,d,timeOff)).length;
                        return (
                          <div key={di} onClick={()=>{setWeekOffset(off);setCalMode('week');}}
                            style={{padding:'8px 6px',cursor:'pointer',borderRight:di<6?`1px solid ${T.border}`:'none',background:inMonth?dot.bg:'transparent',opacity:inMonth?1:0.35,transition:'opacity 0.1s',minHeight:60}}>
                            <div style={{fontSize:13,fontWeight:500,color:inMonth?dot.text:T.text3,marginBottom:2}}>{d.getDate()}</div>
                            {ws&&inMonth&&<div style={{fontSize:10,color:dot.text}}>{empCount} staff</div>}
                            {offCount>0&&inMonth&&<div style={{fontSize:10,color:T.warning}}>🌴 {offCount}</div>}
                            {!ws&&inMonth&&<div style={{fontSize:10,color:T.text3}}>—</div>}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
                {/* Legend + month actions */}
                <div style={{display:'flex',gap:16,padding:'12px 16px',background:T.surfaceWarm,alignItems:'center',flexWrap:'wrap'}}>
                  <span style={{fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em'}}>Coverage</span>
                  {[['full','Full'],['partial','Partial'],['low','Low'],['empty','Not generated']].map(([s,l])=>{ const d=coverageDot(s); return <div key={s} style={{display:'flex',alignItems:'center',gap:5}}><div style={{width:10,height:10,borderRadius:3,background:d.bg,border:`1px solid ${d.border}`}}/><span style={{fontSize:11,color:T.text2}}>{l}</span></div>; })}
                  {monthOff.some(off=>schedules[weekKey(off)])&&(
                    <>
                      <div style={{flex:1}}/>
                      <Btn small variant="danger" onClick={deleteMonth}>Delete whole month</Btn>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ── STAFF VIEW ── */}
            {calMode==='staff'&&(
              !schedule?(
                <div style={{...styles.card,textAlign:'center',padding:'64px 24px'}}>
                  <div style={{fontSize:40,marginBottom:16,opacity:0.3}}>📋</div>
                  <div style={{fontFamily:"'Fraunces',serif",fontSize:22,marginBottom:8}}>No rota for this week</div>
                  <div style={{fontSize:13,color:T.text2,marginBottom:6,maxWidth:340,margin:'0 auto 6px'}}>Generate a schedule first — the staff rota view shows each employee's shifts in a format you can share or print.</div>
                  <div style={{fontSize:12,color:T.text3,marginBottom:24}}>{employees.length} employees ready to schedule</div>
                  <Btn onClick={()=>generate()}>✦ Generate this week</Btn>
                </div>
              ):(
                <div>
                  {/* Rota header — printable feel */}
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:10}}>
                    <div>
                      <div style={{fontFamily:"'Fraunces',serif",fontSize:22,fontWeight:500,color:T.text}}>Weekly Rota</div>
                      <div style={{fontSize:13,color:T.text2,marginTop:2}}>{fmt(weekDates[0])} – {fmt(weekDates[6])} · {employees.length} staff</div>
                    </div>
                    <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                      {allRoles.filter(r=>employees.some(e=>(e.roles||['Other']).includes(r))).map(r=><RoleBadge key={r} role={r}/>)}
                      <div style={{width:1,height:16,background:T.border}}/>
                      {confirmed
                        ?<span style={{fontSize:12,color:T.success,fontWeight:500,background:T.successLight,padding:'2px 10px',borderRadius:999,border:`1px solid ${T.success}33`,display:'inline-flex',alignItems:'center',gap:4}}>✓ Confirmed</span>
                        :<span style={{fontSize:12,color:T.text3,background:T.surfaceWarm,padding:'2px 10px',borderRadius:999,border:`1px solid ${T.border}`}}>Draft</span>
                      }
                      {!confirmed&&<Btn small onClick={confirmSchedule}>Confirm schedule</Btn>}
                      <Btn small variant="danger" onClick={deleteSchedule}>Delete</Btn>
                    </div>
                  </div>

                  {/* Employee cards — one per person */}
                  <div style={{display:'flex',flexDirection:'column',gap:8}}>
                    {employees.map(emp=>{
                      const h=empHours(emp.id);
                      const p=pal(emp);
                      const primaryRole=(emp.roles||['Other'])[0]; const rs=roleStyles[primaryRole]||{dot:'#9C9088',bg:'#F2F1EF',text:'#5C5248',border:'#C8C4BE'};
                      const worksThisWeek=DAYS.some(day=>!isOnTimeOff(emp.id,weekDates[DAYS.indexOf(day)],timeOff)&&blocks.some(b=>(schedule[day]?.[b.id]||[]).some(a=>a.empId===emp.id)));

                      return (
                        <div key={emp.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,overflow:'hidden',boxShadow:'0 1px 3px rgba(28,24,21,0.05)',opacity:!worksThisWeek&&!DAYS.some(d=>isOnTimeOff(emp.id,weekDates[DAYS.indexOf(d)],timeOff))?0.55:1}}>
                          {/* Employee header strip */}
                          <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',background:`linear-gradient(to right, ${p.bg}, ${T.surface})`,borderBottom:`1px solid ${T.border}`}}>
                            <Avatar emp={emp} size={36}/>
                            <div style={{flex:1}}>
                              <div style={{fontSize:14,fontWeight:600,color:T.text}}>{emp.name}</div>
                              <>{(emp.roles||['Other']).map(r=><RoleBadge key={r} role={r}/>)}</>
                            </div>
                            {/* Hours pill */}
                            <div style={{textAlign:'right'}}>
                              <div style={{fontSize:13,fontWeight:600,color:h>emp.maxHours?T.danger:h===0?T.text3:T.text}}>{h}h</div>
                              <div style={{fontSize:10,color:T.text3}}>of {emp.maxHours}h max</div>
                            </div>
                            {/* Mini hours bar */}
                            <div style={{width:60,height:5,borderRadius:999,background:T.border,overflow:'hidden'}}>
                              <div style={{height:'100%',width:`${Math.min(100,(h/emp.maxHours)*100)}%`,borderRadius:999,background:h>emp.maxHours?T.danger:h/emp.maxHours>0.8?T.warning:T.success,transition:'width 0.3s'}}/>
                            </div>
                          </div>

                          {/* Day cells */}
                          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)'}}>
                            {DAYS.map((day,di)=>{
                              const date=weekDates[di];
                              const onTO=isOnTimeOff(emp.id,date,timeOff);
                              const assignedBlock=blocks.find(b=>(schedule[day]?.[b.id]||[]).some(a=>a.empId===emp.id));
                              const assignedEntry=assignedBlock?(schedule[day][assignedBlock.id]||[]).find(a=>a.empId===emp.id):null;
                              const isWeekend=di>=5;

                              return (
                                <div key={day} style={{padding:'10px 10px',borderRight:di<6?`1px solid ${T.border}`:'none',background:isWeekend?T.surfaceWarm:'transparent',minHeight:72,display:'flex',flexDirection:'column',gap:3}}>
                                  {/* Day label */}
                                  <div style={{fontSize:10,fontWeight:600,color:isWeekend?T.text2:T.text3,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:2}}>
                                    {day}
                                    <span style={{fontWeight:400,marginLeft:4}}>{date.getDate()}</span>
                                  </div>

                                  {onTO?(
                                    <div style={{flex:1,display:'flex',alignItems:'center'}}>
                                      <span style={{fontSize:11,color:T.warning,fontWeight:500}}>🌴 Leave</span>
                                    </div>
                                  ):assignedBlock?(
                                    <div style={{flex:1,display:'flex',flexDirection:'column',gap:2}}>
                                      {/* Block name with colour dot */}
                                      <div style={{display:'flex',alignItems:'center',gap:4}}>
                                        <div style={{width:6,height:6,borderRadius:'50%',background:rs.dot,flexShrink:0}}/>
                                        <span style={{fontSize:12,fontWeight:600,color:T.text}}>{assignedBlock.name}</span>
                                      </div>
                                      <div style={{fontSize:11,color:T.text2}}>{assignedBlock.start} – {assignedBlock.end}</div>
                                      <div style={{fontSize:10,color:T.text3}}>{blockHours(assignedBlock).toFixed(1)}h</div>
                                    </div>
                                  ):(
                                    <div style={{flex:1,display:'flex',alignItems:'center'}}>
                                      <span style={{fontSize:12,color:T.border,userSelect:'none'}}>—</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Totals footer */}
                  <div style={{marginTop:16,padding:'12px 16px',background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,display:'flex',gap:20,flexWrap:'wrap',alignItems:'center'}}>
                    <span style={{fontSize:11,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em'}}>Week summary</span>
                    <span style={{fontSize:12,color:T.text2}}><b style={{color:T.text}}>{employees.reduce((acc,e)=>acc+empHours(e.id),0)}h</b> total hours scheduled</span>
                    <span style={{fontSize:12,color:T.text2}}><b style={{color:T.text}}>{employees.filter(e=>empHours(e.id)>0).length}</b> of {employees.length} staff working</span>
                    {offThisWeek.length>0&&<span style={{fontSize:12,color:T.warning}}><b>{offThisWeek.length}</b> on approved leave</span>}
                  </div>
                </div>
              )
            )}

            {/* ── WEEK VIEW ── */}
            {calMode==='week'&&(
              !schedule?(
                <div style={{...styles.card,padding:'52px 32px',textAlign:'center',position:'relative',overflow:'hidden'}}>
                  <div style={{position:'absolute',inset:0,backgroundImage:`radial-gradient(circle, ${T.border} 1px, transparent 1px)`,backgroundSize:'24px 24px',opacity:0.5,pointerEvents:'none'}}/>
                  <div style={{position:'relative'}}>
                    <div style={{fontSize:40,marginBottom:16,opacity:0.25}}>📅</div>
                    <div style={{fontFamily:"'Fraunces',serif",fontSize:22,fontWeight:500,color:T.text,marginBottom:8}}>Nothing scheduled yet</div>
                    <div style={{fontSize:13,color:T.text2,maxWidth:380,margin:'0 auto 6px'}}>
                      {employees.length} employees across {blocks.length} coverage block{blocks.length!==1?'s':''}.{offThisWeek.length>0?` ${offThisWeek.length} on leave this week.`:''}
                    </div>
                    <div style={{fontSize:12,color:T.text3,marginBottom:28,marginTop:4}}>Availability, hours caps, roles and approved leave are all respected.</div>
                    <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap'}}>
                      <Btn onClick={()=>generate()}>✦ Generate this week</Btn>
                      <Btn onClick={generateMonth} variant="secondary">Generate whole month</Btn>
                    </div>
                  </div>
                </div>
              ):(
                <div style={{display:'flex',flexDirection:'column',gap:16}}>
                  {blocks.map(block=>(
                    <div key={block.id} style={styles.cardFlush}>
                      {/* Block header */}
                      <div style={{padding:'12px 20px',borderBottom:`1px solid ${T.border}`,background:T.surfaceWarm,display:'flex',alignItems:'center',gap:12}}>
                        <div style={{flex:1}}>
                          <span style={{fontFamily:"'Fraunces',serif",fontSize:15,fontWeight:500,color:T.text}}>{block.name}</span>
                          <span style={{fontSize:12,color:T.text3,marginLeft:10}}>{block.start} – {block.end} · {blockHours(block).toFixed(1)}h</span>
                        </div>
                        <span style={{fontSize:10,color:T.success,background:T.successLight,border:`1px solid ${T.success}33`,padding:'2px 8px',borderRadius:999,fontWeight:500}}>Manager enforced</span>
                      </div>
                      {/* Table */}
                      <div style={{overflowX:'auto'}}>
                        <table style={{width:'100%',borderCollapse:'collapse',minWidth:580}}>
                          <thead>
                            <tr>
                              <th style={{width:90,textAlign:'left',padding:'10px 20px',fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em',background:T.surfaceWarm,borderBottom:`1px solid ${T.border}`}}>Role</th>
                              {DAYS.map((day,i)=><th key={day} style={{textAlign:'left',padding:'10px 10px',fontSize:11,fontWeight:500,color:T.text,background:T.surfaceWarm,borderBottom:`1px solid ${T.border}`}}>{day}<div style={{fontSize:10,fontWeight:400,color:T.text3}}>{fmt(weekDates[i])}</div></th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {allRoles.map(role=>{
                              const anyDay=DAYS.some(day=>{const r=getBlockRoles(block,day)[role]||0,g=(schedule[day]?.[block.id]||[]).filter(a=>a.role===role).length;return r>0||g>0;});
                              if(!anyDay) return null;
                              const rs=roleStyles[role]||{dot:'#9C9088',bg:'#F2F1EF',text:'#5C5248',border:'#C8C4BE'};
                              return (
                                <tr key={role} style={{borderBottom:`1px solid ${T.border}`}}>
                                  <td style={{padding:'10px 20px',verticalAlign:'top',background:T.surface}}>
                                    <RoleBadge role={role} rs={roleStyles[role]}/>
                                  </td>
                                  {DAYS.map(day=>{
                                    const allA=schedule[day]?.[block.id]||[];
                                    const assigned=allA.filter(a=>a.role===role);
                                    const req=getBlockRoles(block,day)[role]||0;
                                    const gap=Math.max(0,req-assigned.length);
                                    const isTarget=selected&&selected.role===role&&selected.day!==day;
                                    return (
                                      <td key={day} style={{padding:'8px 10px',verticalAlign:'top',borderLeft:`1px solid ${T.border}`,background:T.surface}}>
                                        <div style={{display:'flex',flexDirection:'column',gap:3}}>
                                          {assigned.map((a,idx)=>{
                                            const emp=employees.find(e=>e.id===a.empId);
                                            const realIdx=allA.findIndex(x=>x.empId===a.empId);
                                            const isSel=selected?.empId===a.empId&&selected?.day===day&&selected?.blockId===block.id;
                                            return <EmpChip key={idx} emp={emp||{name:a.name,palIdx:0}} selected={isSel} onClick={()=>handleSlotClick(day,block.id,a,realIdx)}/>;
                                          })}
                                          {gap>0&&(
                                            <div style={{position:'relative'}}>
                                              <button onClick={()=>{
                                                if(selected&&isTarget){ handleEmptySlotClick(day,block.id,role); return; }
                                                if(!selected){
                                                  const key=`${day}-${block.id}-${role}`;
                                                  setOpenPicker(p=>p&&p.day===day&&p.blockId===block.id&&p.role===role?null:{day,blockId:block.id,role});
                                                }
                                              }}
                                                style={{display:'inline-flex',alignItems:'center',gap:3,padding:'2px 7px',borderRadius:999,fontSize:10,fontWeight:500,background:isTarget?T.successLight:T.dangerLight,color:isTarget?T.success:T.danger,border:`1px dashed ${isTarget?T.success:T.danger}55`,cursor:'pointer',fontFamily:'inherit'}}>
                                                {isTarget?'+ move here':`−${gap} short`}
                                              </button>
                                              {/* Slot picker */}
                                              {!selected&&openPicker?.day===day&&openPicker?.blockId===block.id&&openPicker?.role===role&&(()=>{
                                                const eligible=eligibleForSlot(day,block.id,role);
                                                return (
                                                  <div style={{position:'absolute',top:'100%',left:0,marginTop:4,background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,boxShadow:'0 4px 16px rgba(28,24,21,0.12)',zIndex:200,minWidth:180,maxWidth:240,padding:8}}>
                                                    <div style={{fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em',padding:'2px 4px 6px'}}>
                                                      Add {role} — {day}
                                                    </div>
                                                    {eligible.length===0?(
                                                      <div style={{fontSize:11,color:T.text3,padding:'6px 4px',fontStyle:'italic'}}>No one available for this slot</div>
                                                    ):eligible.map(emp=>{
                                                      const p=pal(emp);
                                                      const h=empHours(emp.id);
                                                      return (
                                                        <button key={emp.id} onClick={()=>addToSlot(day,block.id,role,emp)}
                                                          style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'6px 8px',borderRadius:7,background:'transparent',border:'none',cursor:'pointer',fontFamily:'inherit',textAlign:'left',transition:'background 0.1s'}}
                                                          onMouseEnter={e=>e.currentTarget.style.background=T.surfaceWarm}
                                                          onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                                                          <div style={{width:24,height:24,borderRadius:'50%',background:p.bg,color:p.text,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,flexShrink:0}}>{initials(emp.name)}</div>
                                                          <div style={{flex:1,minWidth:0}}>
                                                            <div style={{fontSize:12,fontWeight:500,color:T.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{emp.name}</div>
                                                            <div style={{fontSize:10,color:T.text3}}>{h}h / {emp.maxHours}h · {emp.salaryPct}%</div>
                                                          </div>
                                                        </button>
                                                      );
                                                    })}
                                                    <div style={{borderTop:`1px solid ${T.border}`,marginTop:4,paddingTop:4}}>
                                                      <button onClick={()=>setOpenPicker(null)} style={{display:'block',width:'100%',padding:'4px 8px',borderRadius:6,background:'transparent',border:'none',cursor:'pointer',fontSize:11,color:T.text3,textAlign:'left',fontFamily:'inherit'}}>Cancel</button>
                                                    </div>
                                                  </div>
                                                );
                                              })()}
                                            </div>
                                          )}
                                          {req===0&&assigned.length===0&&<span style={{fontSize:11,color:T.text3}}>—</span>}
                                        </div>
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}

                  {/* Hours panel */}
                  <div style={styles.card}>
                    <div style={{fontFamily:"'Fraunces',serif",fontSize:15,fontWeight:500,marginBottom:14}}>Weekly Hours</div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:10}}>
                      {employees.map(emp=>{
                        const h=empHours(emp.id),pct=Math.min(100,(h/emp.maxHours)*100),over=h>emp.maxHours,p=pal(emp);
                        return (
                          <div key={emp.id} style={{padding:'10px 12px',borderRadius:10,border:`1px solid ${over?T.danger+'55':T.border}`,background:over?T.dangerLight:T.surfaceWarm}}>
                            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
                              <Avatar emp={emp} size={24}/>
                              <span style={{fontSize:12,fontWeight:500,color:T.text}}>{emp.name.split(' ')[0]}</span>
                            </div>
                            <div style={{fontSize:11,color:T.text3,marginBottom:5,display:'flex',gap:3,flexWrap:'wrap'}}>{(emp.roles||['Other']).map(r=><RoleBadge key={r} role={r}/>)}</div>
                            <div style={{fontSize:13,fontWeight:500,color:over?T.danger:T.text,marginBottom:4}}>{h}h <span style={{fontSize:11,color:T.text3,fontWeight:400}}>/ {emp.maxHours}h</span></div>
                            <div style={{height:3,borderRadius:999,background:T.border,overflow:'hidden'}}>
                              <div style={{height:'100%',width:`${pct}%`,borderRadius:999,background:over?T.danger:pct>80?T.warning:T.success,transition:'width 0.4s'}}/>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {/* ══ EMPLOYEES ══ */}
        {view==='employees'&&(
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {employees.map(emp=>(
              <div key={emp.id} style={styles.card}>
                <div style={{display:'flex',alignItems:'center',gap:12}}>
                  <Avatar emp={emp} size={40}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:500,display:'flex',alignItems:'center',gap:8,marginBottom:3,flexWrap:'wrap'}}>{emp.name}{(emp.roles||['Other']).map(r=><RoleBadge key={r} role={r}/>)}</div>
                    <div style={{fontSize:12,color:T.text2}}>{emp.salaryPct}% salary · max {emp.maxHours}h/week</div>
                  </div>
                  <div style={{display:'flex',gap:6}}>
                    <Btn onClick={()=>duplicateEmp(emp)} variant="ghost" small>⧉ Clone</Btn>
                    <Btn onClick={()=>setExpandedEmp(expandedEmp===emp.id?null:emp.id)} variant={expandedEmp===emp.id?'secondary':'ghost'} small>{expandedEmp===emp.id?'Close':'Edit'}</Btn>
                    <Btn onClick={()=>removeEmp(emp.id)} variant="danger" small>✕</Btn>
                  </div>
                </div>

                {expandedEmp===emp.id&&(
                  <div style={{marginTop:18,paddingTop:18,borderTop:`1px solid ${T.border}`}}>
                    <div style={{display:'flex',gap:10,marginBottom:14,flexWrap:'wrap'}}>
                      <div style={{flex:'2 1 120px'}}><SectionLabel>Name</SectionLabel><input value={emp.name} onChange={e=>updateEmp(emp.id,'name',e.target.value)} style={styles.input}/></div>
                      <div style={{flex:'2 1 160px'}}><SectionLabel>Roles (select all that apply)</SectionLabel><div style={{display:'flex',gap:5,flexWrap:'wrap',marginTop:4}}>{allRoles.map(r=>{ const active=(emp.roles||['Other']).includes(r); const rs=roleStyles[r]||{dot:'#9C9088',bg:'#F2F1EF',text:'#5C5248',border:'#C8C4BE'}; return <button key={r} onClick={()=>{ const cur=emp.roles||[]; const next=active?cur.filter(x=>x!==r):[...cur,r]; if(next.length>0) updateEmp(emp.id,'roles',next); }} style={{display:'inline-flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:999,fontSize:11,fontWeight:500,background:active?rs.bg:'transparent',color:active?rs.text:T.text3,border:`1px solid ${active?rs.border:T.border}`,cursor:'pointer',fontFamily:'inherit',transition:'all 0.15s'}}><span style={{width:5,height:5,borderRadius:'50%',background:active?rs.dot:T.text3}}/>{r}</button>; })}</div></div>
                      <div style={{flex:'1 1 70px'}}><SectionLabel>Salary %</SectionLabel><input type="number" min="10" max="200" step="5" value={emp.salaryPct} onChange={e=>updateEmp(emp.id,'salaryPct',Number(e.target.value))} style={styles.input}/></div>
                      <div style={{flex:'1 1 70px'}}><SectionLabel>Max h/week</SectionLabel><input type="number" min="4" max="60" value={emp.maxHours} onChange={e=>updateEmp(emp.id,'maxHours',Number(e.target.value))} style={styles.input}/></div>
                    </div>
                    <div style={{marginBottom:14}}>
                      <SectionLabel>Quick templates</SectionLabel>
                      <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:4}}>
                        {Object.keys(AVAIL_TEMPLATES).map(tpl=><button key={tpl} onClick={()=>applyTemplate(emp.id,tpl)} style={{padding:'4px 10px',borderRadius:6,fontSize:11,cursor:'pointer',background:T.surfaceWarm,border:`1px solid ${T.border}`,color:T.text2,fontFamily:'inherit'}}>{tpl}</button>)}
                      </div>
                    </div>
                    <SectionLabel>Weekly availability</SectionLabel>
                    <div style={{display:'flex',flexDirection:'column',gap:6,marginTop:6}}>
                      {DAYS.map(day=>{ const avail=emp.availability[day],p=pal(emp); return (
                        <div key={day} style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                          <button onClick={()=>toggleDay(emp.id,day)} style={{width:46,padding:'4px 0',borderRadius:6,fontSize:11,fontWeight:500,cursor:'pointer',background:avail?p.bg:'transparent',color:avail?p.text:T.text3,border:`1px solid ${avail?p.dot+'55':T.border}`,textAlign:'center',fontFamily:'inherit',transition:'all 0.15s'}}>{day}</button>
                          {avail?(<><span style={{fontSize:11,color:T.text3}}>From</span><input type="time" value={avail.from} onChange={e=>updateAvail(emp.id,day,'from',e.target.value)} style={{...styles.input,width:'auto',padding:'4px 8px',fontSize:12}}/><span style={{fontSize:11,color:T.text3}}>to</span><input type="time" value={avail.to} onChange={e=>updateAvail(emp.id,day,'to',e.target.value)} style={{...styles.input,width:'auto',padding:'4px 8px',fontSize:12}}/><span style={{fontSize:11,color:T.text3}}>{(()=>{ const s=toMin(avail.from); let e=toMin(avail.to); if(e<=s) e+=1440; return `${((e-s)/60).toFixed(1)}h`; })()}</span></>):(<span style={{fontSize:11,color:T.text3}}>Not available</span>)}
                        </div>
                      ); })}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {showAddEmp&&(
              <div style={styles.card}>
                <div style={{fontFamily:"'Fraunces',serif",fontSize:15,fontWeight:500,marginBottom:14}}>New employee</div>
                <div style={{display:'flex',gap:10,marginBottom:12,flexWrap:'wrap'}}>
                  <input placeholder="Full name" value={newEmp.name} onChange={e=>setNewEmp(p=>({...p,name:e.target.value}))} style={{...styles.input,flex:'2 1 130px'}}/>
                  <div style={{flex:'2 1 200px'}}><div style={{fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Roles</div><div style={{display:'flex',gap:4,flexWrap:'wrap'}}>{allRoles.map(r=>{ const active=newEmp.roles.includes(r); const rs=roleStyles[r]||{dot:'#9C9088',bg:'#F2F1EF',text:'#5C5248',border:'#C8C4BE'}; return <button key={r} onClick={()=>{ const cur=newEmp.roles||[]; const next=active?cur.filter(x=>x!==r):[...cur,r]; if(next.length>0) setNewEmp(p=>({...p,roles:next})); }} style={{display:'inline-flex',alignItems:'center',gap:4,padding:'4px 9px',borderRadius:999,fontSize:11,fontWeight:500,background:active?rs.bg:'transparent',color:active?rs.text:T.text3,border:`1px solid ${active?rs.border:T.border}`,cursor:'pointer',fontFamily:'inherit'}}><span style={{width:5,height:5,borderRadius:'50%',background:active?rs.dot:T.text3}}/>{r}</button>; })}</div></div>
                  <input type="number" placeholder="Salary %" min="10" max="200" step="5" value={newEmp.salaryPct} onChange={e=>setNewEmp(p=>({...p,salaryPct:Number(e.target.value)}))} style={{...styles.input,flex:'1 1 80px'}}/>
                  <input type="number" placeholder="Max h/wk" min="4" max="60" value={newEmp.maxHours} onChange={e=>setNewEmp(p=>({...p,maxHours:Number(e.target.value)}))} style={{...styles.input,flex:'1 1 70px'}}/>
                </div>
                <div style={{display:'flex',gap:8}}><Btn onClick={addEmployee}>Add employee</Btn><Btn onClick={()=>setShowAddEmp(false)} variant="ghost">Cancel</Btn></div>
              </div>
            )}
            {!showAddEmp&&<Btn onClick={()=>setShowAddEmp(true)} variant="secondary">+ Add employee</Btn>}
          </div>
        )}

        {/* ══ TIME OFF ══ */}
        {view==='timeoff'&&(
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            {offThisWeek.length>0&&(
              <div style={{background:T.warningLight,border:`1px solid ${T.warning}33`,borderRadius:10,padding:'12px 16px'}}>
                <div style={{fontSize:12,fontWeight:600,color:T.warning,marginBottom:8}}>🌴 On approved leave this week ({fmt(weekDates[0])} – {fmt(weekDates[6])})</div>
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{offThisWeek.map(e=><EmpChip key={e.id} emp={e}/>)}</div>
              </div>
            )}

            <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
              <div style={{display:'flex',background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:3,gap:2}}>
                {[['all','All'],['pending','Pending'],['approved','Approved'],['this-week','This week']].map(([k,l])=>(
                  <button key={k} onClick={()=>setToFilter(k)} style={{padding:'4px 10px',borderRadius:6,background:toFilter===k?T.bg:'transparent',border:toFilter===k?`1px solid ${T.border}`:'1px solid transparent',cursor:'pointer',fontSize:12,fontWeight:toFilter===k?500:400,color:toFilter===k?T.text:T.text2,fontFamily:'inherit'}}>{l}</button>
                ))}
              </div>
              <div style={{marginLeft:'auto'}}><Btn onClick={()=>setShowAddTO(true)}>+ Add request</Btn></div>
            </div>

            {showAddTO&&(
              <div style={styles.card}>
                <div style={{fontFamily:"'Fraunces',serif",fontSize:15,fontWeight:500,marginBottom:14}}>New time-off request</div>
                <div style={{display:'flex',gap:10,marginBottom:12,flexWrap:'wrap'}}>
                  <div style={{flex:'2 1 140px'}}><SectionLabel>Employee</SectionLabel><select value={newTO.empId} onChange={e=>setNewTO(p=>({...p,empId:e.target.value}))} style={styles.select}><option value="">Select…</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
                  <div style={{flex:'1 1 120px'}}><SectionLabel>From</SectionLabel><input type="date" value={newTO.startDate} onChange={e=>setNewTO(p=>({...p,startDate:e.target.value}))} style={styles.input}/></div>
                  <div style={{flex:'1 1 120px'}}><SectionLabel>To</SectionLabel><input type="date" value={newTO.endDate} onChange={e=>setNewTO(p=>({...p,endDate:e.target.value}))} style={styles.input}/></div>
                  <div style={{flex:'1 1 100px'}}><SectionLabel>Type</SectionLabel><select value={newTO.type} onChange={e=>setNewTO(p=>({...p,type:e.target.value}))} style={styles.select}>{TIMEOFF_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
                  <div style={{flex:'2 1 140px'}}><SectionLabel>Note</SectionLabel><input placeholder="Optional" value={newTO.note} onChange={e=>setNewTO(p=>({...p,note:e.target.value}))} style={styles.input}/></div>
                  <div style={{flex:'1 1 100px'}}><SectionLabel>Status</SectionLabel><select value={newTO.status} onChange={e=>setNewTO(p=>({...p,status:e.target.value}))} style={styles.select}><option>Pending</option><option>Approved</option></select></div>
                </div>
                <div style={{display:'flex',gap:8}}><Btn onClick={addTO}>Save request</Btn><Btn onClick={()=>setShowAddTO(false)} variant="ghost">Cancel</Btn></div>
              </div>
            )}

            {filteredTO.length===0?(
              <div style={{...styles.card,textAlign:'center',padding:'44px 32px',position:'relative',overflow:'hidden'}}>
                <div style={{position:'absolute',inset:0,backgroundImage:`radial-gradient(circle, ${T.border} 1px, transparent 1px)`,backgroundSize:'24px 24px',opacity:0.4,pointerEvents:'none'}}/>
                <div style={{position:'relative'}}>
                  <div style={{fontSize:36,marginBottom:12,opacity:0.25}}>🌴</div>
                  <div style={{fontFamily:"'Fraunces',serif",fontSize:18,color:T.text,marginBottom:6}}>
                    {toFilter==='all'?'No time-off requests yet':`No ${toFilter} requests`}
                  </div>
                  <div style={{fontSize:12,color:T.text2,maxWidth:300,margin:'0 auto 20px'}}>
                    {toFilter==='all'?'Add holiday, sick leave or personal time off for your team. Approved requests are automatically excluded from scheduling.':'Try switching the filter or add a new request.'}
                  </div>
                  {toFilter==='all'&&<Btn onClick={()=>setShowAddTO(true)}>+ Add first request</Btn>}
                </div>
              </div>
            ):filteredTO.map(t=>{
              const emp=employees.find(e=>e.id===t.empId);
              const days=Math.round((new Date(t.endDate)-new Date(t.startDate))/(24*3600*1000))+1;
              const borderColor={Approved:T.success,Pending:T.warning,Rejected:T.danger}[t.status]||T.border;
              return (
                <div key={t.id} style={{...styles.card,borderLeft:`3px solid ${borderColor}`,padding:'14px 18px',display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
                  {emp&&<Avatar emp={emp} size={38}/>}
                  <div style={{flex:1,minWidth:140}}>
                    <div style={{fontSize:13,fontWeight:500,marginBottom:3}}>{emp?.name||'Unknown'}</div>
                    <div style={{fontSize:12,color:T.text2}}>{fmtLong(t.startDate)} – {fmtLong(t.endDate)} · <b>{days}</b> day{days!==1?'s':''}</div>
                    <div style={{display:'flex',gap:6,marginTop:4,alignItems:'center'}}>
                      <span style={{fontSize:11,color:T.text3,background:T.bg,padding:'1px 7px',borderRadius:999,border:`1px solid ${T.border}`}}>{t.type}</span>
                      {t.note&&<span style={{fontSize:11,color:T.text3,fontStyle:'italic'}}>"{t.note}"</span>}
                    </div>
                  </div>
                  <StatusBadge status={t.status}/>
                  <div style={{display:'flex',gap:6}}>
                    {t.status!=='Approved'&&<Btn onClick={()=>updateTOStatus(t.id,'Approved')} variant="success" small>Approve</Btn>}
                    {t.status!=='Rejected'&&<Btn onClick={()=>updateTOStatus(t.id,'Rejected')} variant="danger" small>Reject</Btn>}
                    {t.status==='Rejected'&&<Btn onClick={()=>updateTOStatus(t.id,'Pending')} variant="ghost" small>Reset</Btn>}
                    <Btn onClick={()=>removeTO(t.id)} variant="ghost" small>✕</Btn>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ══ COVERAGE ══ */}
        {view==='coverage'&&(
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            {/* ── Role Management ── */}
            <div style={styles.card}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
                <div style={{flex:1}}>
                  <div style={{fontFamily:"'Fraunces',serif",fontSize:15,fontWeight:500}}>Roles</div>
                  <div style={{fontSize:12,color:T.text2,marginTop:2}}>Define the roles at your workplace. Manager cannot be removed.</div>
                </div>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {allRoles.map(role=>{
                  const rs=roleStyles[role]||{dot:'#9C9088',bg:'#F2F1EF',text:'#5C5248',border:'#C8C4BE'};
                  const isProtected=role==='Manager';
                  const isEditing=editingRole?.name===role;
                  const isDeleting=confirmDelete===role;

                  if(isEditing){
                    return (
                      <div key={role} style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',padding:'10px 12px',borderRadius:10,background:T.surfaceWarm,border:`1px solid ${T.border}`}}>
                        <input autoFocus value={editingRole.newName} onChange={e=>setEditingRole(p=>({...p,newName:e.target.value}))}
                          style={{...styles.input,width:130,flex:'0 0 auto'}} placeholder="Role name"/>
                        <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                          {ROLE_COLOR_PALETTE.map((pal,i)=>(
                            <button key={i} onClick={()=>setEditingRole(p=>({...p,colorIdx:i}))}
                              style={{width:20,height:20,borderRadius:'50%',background:pal.dot,border:editingRole.colorIdx===i?`2px solid ${T.text}`:`2px solid transparent`,cursor:'pointer',padding:0,transition:'border 0.15s'}}/>
                          ))}
                        </div>
                        <div style={{display:'flex',gap:6,marginLeft:'auto'}}>
                          <Btn small onClick={()=>{
                            const {name,newName,colorIdx}=editingRole;
                            if(!newName.trim()) return;
                            const newStyle=ROLE_COLOR_PALETTE[colorIdx];
                            if(newName!==name){
                              // Rename: update roleStyles, employees, blocks
                              setRoleStyles(p=>{ const next={...p}; delete next[name]; return {...next,[newName]:newStyle}; });
                              setEmployees(p=>p.map(e=>({...e,roles:(e.roles||['Other']).map(r=>r===name?newName:r)})));
                              setBlocks(p=>p.map(b=>{ const nr={...b.roles}; const val=nr[name]||0; delete nr[name]; return {...b,roles:{...nr,[newName]:val}}; }));
                            } else {
                              setRoleStyles(p=>({...p,[name]:newStyle}));
                            }
                            setEditingRole(null);
                          }}>Save</Btn>
                          <Btn small variant="ghost" onClick={()=>setEditingRole(null)}>Cancel</Btn>
                        </div>
                      </div>
                    );
                  }

                  if(isDeleting){
                    return (
                      <div key={role} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:10,background:T.dangerLight,border:`1px solid ${T.danger}33`}}>
                        <span style={{fontSize:12,color:T.danger,flex:1}}>Remove <b>{role}</b>? This will remove it from all employees and coverage blocks.</span>
                        <Btn small variant="danger" onClick={()=>{
                          setRoleStyles(p=>{ const next={...p}; delete next[role]; return next; });
                          setEmployees(p=>p.map(e=>({...e,roles:(e.roles||['Other']).filter(r=>r!==role)})));
                          setBlocks(p=>p.map(b=>{ const nr={...b.roles}; delete nr[role]; return {...b,roles:nr}; }));
                          setConfirmDelete(null);
                        }}>Yes, remove</Btn>
                        <Btn small variant="ghost" onClick={()=>setConfirmDelete(null)}>Cancel</Btn>
                      </div>
                    );
                  }

                  return (
                    <div key={role} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',borderRadius:10,background:T.surfaceWarm,border:`1px solid ${T.border}`}}>
                      <div style={{width:10,height:10,borderRadius:'50%',background:rs.dot,flexShrink:0}}/>
                      <span style={{fontSize:13,fontWeight:500,color:T.text,flex:1}}>{role}</span>
                      {isProtected&&<span style={{fontSize:11,color:T.text3,fontStyle:'italic'}}>protected</span>}
                      {!isProtected&&(
                        <div style={{display:'flex',gap:4}}>
                          <Btn small variant="ghost" onClick={()=>{
                            const colorIdx=ROLE_COLOR_PALETTE.findIndex(p=>p.dot===rs.dot);
                            setEditingRole({name:role,newName:role,colorIdx:colorIdx>=0?colorIdx:0});
                          }}>Edit</Btn>
                          <Btn small variant="danger" onClick={()=>setConfirmDelete(role)}>Remove</Btn>
                        </div>
                      )}
                      {isProtected&&(
                        <Btn small variant="ghost" onClick={()=>{
                          const colorIdx=ROLE_COLOR_PALETTE.findIndex(p=>p.dot===rs.dot);
                          setEditingRole({name:role,newName:role,colorIdx:colorIdx>=0?colorIdx:0});
                        }}>Edit colour</Btn>
                      )}
                    </div>
                  );
                })}
                {/* Add new role */}
                <AddRoleInline onAdd={(name)=>{
                  if(!name.trim()||roleStyles[name]) return;
                  const idx=Object.keys(roleStyles).length%ROLE_COLOR_PALETTE.length;
                  setRoleStyles(p=>({...p,[name]:ROLE_COLOR_PALETTE[idx]}));
                }}/>
              </div>
            </div>

            <div style={{fontSize:13,color:T.text2,background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:'12px 16px'}}>
              Define coverage blocks — time windows with required staffing per role. A manager is automatically added to every block that has any staff.
            </div>
            {blocks.map(block=>{
              const overrides = block.overrides||{};
              const daysWithOverride = DAYS.filter(d=>overrides[d]);

              const updateDefaultRole=(role,val)=>setBlocks(p=>p.map(b=>b.id===block.id?{...b,roles:{...b.roles,[role]:Math.max(0,Number(val))}}:b));
              const updateOverrideRole=(day,role,val)=>setBlocks(p=>p.map(b=>{
                if(b.id!==block.id) return b;
                const ov={...b.overrides||{}};
                ov[day]={...(ov[day]||{...b.roles}),[role]:Math.max(0,Number(val))};
                return {...b,overrides:ov};
              }));
              const addDayOverride=(day)=>setBlocks(p=>p.map(b=>{
                if(b.id!==block.id) return b;
                const ov={...b.overrides||{}};
                ov[day]={...b.roles}; // copy defaults as starting point
                return {...b,overrides:ov};
              }));
              const removeDayOverride=(day)=>setBlocks(p=>p.map(b=>{
                if(b.id!==block.id) return b;
                const ov={...b.overrides||{}};
                delete ov[day];
                return {...b,overrides:Object.keys(ov).length?ov:undefined};
              }));

              return (
              <div key={block.id} style={styles.card}>
                {/* Block header */}
                <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap',alignItems:'flex-end'}}>
                  <div style={{flex:'2 1 100px'}}><SectionLabel>Block name</SectionLabel><input value={block.name} onChange={e=>setBlocks(p=>p.map(b=>b.id===block.id?{...b,name:e.target.value}:b))} style={styles.input}/></div>
                  <div style={{flex:'1 1 80px'}}><SectionLabel>Start</SectionLabel><input type="time" value={block.start} onChange={e=>setBlocks(p=>p.map(b=>b.id===block.id?{...b,start:e.target.value}:b))} style={styles.input}/></div>
                  <div style={{flex:'1 1 80px'}}><SectionLabel>End</SectionLabel><input type="time" value={block.end} onChange={e=>setBlocks(p=>p.map(b=>b.id===block.id?{...b,end:e.target.value}:b))} style={styles.input}/></div>
                  <div style={{flex:'0 0 auto'}}><SectionLabel>Duration</SectionLabel><div style={{fontSize:13,color:T.text2,padding:'7px 0'}}>{blockHours(block).toFixed(1)}h</div></div>
                  <Btn onClick={()=>setBlocks(p=>p.filter(b=>b.id!==block.id))} variant="danger" small>Remove</Btn>
                </div>

                {/* Default staffing */}
                <SectionLabel>Default staffing (all days)</SectionLabel>
                <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:6,marginBottom:16}}>
                  {allRoles.map(role=>{
                    const rs=roleStyles[role]||{dot:'#9C9088',bg:'#F2F1EF',text:'#5C5248',border:'#C8C4BE'};
                    return (
                      <div key={role} style={{display:'flex',alignItems:'center',gap:6,background:rs.bg,border:`1px solid ${rs.border}`,borderRadius:8,padding:'6px 10px'}}>
                        <span style={{fontSize:11,fontWeight:500,color:rs.text}}>{role}</span>
                        <input type="number" min="0" max="10" value={block.roles[role]||0}
                          onChange={e=>updateDefaultRole(role,e.target.value)}
                          style={{width:36,textAlign:'center',padding:'3px 4px',fontSize:12,borderRadius:5,border:`1px solid ${rs.border}`,background:'rgba(255,255,255,0.6)',color:rs.text,fontFamily:'inherit'}}/>
                      </div>
                    );
                  })}
                </div>

                {/* Day-specific overrides */}
                <SectionLabel>Day overrides</SectionLabel>
                <div style={{marginTop:6,display:'flex',flexDirection:'column',gap:8}}>
                  {/* Existing overrides */}
                  {daysWithOverride.map(day=>{
                    const dayRoles=overrides[day];
                    return (
                      <div key={day} style={{background:T.surfaceWarm,border:`1px solid ${T.border}`,borderRadius:10,padding:'10px 12px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                          <span style={{fontSize:12,fontWeight:600,color:T.text,width:36}}>{day}</span>
                          <span style={{fontSize:11,color:T.text3,flex:1}}>Custom staffing for {day}</span>
                          <Btn small variant="ghost" onClick={()=>removeDayOverride(day)}>✕ Remove</Btn>
                        </div>
                        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                          {allRoles.map(role=>{
                            const rs=roleStyles[role]||{dot:'#9C9088',bg:'#F2F1EF',text:'#5C5248',border:'#C8C4BE'};
                            const isChanged=(dayRoles[role]||0)!==(block.roles[role]||0);
                            return (
                              <div key={role} style={{display:'flex',alignItems:'center',gap:6,background:rs.bg,border:`1.5px solid ${isChanged?rs.dot:rs.border}`,borderRadius:8,padding:'6px 10px'}}>
                                <span style={{fontSize:11,fontWeight:500,color:rs.text}}>{role}</span>
                                <input type="number" min="0" max="10" value={dayRoles[role]||0}
                                  onChange={e=>updateOverrideRole(day,role,e.target.value)}
                                  style={{width:36,textAlign:'center',padding:'3px 4px',fontSize:12,borderRadius:5,border:`1px solid ${rs.border}`,background:'rgba(255,255,255,0.6)',color:rs.text,fontFamily:'inherit'}}/>
                                {isChanged&&<span style={{fontSize:9,color:rs.dot,fontWeight:600}}>↑</span>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {/* Add override for a day */}
                  <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
                    <span style={{fontSize:11,color:T.text3}}>Add override for:</span>
                    {DAYS.filter(d=>!overrides[d]).map(day=>(
                      <button key={day} onClick={()=>addDayOverride(day)}
                        style={{padding:'3px 10px',borderRadius:999,fontSize:11,fontWeight:500,cursor:'pointer',background:'transparent',border:`1px dashed ${T.border}`,color:T.text2,fontFamily:'inherit',transition:'all 0.15s'}}
                        onMouseEnter={e=>{e.target.style.borderColor=T.accent;e.target.style.color=T.accent;}}
                        onMouseLeave={e=>{e.target.style.borderColor=T.border;e.target.style.color=T.text2;}}>
                        + {day}
                      </button>
                    ))}
                    {DAYS.every(d=>overrides[d])&&<span style={{fontSize:11,color:T.text3,fontStyle:'italic'}}>All days have custom staffing</span>}
                  </div>
                </div>
              </div>
              );
            })}
            <div><Btn onClick={()=>setBlocks(p=>[...p,{id:`b${Date.now()}`,name:'New Block',start:'09:00',end:'17:00',roles:Object.fromEntries(Object.keys(roleStyles).map(r=>[r,0]))}])} variant="secondary">+ Add coverage block</Btn></div>
          </div>
        )}

        {/* ══ COSTS ══ */}
        {view==='costs'&&(
          <div style={{display:'flex',flexDirection:'column',gap:16}}>

            {/* Week / Month toggle + rate settings */}
            <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
              <div style={{display:'flex',background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:3,gap:2}}>
                {[['week','This week'],['month','This month']].map(([k,l])=>(
                  <button key={k} onClick={()=>setCostsMode(k)}
                    style={{padding:'4px 14px',borderRadius:6,background:costsMode===k?T.bg:'transparent',border:costsMode===k?`1px solid ${T.border}`:'1px solid transparent',cursor:'pointer',fontSize:12,fontWeight:costsMode===k?500:400,color:costsMode===k?T.text:T.text2,fontFamily:'inherit'}}>
                    {l}
                  </button>
                ))}
              </div>
              {costsMode==='month'&&(
                <span style={{fontSize:12,color:T.text2}}>
                  {new Date(displayMonth.y,displayMonth.m,1).toLocaleDateString('en-GB',{month:'long',year:'numeric'})}
                  {' — '}{getMonthOffsets(displayMonth).filter(off=>schedules[weekKey(off)]).length} of {getMonthOffsets(displayMonth).length} weeks generated
                </span>
              )}
              {costsMode==='week'&&schedule&&(
                <span style={{fontSize:12,color:T.text2}}>{fmt(weekDates[0])} – {fmt(weekDates[6])}</span>
              )}
              {/* Hourly rate input */}
              <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6,background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:'4px 10px'}}>
                <span style={{fontSize:11,color:T.text3,whiteSpace:'nowrap'}}>Base rate</span>
                <input
                  type="number" min="1" step="1"
                  value={hourlyRate.amount}
                  onChange={e=>setHourlyRate(p=>({...p,amount:Math.max(1,Number(e.target.value))}))}
                  style={{width:60,padding:'2px 6px',borderRadius:5,border:`1px solid ${T.border}`,fontSize:12,fontFamily:'inherit',textAlign:'right',background:T.surfaceWarm}}
                />
                <input
                  value={hourlyRate.currency}
                  onChange={e=>setHourlyRate(p=>({...p,currency:e.target.value.slice(0,5)}))}
                  style={{width:36,padding:'2px 4px',borderRadius:5,border:`1px solid ${T.border}`,fontSize:12,fontFamily:'inherit',background:T.surfaceWarm}}
                  placeholder="kr"
                />
                <span style={{fontSize:11,color:T.text3}}>/h</span>
              </div>
            </div>

            {/* No data state */}
            {(costsMode!=='month'&&!schedule)||(costsMode==='month'&&!getMonthOffsets(displayMonth).some(off=>schedules[weekKey(off)]))?(
              <div style={{...styles.card,textAlign:'center',padding:'52px 32px',position:'relative',overflow:'hidden'}}>
                <div style={{position:'absolute',inset:0,backgroundImage:`radial-gradient(circle, ${T.border} 1px, transparent 1px)`,backgroundSize:'24px 24px',opacity:0.5,pointerEvents:'none'}}/>
                <div style={{position:'relative'}}>
                  <div style={{fontSize:36,marginBottom:12,opacity:0.25}}>💷</div>
                  <div style={{fontFamily:"'Fraunces',serif",fontSize:20,marginBottom:8}}>No schedule to analyse</div>
                  <div style={{fontSize:13,color:T.text2,marginBottom:20}}>Generate a schedule first to see salary cost breakdown.</div>
                  <Btn onClick={()=>setView('schedule')}>Go to Schedule</Btn>
                </div>
              </div>
            ):(()=>{
              const data = costsMode==='month' ? monthCostData : costData;
              const totalCost = costsMode==='month' ? totalMonthCostUnits : totalCostUnits;
              const maxCost = costsMode==='month' ? maxMonthCostUnits : maxCostUnits;

              return (
                <>
                  {/* Summary cards */}
                  {(()=>{
                    const workingCount=data.filter(d=>d.hours>0).length;
                    const totalHours=data.reduce((s,d)=>s+d.hours,0);
                    const cards=[
                      {label:'Estimated cost',value:toMoney(totalCost),sub:`${hourlyRate.amount} ${hourlyRate.currency}/h × salary%`,color:T.accent,big:true},
                      {label:'Total hours',value:totalHours+'h',sub:costsMode==='month'?'this month':'this week',color:T.text},
                      {label:'Staff scheduled',value:`${workingCount} of ${employees.length}`,sub:costsMode==='month'?`employees · ${getMonthOffsets(displayMonth).filter(off=>schedules[weekKey(off)]).length} weeks`:'employees this week',color:T.success},
                      {label:'Avg cost / employee',value:workingCount>0?toMoney(totalCost/workingCount):'—',sub:'among scheduled staff',color:T.text2},
                    ];
                    return (
                      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:12}}>
                        {cards.map(({label,value,sub,color,big})=>(
                          <div key={label} style={{...styles.card,padding:'14px 16px'}}>
                            <div style={{fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:6}}>{label}</div>
                            <div style={{fontFamily:"'Fraunces',serif",fontSize:big?26:22,fontWeight:500,color,marginBottom:2}}>{value}</div>
                            <div style={{fontSize:11,color:T.text3}}>{sub}</div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* Employee breakdown */}
                  <div style={styles.card}>
                    <div style={{fontFamily:"'Fraunces',serif",fontSize:15,fontWeight:500,marginBottom:4}}>Employee breakdown</div>
                    <div style={{fontSize:12,color:T.text2,marginBottom:16}}>Cost index = hours worked × salary %. Higher means relatively more expensive.</div>
                    <div style={{display:'flex',flexDirection:'column',gap:6}}>
                      {[...data].sort((a,b)=>b.costUnits-a.costUnits).map(({emp,hours,costUnits})=>{
                        const p=pal(emp);
                        const pct=maxCost>0?(costUnits/maxCost*100):0;
                        const isOff=weekDates.some(d=>isOnTimeOff(emp.id,d,timeOff));
                        return (
                          <div key={emp.id} style={{display:'grid',gridTemplateColumns:'160px 48px 52px 1fr 52px',alignItems:'center',gap:10,padding:'8px 0',borderBottom:`1px solid ${T.border}`}}>
                            {/* Name + role */}
                            <div style={{display:'flex',alignItems:'center',gap:8,minWidth:0}}>
                              <Avatar emp={emp} size={26}/>
                              <div style={{minWidth:0}}>
                                <div style={{fontSize:12,fontWeight:500,color:T.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{emp.name}</div>
                                <div style={{display:'flex',gap:3,flexWrap:'wrap',marginTop:1}}>
                                  {(emp.roles||[]).slice(0,2).map(r=><RoleBadge key={r} role={r} rs={roleStyles[r]}/>)}
                                </div>
                              </div>
                            </div>
                            {/* Salary % */}
                            <div style={{textAlign:'center'}}>
                              <div style={{fontSize:12,fontWeight:500,color:T.text}}>{emp.salaryPct}%</div>
                              <div style={{fontSize:10,color:T.text3}}>salary</div>
                            </div>
                            {/* Hours */}
                            <div style={{textAlign:'center'}}>
                              <div style={{fontSize:12,fontWeight:500,color:hours>emp.maxHours?T.danger:T.text}}>{hours}h</div>
                              <div style={{fontSize:10,color:T.text3}}>of {emp.maxHours}</div>
                            </div>
                            {/* Bar */}
                            <div style={{position:'relative',height:8,background:T.border,borderRadius:999,overflow:'hidden'}}>
                              <div style={{position:'absolute',left:0,top:0,height:'100%',width:`${pct}%`,background:hours===0?T.border:p.dot,borderRadius:999,transition:'width 0.4s'}}/>
                            </div>
                            {/* Estimated cost */}
                            <div style={{textAlign:'right'}}>
                              {isOff&&costsMode!=='month'
                                ? <span style={{fontSize:10,color:T.warning}}>🌴 off</span>
                                : <div>
                                    <div style={{fontSize:12,fontWeight:600,color:hours===0?T.text3:T.text}}>{hours===0?'—':toMoney(costUnits)}</div>
                                    <div style={{fontSize:10,color:T.text3}}>{hours>0?`index ${costUnits.toFixed(1)}`:''}</div>
                                  </div>
                              }
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Role cost breakdown */}
                  <div style={styles.card}>
                    <div style={{fontFamily:"'Fraunces',serif",fontSize:15,fontWeight:500,marginBottom:16}}>Cost by role</div>
                    <div style={{display:'flex',flexDirection:'column',gap:8}}>
                      {(()=>{ const rc=costsMode==='month'?monthRoleCosts:weekRoleCosts; const maxRC=Math.max(...Object.values(rc),0.01); return Object.entries(rc)
                        .filter(([,v])=>v>0)
                        .sort(([,a],[,b])=>b-a)
                        .map(([role,cost])=>{
                          const rs=roleStyles[role]||{dot:'#9C9088',bg:'#F2F1EF',text:'#5C5248',border:'#C8C4BE'};
                          const pct=maxRC>0?(cost/maxRC*100):0;
                          const roleEmps=data.filter(d=>(d.emp.roles||[]).includes(role)&&d.hours>0);
                          return (
                            <div key={role} style={{display:'grid',gridTemplateColumns:'110px 1fr 60px',alignItems:'center',gap:12}}>
                              <RoleBadge role={role} rs={rs}/>
                              <div style={{position:'relative',height:10,background:T.border,borderRadius:999,overflow:'hidden'}}>
                                <div style={{position:'absolute',left:0,top:0,height:'100%',width:`${pct}%`,background:rs.dot,borderRadius:999,transition:'width 0.4s'}}/>
                              </div>
                              <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end'}}>
                                <span style={{fontSize:13,fontWeight:600,color:T.text}}>{cost.toFixed(1)}</span>
                                <span style={{fontSize:10,color:T.text3}}>{roleEmps.length} staff</span>
                              </div>
                            </div>
                          );
                        });
                      })()}
                      {Object.values(costsMode==='month'?monthRoleCosts:weekRoleCosts).every(v=>v===0)&&(
                        <div style={{fontSize:13,color:T.text3,textAlign:'center',padding:'16px 0'}}>No hours assigned yet</div>
                      )}
                    </div>
                  </div>

                  {/* Info box */}
                  <div style={{fontSize:12,color:T.text2,background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:'10px 14px'}}>
                    💡 <b>Estimated cost</b> = hours worked × salary% × base hourly rate. Set your actual base rate (top right) to see real salary numbers. The <b>index</b> shown under each amount is the raw weighted-hours figure — useful for comparing relative cost between employees regardless of rate.
                  </div>
                </>
              );
            })()}
          </div>
        )}

      </div>
    </div>
  );
}
