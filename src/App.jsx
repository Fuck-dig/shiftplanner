import { useState, useEffect } from "react";
import { LANGUAGES, LOCALES, makeT, detectLang } from "./i18n";

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  bg:          '#F5F0E6',
  surface:     '#FFFEFB',
  surfaceWarm: '#FBF6EE',
  border:      '#E6DDCD',
  text:        '#211B15',
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

// Active locale for date/number formatting — updated each render from `lang`.
let LOCALE = 'en-GB';

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

const TEMPLATE_LABEL_KEYS = {
  'Full-time (Mon–Fri)':'tpl.fulltime',
  'Evenings only':'tpl.evenings',
  'Weekends only':'tpl.weekends',
  'Full availability':'tpl.full',
  'Not available':'emp.notAvailable',
};

const DEFAULT_BLOCKS = [
  { id:'lunch',  name:'Lunch',  start:'10:00', end:'16:00', roles:{ Manager:1, Waiter:2, Kitchen:1, Bartender:0, Other:0 } },
  { id:'dinner', name:'Dinner', start:'16:30', end:'00:00', roles:{ Manager:1, Waiter:3, Kitchen:2, Bartender:1, Other:0 },
    overrides:{ Fri:{ Manager:1, Waiter:4, Kitchen:2, Bartender:1, Other:0 }, Sat:{ Manager:1, Waiter:4, Kitchen:2, Bartender:1, Other:0 } } },
];
const DEFAULT_EMPLOYEES = [
  {id:'1', name:'Mads Larsen',       roles:['Manager'],   salaryPct:100, palIdx:0, contractType:'fixed',  contractPeriod:'month', wage:35000, maxHours:40, availability:{Mon:{from:'09:00',to:'16:00'},Tue:{from:'09:00',to:'16:00'},Wed:{from:'09:00',to:'16:00'},Thu:{from:'09:00',to:'16:00'},Fri:{from:'09:00',to:'16:00'},Sat:null,Sun:null}},
  {id:'2', name:'Sofie Hansen',      roles:['Manager'],   salaryPct:100, palIdx:1, contractType:'fixed',  contractPeriod:'month', wage:35000, maxHours:40, availability:{Mon:null,Tue:null,Wed:{from:'16:00',to:'00:00'},Thu:{from:'16:00',to:'00:00'},Fri:{from:'16:00',to:'00:00'},Sat:{from:'16:00',to:'00:00'},Sun:{from:'16:00',to:'00:00'}}},
  {id:'3', name:'Jonas Møller',      roles:['Waiter'],    salaryPct:80,  palIdx:2, contractType:'fixed',  contractPeriod:'month', wage:28000, maxHours:40, availability:{Mon:{from:'10:00',to:'16:00'},Tue:{from:'10:00',to:'16:00'},Wed:{from:'10:00',to:'16:00'},Thu:{from:'16:00',to:'00:00'},Fri:{from:'16:00',to:'00:00'},Sat:{from:'16:00',to:'00:00'},Sun:{from:'16:00',to:'00:00'}}},
  {id:'4', name:'Emma Nielsen',      roles:['Waiter'],    salaryPct:80,  palIdx:3, contractType:'fixed',  contractPeriod:'month', wage:28000, maxHours:40, availability:{Mon:{from:'10:00',to:'00:00'},Tue:{from:'10:00',to:'00:00'},Wed:{from:'10:00',to:'00:00'},Thu:{from:'10:00',to:'16:00'},Fri:{from:'10:00',to:'00:00'},Sat:{from:'16:00',to:'00:00'},Sun:null}},
  {id:'5', name:'Tobias Jensen',     roles:['Kitchen'],   salaryPct:80,  palIdx:4, contractType:'fixed',  contractPeriod:'month', wage:27000, maxHours:40, availability:{Mon:null,Tue:{from:'16:00',to:'00:00'},Wed:{from:'16:00',to:'00:00'},Thu:{from:'10:00',to:'00:00'},Fri:{from:'16:00',to:'00:00'},Sat:{from:'10:00',to:'00:00'},Sun:{from:'10:00',to:'00:00'}}},
  {id:'6', name:'Laura Christensen', roles:['Kitchen'],   salaryPct:80,  palIdx:5, contractType:'fixed',  contractPeriod:'month', wage:27000, maxHours:40, availability:{Mon:{from:'10:00',to:'16:00'},Tue:{from:'10:00',to:'16:00'},Wed:null,Thu:{from:'10:00',to:'16:00'},Fri:{from:'10:00',to:'00:00'},Sat:{from:'10:00',to:'00:00'},Sun:{from:'10:00',to:'16:00'}}},
  {id:'7', name:'Mikkel Andersen',   roles:['Bartender'], salaryPct:80,  palIdx:6, contractType:'fixed',  contractPeriod:'month', wage:26000, maxHours:40, availability:{Mon:{from:'10:00',to:'16:00'},Tue:null,Wed:{from:'10:00',to:'16:00'},Thu:{from:'16:00',to:'00:00'},Fri:{from:'16:00',to:'00:00'},Sat:{from:'10:00',to:'00:00'},Sun:{from:'16:00',to:'00:00'}}},
  {id:'8', name:'Ida Pedersen',      roles:['Waiter'],    salaryPct:50,  palIdx:0, contractType:'hourly', contractPeriod:'week',  wage:165,   maxHours:20, availability:{Mon:null,Tue:null,Wed:{from:'16:00',to:'00:00'},Thu:{from:'16:00',to:'00:00'},Fri:{from:'16:00',to:'00:00'},Sat:{from:'10:00',to:'00:00'},Sun:{from:'16:00',to:'00:00'}}},
  {id:'9', name:'Oliver Thomsen',    roles:['Waiter'],    salaryPct:50,  palIdx:1, contractType:'hourly', contractPeriod:'week',  wage:165,   maxHours:20, availability:{Mon:{from:'16:00',to:'00:00'},Tue:{from:'16:00',to:'00:00'},Wed:{from:'16:00',to:'00:00'},Thu:null,Fri:{from:'16:00',to:'00:00'},Sat:{from:'16:00',to:'00:00'},Sun:null}},
  {id:'10',name:'Maja Kristensen',   roles:['Kitchen'],   salaryPct:55,  palIdx:2, contractType:'hourly', contractPeriod:'week',  wage:170,   maxHours:20, availability:{Mon:null,Tue:null,Wed:{from:'16:00',to:'00:00'},Thu:{from:'10:00',to:'00:00'},Fri:{from:'10:00',to:'00:00'},Sat:{from:'16:00',to:'00:00'},Sun:{from:'10:00',to:'00:00'}}},
  {id:'11',name:'Rasmus Olsen',      roles:['Bartender'], salaryPct:50,  palIdx:3, contractType:'hourly', contractPeriod:'week',  wage:165,   maxHours:20, availability:{Mon:{from:'16:00',to:'00:00'},Tue:null,Wed:{from:'16:00',to:'00:00'},Thu:{from:'16:00',to:'00:00'},Fri:{from:'16:00',to:'00:00'},Sat:{from:'16:00',to:'00:00'},Sun:null}},
  {id:'12',name:'Freja Madsen',      roles:['Bartender'], salaryPct:60,  palIdx:4, contractType:'hourly', contractPeriod:'week',  wage:168,   maxHours:24, availability:{Mon:null,Tue:{from:'16:00',to:'00:00'},Wed:null,Thu:{from:'16:00',to:'00:00'},Fri:{from:'16:00',to:'00:00'},Sat:{from:'10:00',to:'00:00'},Sun:{from:'16:00',to:'00:00'}}},
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function startOfToday(){ const d=new Date(); d.setHours(0,0,0,0); return d; }
function getMondayDate(off=0){ const n=startOfToday(),dy=n.getDay(),m=new Date(n); m.setDate(n.getDate()-dy+(dy===0?-6:1)+off*7); m.setHours(0,0,0,0); return m; }
function getWeekDates(off=0){ const m=getMondayDate(off); return DAYS.map((_,i)=>{ const d=new Date(m); d.setDate(m.getDate()+i); return d; }); }
function weekKey(off){ const m=getMondayDate(off); return `${m.getFullYear()}-${String(m.getMonth()+1).padStart(2,'0')}-${String(m.getDate()).padStart(2,'0')}`; }
function dateToISO(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function fmt(d){ return d.toLocaleDateString(LOCALE,{day:'2-digit',month:'short'}); }
function fmtLong(iso){ const [y,m,d]=iso.split('-'); return new Date(y,m-1,d).toLocaleDateString(LOCALE,{day:'numeric',month:'long',year:'numeric'}); }
function toMin(t){ const[h,m]=t.split(':').map(Number); return h*60+m; }
function blockHours(b){ const s=toMin(b.start); let e=toMin(b.end); if(e<=s) e+=1440; return (e-s)/60; }
function assignHours(b,a){ const s=toMin((a&&a.start)||b.start); let e=toMin((a&&a.end)||b.end); if(e<=s) e+=1440; return (e-s)/60; }
function coversBlock(av,b){ if(!av) return false; const es=toMin(av.from); let ee=toMin(av.to); if(ee<=es) ee+=1440; const bs=toMin(b.start); let be=toMin(b.end); if(be<=bs) be+=1440; return es<=bs&&ee>=be; }
function getBlockRoles(b,day){ return (b.overrides&&b.overrides[day])?b.overrides[day]:b.roles; }
function isOnTimeOff(empId,date,list){ const iso=dateToISO(date); return list.some(t=>t.empId===empId&&t.status==='Approved'&&t.startDate<=iso&&t.endDate>=iso); }
function getMonthOffsets(ym){
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
function todayISO(){ return dateToISO(startOfToday()); }
function initials(name){ return name.split(' ').map(n=>n[0]).join(''); }

// ─── Scheduler ────────────────────────────────────────────────────────────────
function buildSchedule(employees,blocks,weekDates,timeOffList,allRoles){
  const hw={},wd={}; employees.forEach(e=>{ hw[e.id]=0; wd[e.id]=new Set(); });
  const byRole=role=>[...employees].filter(e=>(e.roles||[]).includes(role)).sort((a,b)=>a.salaryPct-b.salaryPct);
  const isManager=e=>(e.roles||[]).includes('Manager');
  const result={},noMgr=[];

  DAYS.forEach((day,di)=>{
    const date=weekDates[di]; result[day]={};

    blocks.forEach(b=>{
      const bh=blockHours(b),rr=getBlockRoles(b,day),assigned=[],assignedInBlock=new Set();
      allRoles.forEach(role=>{ const need=rr[role]||0; if(!need) return;
        const pool=byRole(role).filter(e=>coversBlock(e.availability[day],b)&&!isOnTimeOff(e.id,date,timeOffList)&&!wd[e.id].has(di)&&hw[e.id]+bh<=e.maxHours&&!assignedInBlock.has(e.id));
        for(let i=0;i<need;i++){ if(pool[i]){ assigned.push({empId:pool[i].id,name:pool[i].name,role}); assignedInBlock.add(pool[i].id); } }
      });
      const hasMgr=assigned.some(a=>isManager(employees.find(e=>e.id===a.empId)));
      if(!hasMgr&&assigned.length>0){
        const mgr=byRole('Manager').find(e=>coversBlock(e.availability[day],b)&&!isOnTimeOff(e.id,date,timeOffList)&&!wd[e.id].has(di)&&hw[e.id]+bh<=e.maxHours&&!assignedInBlock.has(e.id));
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
        if(hw[mgrEmp.id]+bh>mgrEmp.maxHours) return;
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
function dayCoverage(schedule,blocks,day,allRoles){ if(!schedule||!schedule[day]) return 'empty'; let tot=0,fill=0; blocks.forEach(b=>{ const r=getBlockRoles(b,day); allRoles.forEach(role=>{ tot+=r[role]||0; fill+=Math.min(r[role]||0,(schedule[day][b.id]||[]).filter(a=>a.role===role).length); }); }); if(tot===0) return 'empty'; const p=fill/tot; return p>=1?'full':p>=0.6?'partial':'low'; }

// ─── Persistence ──────────────────────────────────────────────────────────────
const migrateEmployee=e=>({
  ...e,
  roles: e.roles || (e.role ? [e.role] : ['Other']),
  contractType:   e.contractType   || 'hourly',
  contractPeriod: e.contractPeriod || 'week',
  wage:           e.wage           || 0,
});
const load=(k,fb)=>{
  try{
    const v=localStorage.getItem(k);
    if(!v) return fb;
    const parsed=JSON.parse(v);
    if(k==='sa2_emps'&&Array.isArray(parsed)) return parsed.map(migrateEmployee);
    return parsed;
  }catch{ return fb; }
};
const save=(k,v)=>{ try{ localStorage.setItem(k,JSON.stringify(v)); }catch{}};

// ─── Styled helpers ───────────────────────────────────────────────────────────
const pal=(e)=>EMP_PALETTE[e?.palIdx%EMP_PALETTE.length]||EMP_PALETTE[0];

const styles = {
  card: { background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, padding:20, boxShadow:'0 1px 2px rgba(33,27,21,0.03), 0 12px 30px -20px rgba(33,27,21,0.25)' },
  cardFlush: { background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, overflow:'hidden', boxShadow:'0 1px 2px rgba(33,27,21,0.03), 0 12px 30px -20px rgba(33,27,21,0.25)' },
  input: { padding:'7px 11px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:13, fontFamily:'inherit', outline:'none', width:'100%', boxSizing:'border-box' },
  select: { padding:'7px 11px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:13, fontFamily:'inherit', outline:'none', width:'100%', boxSizing:'border-box', cursor:'pointer' },
};

// ─── Small components ─────────────────────────────────────────────────────────
function Avatar({emp,size=32}){ const p=pal(emp); return <div style={{width:size,height:size,borderRadius:'50%',background:p.bg,color:p.text,display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*0.35,fontWeight:600,flexShrink:0,border:`1.5px solid ${p.dot}22`}}>{initials(emp.name)}</div>; }

function RoleBadge({role,rs}){ const s=rs||{dot:'#9C9088',bg:'#F2F1EF',text:'#5C5248',border:'#C8C4BE'}; return <span style={{display:'inline-flex',alignItems:'center',gap:4,padding:'2px 8px',borderRadius:999,fontSize:11,fontWeight:500,background:s.bg,color:s.text,border:`1px solid ${s.border}`}}><span style={{width:5,height:5,borderRadius:'50%',background:s.dot,flexShrink:0}}/>{role}</span>; }

function EmpChip({emp,selected,onClick}){ const p=pal(emp); return <button onClick={onClick} style={{display:'inline-flex',alignItems:'center',gap:4,padding:'2px 8px 2px 4px',borderRadius:999,fontSize:11,fontWeight:500,background:selected?p.dot:p.bg,color:selected?'#fff':p.text,border:`1px solid ${selected?p.dot:p.dot+'44'}`,cursor:onClick?'pointer':'default',transition:'all 0.15s',whiteSpace:'nowrap'}}><span style={{width:16,height:16,borderRadius:'50%',background:selected?'rgba(255,255,255,0.3)':p.dot,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:700,flexShrink:0}}>{initials(emp.name)}</span>{emp.name.split(' ')[0]}</button>; }

function StatusBadge({status,label}){ const cfg={Approved:{bg:T.successLight,text:T.success,dot:'#3D7A52'},Pending:{bg:T.warningLight,text:T.warning,dot:'#956B18'},Rejected:{bg:T.dangerLight,text:T.danger,dot:'#963030'}}[status]||{}; return <span style={{display:'inline-flex',alignItems:'center',gap:4,padding:'2px 8px',borderRadius:999,fontSize:11,fontWeight:500,background:cfg.bg,color:cfg.text,border:`1px solid ${cfg.dot}33`}}><span style={{width:5,height:5,borderRadius:'50%',background:cfg.dot}}/>{label||status}</span>; }

function Btn({children,onClick,disabled,variant='primary',small}){
  const base={fontFamily:'inherit',fontWeight:500,borderRadius:8,cursor:disabled?'wait':'pointer',border:'none',transition:'all 0.15s',fontSize:small?12:13,padding:small?'5px 12px':'7px 16px',opacity:disabled?0.6:1};
  const vs={primary:{background:T.accent,color:'#fff'},secondary:{background:T.surfaceWarm,color:T.text,border:`1px solid ${T.border}`},ghost:{background:'transparent',color:T.text2,border:`1px solid ${T.border}`},danger:{background:T.dangerLight,color:T.danger,border:`1px solid ${T.danger}33`},success:{background:T.successLight,color:T.success,border:`1px solid ${T.success}33`}};
  return <button onClick={onClick} disabled={disabled} style={{...base,...vs[variant]}}>{children}</button>;
}

function SectionLabel({children}){ return <div style={{fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>{children}</div>; }

function AddRoleInline({onAdd,t}){
  const [editing,setEditing]=useState(false);
  const [val,setVal]=useState('');
  if(!editing) return (
    <button onClick={()=>setEditing(true)} style={{display:'inline-flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:999,background:'transparent',border:`1px dashed ${T.border}`,color:T.text3,cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>{t('cov.addRole')}</button>
  );
  return (
    <div style={{display:'inline-flex',alignItems:'center',gap:4}}>
      <input autoFocus value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter'&&val.trim()){ onAdd(val.trim()); setVal(''); setEditing(false); } if(e.key==='Escape'){ setVal(''); setEditing(false); } }} placeholder={t('cov.roleName')+'…'} style={{padding:'4px 8px',borderRadius:6,border:`1px solid ${T.border}`,background:'white',fontSize:12,fontFamily:'inherit',width:110,outline:'none'}}/>
      <button onClick={()=>{ if(val.trim()){ onAdd(val.trim()); setVal(''); setEditing(false); } }} style={{padding:'4px 8px',borderRadius:6,background:T.accent,color:'#fff',border:'none',fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>{t('common.add')}</button>
      <button onClick={()=>{ setVal(''); setEditing(false); }} style={{padding:'4px 8px',borderRadius:6,background:'transparent',border:`1px solid ${T.border}`,color:T.text3,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>✕</button>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
function SaveTemplateInline({onSave,t}){
  const [editing,setEditing]=useState(false);
  const [val,setVal]=useState('');
  const commit=()=>{ if(val.trim()){ onSave(val.trim()); setVal(''); setEditing(false); } };
  if(!editing) return (
    <button onClick={()=>setEditing(true)} style={{display:'inline-flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:999,background:'transparent',border:`1px dashed ${T.border}`,color:T.text3,cursor:'pointer',fontSize:11,fontFamily:'inherit'}}>{t('tpl.saveAs')}</button>
  );
  return (
    <div style={{display:'inline-flex',alignItems:'center',gap:4}}>
      <input autoFocus value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') commit(); if(e.key==='Escape'){ setVal(''); setEditing(false); } }} placeholder={t('tpl.namePlaceholder')+'…'} style={{padding:'4px 8px',borderRadius:6,border:`1px solid ${T.border}`,background:'white',fontSize:12,fontFamily:'inherit',width:130,outline:'none'}}/>
      <button onClick={commit} style={{padding:'4px 8px',borderRadius:6,background:T.accent,color:'#fff',border:'none',fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>{t('common.save')}</button>
      <button onClick={()=>{ setVal(''); setEditing(false); }} style={{padding:'4px 8px',borderRadius:6,background:'transparent',border:`1px solid ${T.border}`,color:T.text3,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>✕</button>
    </div>
  );
}

function TemplateEditor({name,displayName,availability,t,dl,onRename,onToggleDay,onUpdate,onDelete,onClose}){
  const [nameVal,setNameVal]=useState(displayName);
  const [dirty,setDirty]=useState(false);
  const commitName=()=>{ if(!dirty) return; const n=nameVal.trim(); if(n&&n!==name) onRename(name,n); };
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(33,27,21,0.35)',display:'flex',alignItems:'center',justifyContent:'center',padding:16,zIndex:50}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,padding:20,width:'min(560px,100%)',maxHeight:'85vh',overflowY:'auto',boxShadow:'0 20px 50px -20px rgba(33,27,21,0.5)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,gap:12}}>
          <input value={nameVal} onChange={e=>{ setNameVal(e.target.value); setDirty(true); }} onBlur={commitName} onKeyDown={e=>{ if(e.key==='Enter') commitName(); }} style={{...styles.input,fontSize:15,fontWeight:600,flex:1}}/>
          <button onClick={onClose} style={{padding:'6px 12px',borderRadius:8,background:'transparent',border:`1px solid ${T.border}`,color:T.text2,cursor:'pointer',fontSize:13,fontFamily:'inherit'}}>{t('common.done')}</button>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          {DAYS.map(day=>{ const a=availability[day]; return (
            <div key={day} style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
              <button onClick={()=>onToggleDay(name,day)} style={{width:46,padding:'4px 0',borderRadius:6,fontSize:11,fontWeight:500,cursor:'pointer',background:a?T.accentLight:'transparent',color:a?T.accentText:T.text3,border:`1px solid ${a?T.accent+'55':T.border}`,textAlign:'center',fontFamily:'inherit'}}>{dl(day)}</button>
              {a?(<><span style={{fontSize:11,color:T.text3}}>{t('common.fromCap')}</span><input type="time" value={a.from} onChange={e=>onUpdate(name,day,'from',e.target.value)} style={{...styles.input,width:'auto',padding:'4px 8px',fontSize:12}}/><span style={{fontSize:11,color:T.text3}}>{t('common.toLower')}</span><input type="time" value={a.to} onChange={e=>onUpdate(name,day,'to',e.target.value)} style={{...styles.input,width:'auto',padding:'4px 8px',fontSize:12}}/></>):(<span style={{fontSize:11,color:T.text3}}>{t('emp.notAvailable')}</span>)}
            </div>
          ); })}
        </div>
        <div style={{marginTop:18,paddingTop:14,borderTop:`1px solid ${T.border}`,display:'flex'}}>
          <button onClick={onDelete} style={{padding:'6px 14px',borderRadius:8,background:'transparent',border:`1px solid ${T.danger}55`,color:T.danger,cursor:'pointer',fontSize:13,fontFamily:'inherit'}}>{t('tpl.removeTitle')}</button>
        </div>
      </div>
    </div>
  );
}

export default function App(){
  const [view,        setView]      = useState('schedule');
  const [calMode,     setCalMode]   = useState('week');
  const [employees,   setEmpRaw]    = useState(()=>load('sa2_emps',DEFAULT_EMPLOYEES));
  const [blocks,      setBlocksRaw] = useState(()=>load('sa2_blocks',DEFAULT_BLOCKS));
  const [schedules,   setSchedsRaw] = useState(()=>load('sa2_scheds',{}));
  const [timeOff,     setTORaw]     = useState(()=>load('sa2_to',[]));
  const [weekOffset,  setWeekOffset]= useState(0);
  const [roleStyles,  setRoleStylesRaw] = useState(()=>load('sa2_roles', DEFAULT_ROLE_STYLES));
  const allRoles = Object.keys(roleStyles);
  const [displayMonth,  setDisplayMonth]  = useState(()=>{ const n=new Date(); return {y:n.getFullYear(),m:n.getMonth()}; });
  const [editingRole,    setEditingRole]    = useState(null);
  const [confirmDelete,  setConfirmDelete]  = useState(null);
  const [generating,  setGenerating]= useState(false);
  const [selected,    setSelected]  = useState(null);
  const [showWarnings,setShowWarnings]=useState(false);
  const [openPicker,  setOpenPicker] = useState(null);
  const [shiftFilter, setShiftFilter]= useState('all'); // 'all' | 'open'
  const [filterPerson,setFilterPerson]=useState('');    // '' = everyone
  const [labelEdit,   setLabelEdit]  = useState(null);   // {day,blockId,empId}
  const [labelVal,    setLabelVal]   = useState('');
  const [timeEdit,    setTimeEdit]   = useState(null);   // {day,blockId,empId}
  const [timeFrom,    setTimeFrom]   = useState('');
  const [timeTo,      setTimeTo]     = useState('');
  const [expandedEmp, setExpandedEmp]=useState(null);
  const [showAddEmp,  setShowAddEmp]=useState(false);
  const [newEmp,      setNewEmp]    = useState({name:'',roles:['Manager'],salaryPct:100,contractType:'hourly',contractPeriod:'week',wage:0,maxHours:40});
  const [showAddTO,   setShowAddTO] = useState(false);
  const [newTO,       setNewTO]     = useState({empId:'',startDate:todayISO(),endDate:todayISO(),type:'Holiday',note:'',status:'Pending'});
  const [toFilter,    setToFilter]  = useState('all');
  const [costsMode,   setCostsMode]  = useState('week');
  const [hourlyRate,  setHourlyRateRaw] = useState(()=>load('sa2_rate',{amount:150,currency:'kr'}));
  const setHourlyRate=v=>{ const val=typeof v==='function'?v(hourlyRate):v; setHourlyRateRaw(val); save('sa2_rate',val); };

  // ── Availability templates (premade are seeded once, then fully editable) ────
  const [templates,  setTemplatesRaw] = useState(()=>{
    const existing = load('sa2_templates', null);
    if(existing===null) return JSON.parse(JSON.stringify(AVAIL_TEMPLATES));
    if(!load('sa2_tpl_seeded', false)) return {...JSON.parse(JSON.stringify(AVAIL_TEMPLATES)), ...existing};
    return existing;
  });
  const setTemplates=v=>{ const val=typeof v==='function'?v(templates):v; setTemplatesRaw(val); save('sa2_templates',val); };
  useEffect(()=>{ if(!load('sa2_tpl_seeded', false)){ save('sa2_templates', templates); save('sa2_tpl_seeded', true); } }, []);
  const saveTemplate=(name,availability)=>{ const n=name.trim(); if(!n||templates[n]) return; setTemplates(p=>({...p,[n]:JSON.parse(JSON.stringify(availability))})); };
  const removeTemplate=name=>{ setTemplates(p=>{ const c={...p}; delete c[name]; return c; }); if(editingTpl===name) setEditingTpl(null); };
  const [editingTpl, setEditingTpl] = useState(null);
  const toggleTemplateDay=(name,day)=>setTemplates(p=>{ const tpl=p[name]; if(!tpl) return p; return {...p,[name]:{...tpl,[day]:tpl[day]?null:{from:'09:00',to:'17:00'}}}; });
  const updateTemplateAvail=(name,day,field,value)=>setTemplates(p=>{ const tpl=p[name]; if(!tpl||!tpl[day]) return p; return {...p,[name]:{...tpl,[day]:{...tpl[day],[field]:value}}}; });

  // ── Language ──────────────────────────────────────────────────────────────
  const [lang, setLangRaw] = useState(()=>load('sa2_lang', detectLang()));
  const setLang = v => { setLangRaw(v); save('sa2_lang', v); };
  const t = makeT(lang);
  const dl = d => t('day.'+d);
  LOCALE = LOCALES[lang] || 'en-GB';

  // Inject fonts
  useEffect(()=>{
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,400&family=Hanken+Grotesk:wght@400;500;600;700&display=swap';
    document.head.appendChild(link);
    return ()=>{ try{ document.head.removeChild(link); }catch{} };
  },[]);

  // Global styles
  useEffect(()=>{
    const s=document.createElement('style');
    s.textContent=`* { box-sizing:border-box; } body { margin:0; background:${T.bg}; } input,select { font-family:'Hanken Grotesk',sans-serif !important; } input:focus,select:focus { outline:2px solid ${T.accent} !important; outline-offset:1px; } ::-webkit-scrollbar{width:7px;height:7px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:${T.border};border-radius:4px} ::-webkit-scrollbar-thumb:hover{background:#D8CCB8} `;
    document.head.appendChild(s);
    return ()=>{ try{ document.head.removeChild(s); }catch{} };
  },[]);

  const weekDates   = getWeekDates(weekOffset);
  const wKey        = weekKey(weekOffset);
  const weekData    = schedules[wKey]||null;
  const schedule    = weekData?.schedule||null;
  const total       = weekData?.total||0;
  const noMgr       = weekData?.noMgr||[];
  const confirmed   = weekData?.confirmed||false;
  const monthOff    = getMonthOffsets(calMode==='month' ? displayMonth : weekOffset);
  const pendingCount= timeOff.filter(x=>x.status==='Pending').length;

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
    setTimeout(()=>{ const wd=getWeekDates(forOff); const {schedule:s,total:tot,noMgr:nm}=buildSchedule(employees,blocks,wd,timeOff,allRoles); setSchedules(p=>({...p,[weekKey(forOff)]:{schedule:s,total:tot,noMgr:nm}})); setGenerating(false); },350);
  };
  const generateMonth=()=>{
    setGenerating(true); setSelected(null);
    const offsets=getMonthOffsets(calMode==='month' ? displayMonth : weekOffset);
    setTimeout(()=>{
      const updates={};
      offsets.forEach(off=>{
        const wd=getWeekDates(off);
        const {schedule:s,total:tot,noMgr:nm}=buildSchedule(employees,blocks,wd,timeOff,allRoles);
        updates[weekKey(off)]={schedule:s,total:tot,noMgr:nm};
      });
      setSchedules(p=>({...p,...updates}));
      setGenerating(false);
    },100);
  };

  const handleSlotClick=(day,blockId,entry,idx)=>{ if(!schedule) return; setOpenPicker(null); if(!selected){ setSelected({...entry,day,blockId,idx}); return; } if(selected.day===day&&selected.blockId===blockId&&selected.idx===idx){ setSelected(null); return; } const ns=JSON.parse(JSON.stringify(schedule)); const src=ns[selected.day][selected.blockId],dst=ns[day][blockId]; const se=src[selected.idx],de=dst[idx]; src[selected.idx]={...de,role:se.role}; dst[idx]={...se,role:de.role}; setSchedules(p=>({...p,[wKey]:{...p[wKey],schedule:ns}})); setSelected(null); };
  const handleEmptySlotClick=(day,blockId,role)=>{ if(!selected||!schedule) return; const ns=JSON.parse(JSON.stringify(schedule)); const entry=ns[selected.day][selected.blockId].splice(selected.idx,1)[0]; ns[day][blockId]=[...(ns[day][blockId]||[]),{...entry,role}]; setSchedules(p=>({...p,[wKey]:{...p[wKey],schedule:ns}})); setSelected(null); };

  const eligibleForSlot=(day,blockId,role)=>{
    if(!schedule) return [];
    const block=blocks.find(b=>b.id===blockId);
    if(!block) return [];
    const bh=blockHours(block);
    const date=weekDates[DAYS.indexOf(day)];
    const alreadyWorking=new Set(blocks.flatMap(b=>(schedule[day]?.[b.id]||[]).map(a=>a.empId)));
    return employees
      .filter(e=>(e.roles||[]).includes(role)&&coversBlock(e.availability[day],block)&&!isOnTimeOff(e.id,date,timeOff)&&!alreadyWorking.has(e.id)&&empHours(e.id)+bh<=e.maxHours)
      .sort((a,b)=>a.salaryPct-b.salaryPct);
  };

  const addToSlot=(day,blockId,role,emp)=>{
    const ns=JSON.parse(JSON.stringify(schedule));
    ns[day][blockId]=[...(ns[day][blockId]||[]),{empId:emp.id,name:emp.name,role}];
    setSchedules(p=>({...p,[wKey]:{...p[wKey],schedule:ns,confirmed:false}}));
    setOpenPicker(null);
  };
  const setShiftLabel=(day,blockId,empId,label)=>{ if(!schedule) return; const ns=JSON.parse(JSON.stringify(schedule)); const arr=ns[day]?.[blockId]; if(!arr) return; const e=arr.find(a=>a.empId===empId); if(!e) return; const l=label.trim(); if(l) e.label=l; else delete e.label; setSchedules(p=>({...p,[wKey]:{...p[wKey],schedule:ns}})); };
  const setShiftTime=(day,blockId,empId,start,end)=>{ if(!schedule) return; const ns=JSON.parse(JSON.stringify(schedule)); const arr=ns[day]?.[blockId]; if(!arr) return; const a=arr.find(x=>x.empId===empId); if(!a) return; const blk=blocks.find(b=>b.id===blockId); if(!start||!end||(start===blk?.start&&end===blk?.end)){ delete a.start; delete a.end; } else { a.start=start; a.end=end; } setSchedules(p=>({...p,[wKey]:{...p[wKey],schedule:ns}})); };

  const updateEmp=(id,f,v)=>setEmployees(p=>p.map(e=>e.id===id?{...e,[f]:v}:e));
  const updateAvail=(id,day,f,v)=>setEmployees(p=>p.map(e=>{ if(e.id!==id) return e; const cur=e.availability[day]||{from:'10:00',to:'18:00'}; return {...e,availability:{...e.availability,[day]:{...cur,[f]:v}}}; }));
  const toggleDay=(id,day)=>setEmployees(p=>p.map(e=>{ if(e.id!==id) return e; const cur=e.availability[day]; return {...e,availability:{...e.availability,[day]:cur?null:{from:'10:00',to:'18:00'}}}; }));
  const applyTemplate=(id,tpl)=>{ const tp=templates[tpl]; if(tp) setEmployees(p=>p.map(e=>e.id===id?{...e,availability:JSON.parse(JSON.stringify(tp))}:e)); };
  const duplicateEmp=emp=>setEmployees(p=>[...p,{...JSON.parse(JSON.stringify(emp)),id:String(Date.now()),name:emp.name+' (copy)',palIdx:p.length%EMP_PALETTE.length}]);
  const removeEmp=id=>{ setEmployees(p=>p.filter(e=>e.id!==id)); if(expandedEmp===id) setExpandedEmp(null); };
  const addEmployee=()=>{ if(!newEmp.name.trim()) return; setEmployees(p=>[...p,{...newEmp,id:String(Date.now()),palIdx:p.length%EMP_PALETTE.length,availability:Object.fromEntries(DAYS.map(d=>[d,null]))}]); setNewEmp({name:'',roles:['Manager'],salaryPct:100,maxHours:40}); setShowAddEmp(false); };
  const addTO=()=>{ if(!newTO.empId) return; setTimeOff(p=>[...p,{...newTO,id:String(Date.now())}]); setNewTO({empId:'',startDate:todayISO(),endDate:todayISO(),type:'Holiday',note:'',status:'Pending'}); setShowAddTO(false); };
  const updateTOStatus=(id,status)=>setTimeOff(p=>p.map(x=>x.id===id?{...x,status}:x));
  const removeTO=id=>setTimeOff(p=>p.filter(x=>x.id!==id));

  const empHoursMap = employees.reduce((acc,e)=>{
    if(!schedule){ acc[e.id]=0; return acc; }
    let h=0;
    DAYS.forEach(day=>blocks.forEach(b=>{ const a=(schedule[day]?.[b.id]||[]).find(x=>x.empId===e.id); if(a) h+=assignHours(b,a); }));
    acc[e.id]=h; return acc;
  },{});
  const empHours=id=>empHoursMap[id]||0;
  const totalStats=()=>{ if(!schedule) return null; let f=0,m=0; DAYS.forEach(day=>blocks.forEach(b=>{ const a=schedule[day]?.[b.id]||[],r=getBlockRoles(b,day); f+=a.length; allRoles.forEach(role=>{ const need=r[role]||0,got=a.filter(x=>x.role===role).length; if(got<need) m+=(need-got); }); })); return {filled:f,missing:m}; };
  const stats=totalStats();
  const calcWageCost=(e,hours)=>{
    const wage=e.wage||0;
    if(!wage) return parseFloat((hours*(e.salaryPct/100)).toFixed(2));
    if((e.contractType||'hourly')==='hourly') return parseFloat((hours*wage).toFixed(2));
    const contracted=e.maxHours||40;
    const weeksInMonth=4.33;
    const monthlyHours=(e.contractPeriod||'week')==='month'?contracted:contracted*weeksInMonth;
    return parseFloat(((hours/monthlyHours)*(e.contractPeriod==='month'?wage:wage*weeksInMonth)).toFixed(2));
  };
  const hasWages=employees.some(e=>e.wage>0);
  const costData = employees.map(e=>{ const h=empHours(e.id); const costUnits=hasWages?calcWageCost(e,h):parseFloat((h*(e.salaryPct/100)).toFixed(2)); return {emp:e, hours:h, costUnits}; });
  const totalCostUnits=costData.reduce((s,d)=>s+d.costUnits,0);
  const maxCostUnits=Math.max(...costData.map(d=>d.costUnits),0.01);

  const monthCostData=employees.map(e=>{
    let totalH=0;
    getMonthOffsets(displayMonth).forEach(off=>{
      const ws=schedules[weekKey(off)]?.schedule;
      if(!ws) return;
      DAYS.forEach(day=>blocks.forEach(b=>{ const a=(ws[day]?.[b.id]||[]).find(x=>x.empId===e.id); if(a) totalH+=assignHours(b,a); }));
    });
    const costUnits=hasWages?calcWageCost(e,totalH):parseFloat((totalH*(e.salaryPct/100)).toFixed(2));
    return {emp:e, hours:totalH, costUnits};
  });
  const totalMonthCostUnits=monthCostData.reduce((s,d)=>s+d.costUnits,0);
  const maxMonthCostUnits=Math.max(...monthCostData.map(d=>d.costUnits),0.01);

  const buildRoleCosts=data=>allRoles.reduce((acc,role)=>{ const roleEmps=data.filter(d=>(d.emp.roles||[]).includes(role)); acc[role]=parseFloat(roleEmps.reduce((s,d)=>s+d.costUnits,0).toFixed(2)); return acc; },{});
  const weekRoleCosts=buildRoleCosts(costData);
  const monthRoleCosts=buildRoleCosts(monthCostData);

  const toMoney=units=>{
    if(hasWages){ return units>=10000?`kr ${Math.round(units/1000)}k`:`kr ${Math.round(units).toLocaleString(LOCALE)}`; }
    const val=units*hourlyRate.amount;
    return val>=10000?`${hourlyRate.currency} ${Math.round(val/1000)}k`:`${hourlyRate.currency} ${Math.round(val).toLocaleString(LOCALE)}`;
  };
  const offThisWeek=employees.filter(e=>weekDates.some(d=>isOnTimeOff(e.id,d,timeOff)));
  const wkISOs=weekDates.map(dateToISO);
  const filteredTO=timeOff.filter(x=>{ if(toFilter==='pending') return x.status==='Pending'; if(toFilter==='approved') return x.status==='Approved'; if(toFilter==='this-week') return wkISOs.some(iso=>x.startDate<=iso&&x.endDate>=iso); return true; }).sort((a,b)=>a.startDate.localeCompare(b.startDate));

  const coverageDot=s=>({full:{bg:'#D4F0E2',border:'#5AAE80',text:'#236040'},partial:{bg:'#FBF0D5',border:'#D4A830',text:'#7A5010'},low:{bg:'#F5E2E2',border:'#D06060',text:'#783030'},empty:{bg:T.bg,border:T.border,text:T.text3}}[s]);

  const navItems=[{k:'schedule',l:t('nav.schedule')},{k:'employees',l:t('nav.employees')},{k:'timeoff',l:pendingCount?`${t('nav.timeoff')} · ${pendingCount}`:t('nav.timeoff')},{k:'coverage',l:t('nav.coverage')},{k:'costs',l:t('nav.costs')}];
  const filterLabel={all:t('to.all'),pending:t('to.pending'),approved:t('to.approved'),'this-week':t('to.thisWeek')}[toFilter];

  return (
    <div style={{minHeight:'100vh',background:T.bg,backgroundImage:`radial-gradient(circle at 12% 6%, rgba(191,90,44,0.045), transparent 38%), radial-gradient(circle at 88% 94%, rgba(61,122,82,0.04), transparent 42%)`,fontFamily:"'Hanken Grotesk',sans-serif",color:T.text,fontSize:13}}>

      {/* ── Top navigation ── */}
      <div style={{background:'rgba(255,254,251,0.82)',backdropFilter:'blur(10px)',WebkitBackdropFilter:'blur(10px)',borderBottom:`1px solid ${T.border}`,padding:'0 24px',display:'flex',alignItems:'center',gap:0,height:56,position:'sticky',top:0,zIndex:100,boxShadow:`0 2px 14px -8px rgba(33,27,21,0.18)`}}>
        <div style={{display:'flex',alignItems:'baseline',gap:9,marginRight:36}}>
          <span style={{fontFamily:"'Fraunces',serif",fontSize:21,fontWeight:600,color:T.text,letterSpacing:'-0.02em'}}>Rorota</span>
          <span style={{fontSize:11,color:T.text3,fontWeight:500,letterSpacing:'0.03em',textTransform:'uppercase'}}>{t('common.restaurant')}</span>
        </div>
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
        <select value={lang} onChange={e=>setLang(e.target.value)} title={t('common.language')} aria-label={t('common.language')}
          style={{fontFamily:'inherit',fontSize:12,color:T.text2,background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:'6px 8px',marginRight:10,cursor:'pointer',outline:'none'}}>
          {LANGUAGES.map(L=><option key={L.code} value={L.code}>{L.flag} {L.label}</option>)}
        </select>
        <Btn onClick={()=>calMode==='month'?generateMonth():generate()} disabled={generating} variant="primary">
          {generating?t('common.generating'):'✦ '+t('common.generate')}
        </Btn>
      </div>

      <div style={{maxWidth:1100,margin:'0 auto',padding:'24px 20px'}}>

        {/* ══ SCHEDULE ══ */}
        {view==='schedule'&&(
          <div>
            {/* Sub-nav */}
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:20,flexWrap:'wrap'}}>
              <div style={{display:'flex',alignItems:'center',gap:4,background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:3}}>
                <button onClick={()=>{ if(calMode==='month'){ setDisplayMonth(p=>p.m===0?{y:p.y-1,m:11}:{y:p.y,m:p.m-1}); } else { setWeekOffset(w=>w-1); } }} style={{padding:'4px 10px',borderRadius:6,background:'none',border:'none',cursor:'pointer',color:T.text2,fontFamily:'inherit',fontSize:13}}>‹</button>
                <span style={{fontSize:13,fontWeight:500,minWidth:calMode==='month'?120:150,textAlign:'center',color:T.text,padding:'0 4px'}}>
                  {calMode==='month'?new Date(displayMonth.y,displayMonth.m,1).toLocaleDateString(LOCALE,{month:'long',year:'numeric'}):`${fmt(weekDates[0])} – ${fmt(weekDates[6])}`}
                </span>
                <button onClick={()=>{ if(calMode==='month'){ setDisplayMonth(p=>p.m===11?{y:p.y+1,m:0}:{y:p.y,m:p.m+1}); } else { setWeekOffset(w=>w+1); } }} style={{padding:'4px 10px',borderRadius:6,background:'none',border:'none',cursor:'pointer',color:T.text2,fontFamily:'inherit',fontSize:13}}>›</button>
              </div>
              <button onClick={()=>{ setWeekOffset(0); const n=new Date(); setDisplayMonth({y:n.getFullYear(),m:n.getMonth()}); }} style={{padding:'5px 12px',borderRadius:8,background:T.surface,border:`1px solid ${T.border}`,cursor:'pointer',fontSize:12,color:T.text2,fontFamily:'inherit'}}>{t('common.today')}</button>
              <div style={{display:'flex',background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:3,gap:2}}>
                {[['week',t('sched.week')],['month',t('sched.month')],['staff',t('sched.staff')]].map(([k,l])=>(
                  <button key={k} onClick={()=>setCalMode(k)} style={{padding:'4px 12px',borderRadius:6,background:calMode===k?T.bg:'transparent',border:calMode===k?`1px solid ${T.border}`:'1px solid transparent',cursor:'pointer',fontSize:12,fontWeight:calMode===k?500:400,color:calMode===k?T.text:T.text2,fontFamily:'inherit',transition:'all 0.15s'}}>{l}</button>
                ))}
              </div>
              {calMode==='week'&&schedule&&(
                <div style={{marginLeft:'auto',display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                  <span style={{fontSize:12,color:T.text2}}>{stats?.filled||0} {t('sched.slots')}</span>
                  {stats?.missing>0&&<span style={{fontSize:12,color:T.danger,fontWeight:500,background:T.dangerLight,padding:'2px 10px',borderRadius:999,border:`1px solid ${T.danger}33`}}>{t('sched.missing',{n:stats.missing})}</span>}
                  {stats?.missing===0&&<span style={{fontSize:12,color:T.success,fontWeight:500,background:T.successLight,padding:'2px 10px',borderRadius:999,border:`1px solid ${T.success}33`}}>{t('sched.fullCoverage')} ✓</span>}
                  <div style={{width:1,height:16,background:T.border,marginLeft:4}}/>
                  {confirmed
                    ? <span style={{fontSize:12,color:T.success,fontWeight:500,background:T.successLight,padding:'2px 10px',borderRadius:999,border:`1px solid ${T.success}33`,display:'inline-flex',alignItems:'center',gap:4}}>✓ {t('sched.confirmed')}</span>
                    : <span style={{fontSize:12,color:T.text3,background:T.surfaceWarm,padding:'2px 10px',borderRadius:999,border:`1px solid ${T.border}`}}>{t('sched.draft')}</span>
                  }
                  {confirmed
                    ? <Btn small variant="ghost" onClick={unconfirmSchedule}>{t('sched.unconfirm')}</Btn>
                    : <Btn small variant="success" onClick={confirmSchedule}>{t('sched.confirm')}</Btn>
                  }
                  <Btn small variant="danger" onClick={deleteSchedule}>{t('common.delete')}</Btn>
                </div>
              )}
            </div>

            {offThisWeek.length>0&&calMode!=='month'&&(
              <div style={{background:T.warningLight,border:`1px solid ${T.warning}33`,borderRadius:10,padding:'10px 14px',marginBottom:16,display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                <span style={{fontSize:13,color:T.warning}}>🌴</span>
                <span style={{fontSize:12,fontWeight:500,color:T.warning}}>{t('sched.onLeaveWeek')}</span>
                <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>{offThisWeek.map(e=><EmpChip key={e.id} emp={e}/>)}</div>
              </div>
            )}

            {selected&&(
              <div style={{background:T.accentLight,border:`1px solid ${T.accent}44`,borderRadius:10,padding:'10px 14px',marginBottom:16,display:'flex',alignItems:'center',gap:10}}>
                <span style={{fontSize:16}}>✋</span>
                <span style={{fontSize:12,color:T.accentText}}><b>{selected.name}</b>{t('sched.swapHintTail')}</span>
                <button onClick={()=>setSelected(null)} style={{marginLeft:'auto',padding:'4px 10px',borderRadius:6,background:'transparent',border:`1px solid ${T.accent}55`,color:T.accent,cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>{t('common.cancel')}</button>
              </div>
            )}

            {confirmed&&calMode!=='month'&&(
              <div style={{background:T.successLight,border:`1px solid ${T.success}44`,borderRadius:10,padding:'10px 16px',marginBottom:16,display:'flex',alignItems:'center',gap:10}}>
                <span style={{fontSize:15}}>✅</span>
                <div style={{flex:1}}>
                  <span style={{fontSize:12,fontWeight:600,color:T.success}}>{t('sched.confirmedBanner')}</span>
                  <span style={{fontSize:12,color:T.success,marginLeft:8,opacity:0.8}}>{t('sched.confirmedBannerSub')}</span>
                </div>
                <Btn small variant="ghost" onClick={unconfirmSchedule} style={{color:T.success}}>{t('sched.unconfirm')}</Btn>
              </div>
            )}

            {schedule&&<div style={{fontSize:12,color:T.text2,background:T.surfaceWarm,border:`1px solid ${T.border}`,borderRadius:10,padding:'10px 14px',marginBottom:16,display:'flex',gap:8}}><span>💡</span><span>{noMgr.length>0?t('sched.notesGaps',{total,n:noMgr.length}):t('sched.notesOk',{total})}</span></div>}
            {noMgr.length>0&&(
              <div style={{marginBottom:16}}>
                <button onClick={()=>setShowWarnings(s=>!s)} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'5px 12px',borderRadius:999,fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'inherit',background:showWarnings?T.dangerLight:T.surface,color:showWarnings?T.danger:T.text2,border:`1px solid ${showWarnings?T.danger+'44':T.border}`,transition:'all 0.15s'}}>
                  ⚠️ {t.n('sched.warnings',noMgr.length)}
                  <span style={{fontSize:9,opacity:0.7}}>{showWarnings?'▲':'▼'}</span>
                </button>
                {showWarnings&&(
                  <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:10}}>
                    {noMgr.map((g,i)=><div key={i} style={{fontSize:12,color:T.danger,background:T.dangerLight,border:`1px solid ${T.danger}33`,borderRadius:10,padding:'8px 14px'}}>⚠️ {t('sched.noMgr',{day:dl(g.day),block:g.block})}</div>)}
                  </div>
                )}
              </div>
            )}

            {/* ── MONTH VIEW ── */}
            {calMode==='month'&&(
              <div style={{...styles.card,padding:0,overflow:'hidden'}}>
                <div style={{display:'grid',gridTemplateColumns:'48px repeat(7,1fr)',borderBottom:`1px solid ${T.border}`,background:T.surfaceWarm}}>
                  <div/>
                  {DAYS.map(d=><div key={d} style={{padding:'10px 4px',textAlign:'center',fontSize:11,fontWeight:600,color:T.text2,textTransform:'uppercase',letterSpacing:'0.06em'}}>{dl(d)}</div>)}
                </div>
                {monthOff.map(off=>{
                  const wd=getWeekDates(off),k=weekKey(off),ws=schedules[k]?.schedule||null,wConf=schedules[k]?.confirmed||false,isCur=off===weekOffset;
                  return (
                    <div key={off} style={{display:'grid',gridTemplateColumns:'48px repeat(7,1fr)',borderBottom:`1px solid ${T.border}`,background:isCur?T.accentLight:wConf?T.successLight+'88':'transparent',transition:'background 0.2s'}}>
                      <div style={{display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',gap:4,padding:'8px 4px',borderRight:`1px solid ${T.border}`}}>
                        {wConf&&<span style={{fontSize:9,color:T.success,fontWeight:600}}>✓</span>}
                        <button onClick={()=>{setWeekOffset(off);setCalMode('week');}} style={{fontSize:9,padding:'2px 6px',borderRadius:4,cursor:'pointer',border:`1px solid ${isCur?T.accent:T.border}`,background:isCur?T.accent:'transparent',color:isCur?'#fff':T.text3,fontFamily:'inherit'}}>{t('month.view')}</button>
                        {!ws&&<button onClick={()=>generate(off)} style={{fontSize:9,padding:'2px 6px',borderRadius:4,cursor:'pointer',border:`1px solid ${T.accent}`,background:'transparent',color:T.accent,fontFamily:'inherit'}}>{t('month.gen')}</button>}
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
                            {ws&&inMonth&&<div style={{fontSize:10,color:dot.text}}>{t('common.staffN',{n:empCount})}</div>}
                            {offCount>0&&inMonth&&<div style={{fontSize:10,color:T.warning}}>🌴 {offCount}</div>}
                            {!ws&&inMonth&&<div style={{fontSize:10,color:T.text3}}>—</div>}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
                <div style={{display:'flex',gap:16,padding:'12px 16px',background:T.surfaceWarm,alignItems:'center',flexWrap:'wrap'}}>
                  <span style={{fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em'}}>{t('month.coverage')}</span>
                  {[['full',t('month.full')],['partial',t('month.partial')],['low',t('month.low')],['empty',t('month.notGenerated')]].map(([s,l])=>{ const d=coverageDot(s); return <div key={s} style={{display:'flex',alignItems:'center',gap:5}}><div style={{width:10,height:10,borderRadius:3,background:d.bg,border:`1px solid ${d.border}`}}/><span style={{fontSize:11,color:T.text2}}>{l}</span></div>; })}
                  {monthOff.some(off=>schedules[weekKey(off)])&&(<><div style={{flex:1}}/><Btn small variant="danger" onClick={deleteMonth}>{t('month.deleteMonth')}</Btn></>)}
                </div>
              </div>
            )}

            {/* ── STAFF VIEW ── */}
            {calMode==='staff'&&(
              !schedule?(
                <div style={{...styles.card,textAlign:'center',padding:'64px 24px'}}>
                  <div style={{fontSize:40,marginBottom:16,opacity:0.3}}>📋</div>
                  <div style={{fontFamily:"'Fraunces',serif",fontSize:22,marginBottom:8}}>{t('staff.noRota')}</div>
                  <div style={{fontSize:13,color:T.text2,marginBottom:6,maxWidth:340,margin:'0 auto 6px'}}>{t('staff.noRotaDesc')}</div>
                  <div style={{fontSize:12,color:T.text3,marginBottom:24}}>{t('staff.readyCount',{n:employees.length})}</div>
                  <Btn onClick={()=>generate()}>{'✦ '+t('staff.generateWeek')}</Btn>
                </div>
              ):(
                <div>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:10}}>
                    <div>
                      <div style={{fontFamily:"'Fraunces',serif",fontSize:22,fontWeight:500,color:T.text}}>{t('staff.weeklyRota')}</div>
                      <div style={{fontSize:13,color:T.text2,marginTop:2}}>{fmt(weekDates[0])} – {fmt(weekDates[6])} · {t('common.staffN',{n:employees.length})}</div>
                    </div>
                    <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                      {allRoles.filter(r=>employees.some(e=>(e.roles||['Other']).includes(r))).map(r=><RoleBadge key={r} role={r} rs={roleStyles[r]}/>)}
                      <div style={{width:1,height:16,background:T.border}}/>
                      {confirmed
                        ?<span style={{fontSize:12,color:T.success,fontWeight:500,background:T.successLight,padding:'2px 10px',borderRadius:999,border:`1px solid ${T.success}33`,display:'inline-flex',alignItems:'center',gap:4}}>✓ {t('sched.confirmed')}</span>
                        :<span style={{fontSize:12,color:T.text3,background:T.surfaceWarm,padding:'2px 10px',borderRadius:999,border:`1px solid ${T.border}`}}>{t('sched.draft')}</span>
                      }
                      {!confirmed&&<Btn small onClick={confirmSchedule}>{t('sched.confirm')}</Btn>}
                      <Btn small variant="danger" onClick={deleteSchedule}>{t('common.delete')}</Btn>
                    </div>
                  </div>

                  <div style={{display:'flex',flexDirection:'column',gap:8}}>
                    {employees.map(emp=>{
                      const h=empHours(emp.id);
                      const p=pal(emp);
                      const primaryRole=(emp.roles||['Other'])[0]; const rs=roleStyles[primaryRole]||{dot:'#9C9088',bg:'#F2F1EF',text:'#5C5248',border:'#C8C4BE'};
                      const worksThisWeek=DAYS.some(day=>!isOnTimeOff(emp.id,weekDates[DAYS.indexOf(day)],timeOff)&&blocks.some(b=>(schedule[day]?.[b.id]||[]).some(a=>a.empId===emp.id)));
                      return (
                        <div key={emp.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,overflow:'hidden',boxShadow:'0 1px 3px rgba(28,24,21,0.05)',opacity:!worksThisWeek&&!DAYS.some(d=>isOnTimeOff(emp.id,weekDates[DAYS.indexOf(d)],timeOff))?0.55:1}}>
                          <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',background:`linear-gradient(to right, ${p.bg}, ${T.surface})`,borderBottom:`1px solid ${T.border}`}}>
                            <Avatar emp={emp} size={36}/>
                            <div style={{flex:1}}>
                              <div style={{fontSize:14,fontWeight:600,color:T.text}}>{emp.name}</div>
                              <>{(emp.roles||['Other']).map(r=><RoleBadge key={r} role={r} rs={roleStyles[r]}/>)}</>
                            </div>
                            <div style={{textAlign:'right'}}>
                              <div style={{fontSize:13,fontWeight:600,color:h>emp.maxHours?T.danger:h===0?T.text3:T.text}}>{h}h</div>
                              <div style={{fontSize:10,color:T.text3}}>{t('staff.ofMax',{n:emp.maxHours})}</div>
                            </div>
                            <div style={{width:60,height:5,borderRadius:999,background:T.border,overflow:'hidden'}}>
                              <div style={{height:'100%',width:`${Math.min(100,(h/emp.maxHours)*100)}%`,borderRadius:999,background:h>emp.maxHours?T.danger:h/emp.maxHours>0.8?T.warning:T.success,transition:'width 0.3s'}}/>
                            </div>
                          </div>
                          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)'}}>
                            {DAYS.map((day,di)=>{
                              const date=weekDates[di];
                              const onTO=isOnTimeOff(emp.id,date,timeOff);
                              const assignedBlock=blocks.find(b=>(schedule[day]?.[b.id]||[]).some(a=>a.empId===emp.id));
                              const isWeekend=di>=5;
                              return (
                                <div key={day} style={{padding:'10px 10px',borderRight:di<6?`1px solid ${T.border}`:'none',background:isWeekend?T.surfaceWarm:'transparent',minHeight:72,display:'flex',flexDirection:'column',gap:3}}>
                                  <div style={{fontSize:10,fontWeight:600,color:isWeekend?T.text2:T.text3,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:2}}>{dl(day)}<span style={{fontWeight:400,marginLeft:4}}>{date.getDate()}</span></div>
                                  {onTO?(
                                    <div style={{flex:1,display:'flex',alignItems:'center'}}><span style={{fontSize:11,color:T.warning,fontWeight:500}}>🌴 {t('staff.leave')}</span></div>
                                  ):assignedBlock?(
                                    <div style={{flex:1,display:'flex',flexDirection:'column',gap:2}}>
                                      <div style={{display:'flex',alignItems:'center',gap:4}}><div style={{width:6,height:6,borderRadius:'50%',background:rs.dot,flexShrink:0}}/><span style={{fontSize:12,fontWeight:600,color:T.text}}>{assignedBlock.name}</span></div>
                                      <div style={{fontSize:11,color:T.text2}}>{assignedBlock.start} – {assignedBlock.end}</div>
                                      <div style={{fontSize:10,color:T.text3}}>{blockHours(assignedBlock).toFixed(1)}h</div>
                                    </div>
                                  ):(
                                    <div style={{flex:1,display:'flex',alignItems:'center'}}><span style={{fontSize:12,color:T.border,userSelect:'none'}}>—</span></div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{marginTop:16,padding:'12px 16px',background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,display:'flex',gap:20,flexWrap:'wrap',alignItems:'center'}}>
                    <span style={{fontSize:11,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em'}}>{t('staff.weekSummary')}</span>
                    <span style={{fontSize:12,color:T.text2}}><b style={{color:T.text}}>{employees.reduce((acc,e)=>acc+empHours(e.id),0)}h</b>{t('staff.totalHours')}</span>
                    <span style={{fontSize:12,color:T.text2}}><b style={{color:T.text}}>{employees.filter(e=>empHours(e.id)>0).length}</b>{t('staff.staffWorking',{n:employees.length})}</span>
                    {offThisWeek.length>0&&<span style={{fontSize:12,color:T.warning}}><b>{offThisWeek.length}</b>{t('staff.onLeaveCount')}</span>}
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
                    <div style={{fontSize:42,marginBottom:14,opacity:0.25}}>📅</div>
                    <div style={{fontFamily:"'Fraunces',serif",fontSize:27,fontWeight:600,color:T.text,marginBottom:8,letterSpacing:'-0.01em'}}>{t('empty.nothing')}</div>
                    <div style={{fontSize:13.5,color:T.text2,maxWidth:400,margin:'0 auto 4px'}}>
                      {t.n('empty.across',blocks.length,{emp:employees.length,blocks:blocks.length})}{offThisWeek.length>0?t('empty.leaveSuffix',{n:offThisWeek.length}):''}
                    </div>
                    <div style={{fontSize:12,color:T.text3,marginBottom:24,marginTop:4}}>{t('empty.respected')}</div>
                    <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap',marginBottom:26}}>
                      {[['1',t('empty.step1')],['2',t('empty.step2')],['3',t('empty.step3')]].map(([n,l],i)=>(
                        <div key={n} style={{display:'flex',alignItems:'center',gap:7,fontSize:12,color:T.text2}}>
                          <span style={{width:20,height:20,borderRadius:'50%',background:T.accentLight,color:T.accentText,display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:600,flexShrink:0}}>{n}</span>
                          {l}
                          {i<2&&<span style={{color:T.text3,marginLeft:4}}>→</span>}
                        </div>
                      ))}
                    </div>
                    <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap'}}>
                      <Btn onClick={()=>generate()}>{'✦ '+t('empty.generateWeek')}</Btn>
                      <Btn onClick={generateMonth} variant="secondary">{t('empty.generateMonth')}</Btn>
                    </div>
                  </div>
                </div>
              ):(
                <div style={{display:'flex',flexDirection:'column',gap:16}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',padding:'0 2px'}}>
                    <div style={{display:'inline-flex',background:T.surfaceWarm,border:`1px solid ${T.border}`,borderRadius:8,padding:2,gap:2}}>
                      {[['all','filter.all'],['open','filter.open']].map(([k,lk])=>{ const on=shiftFilter===k&&!filterPerson; return (
                        <button key={k} onClick={()=>{ setShiftFilter(k); if(k==='open'){ setFilterPerson(''); setSelected(null); } }} style={{padding:'4px 12px',borderRadius:6,fontSize:12,fontWeight:on?500:400,cursor:'pointer',fontFamily:'inherit',background:on?T.surface:'transparent',border:on?`1px solid ${T.border}`:'1px solid transparent',color:on?T.text:T.text2,transition:'all 0.15s'}}>{t(lk)}</button>
                      ); })}
                    </div>
                    <select value={filterPerson} onChange={e=>{ setFilterPerson(e.target.value); if(e.target.value){ setShiftFilter('all'); setSelected(null); } }} style={{...styles.select,width:'auto',padding:'5px 10px',fontSize:12}}>
                      <option value="">{t('filter.everyone')}</option>
                      {employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </div>
                  {blocks.map(block=>(
                    <div key={block.id} style={styles.cardFlush}>
                      <div style={{padding:'12px 20px',borderBottom:`1px solid ${T.border}`,background:T.surfaceWarm,display:'flex',alignItems:'center',gap:12}}>
                        <div style={{flex:1}}>
                          <span style={{fontFamily:"'Fraunces',serif",fontSize:15,fontWeight:500,color:T.text}}>{block.name}</span>
                          <span style={{fontSize:12,color:T.text3,marginLeft:10}}>{block.start} – {block.end} · {blockHours(block).toFixed(1)}h</span>
                        </div>
                        <span style={{fontSize:10,color:T.success,background:T.successLight,border:`1px solid ${T.success}33`,padding:'2px 8px',borderRadius:999,fontWeight:500}}>{t('week.managerEnforced')}</span>
                      </div>
                      <div style={{overflowX:'auto'}}>
                        <table style={{width:'100%',borderCollapse:'collapse',minWidth:580}}>
                          <thead>
                            <tr>
                              <th style={{width:90,textAlign:'left',padding:'10px 20px',fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em',background:T.surfaceWarm,borderBottom:`1px solid ${T.border}`}}>{t('week.role')}</th>
                              {DAYS.map((day,i)=><th key={day} style={{textAlign:'left',padding:'10px 10px',fontSize:11,fontWeight:500,color:T.text,background:T.surfaceWarm,borderBottom:`1px solid ${T.border}`}}>{dl(day)}<div style={{fontSize:10,fontWeight:400,color:T.text3}}>{fmt(weekDates[i])}</div></th>)}
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
                                    const assignedAll=allA.filter(a=>a.role===role);
                                    const req=getBlockRoles(block,day)[role]||0;
                                    const gap=Math.max(0,req-assignedAll.length);
                                    const isTarget=selected&&selected.role===role&&selected.day!==day;
                                    const canSwap=shiftFilter==='all'&&!filterPerson;
                                    const assignedShown=shiftFilter==='open'?[]:(filterPerson?assignedAll.filter(a=>a.empId===filterPerson):assignedAll);
                                    const showOpen=!filterPerson&&gap>0;
                                    const showMove=canSwap&&selected&&isTarget&&gap>0;
                                    return (
                                      <td key={day} style={{padding:'8px 10px',verticalAlign:'top',borderLeft:`1px solid ${T.border}`,background:T.surface}}>
                                        <div style={{display:'flex',flexDirection:'column',gap:3}}>
                                          {assignedShown.map((a,idx)=>{
                                            const emp=employees.find(e=>e.id===a.empId);
                                            const realIdx=allA.findIndex(x=>x.empId===a.empId);
                                            const isSel=selected?.empId===a.empId&&selected?.day===day&&selected?.blockId===block.id;
                                            const editing=labelEdit&&labelEdit.day===day&&labelEdit.blockId===block.id&&labelEdit.empId===a.empId;
                                            return (
                                              <div key={idx} style={{display:'flex',flexDirection:'column',gap:1,position:'relative'}}>
                                                <EmpChip emp={emp||{name:a.name,palIdx:0}} selected={isSel} onClick={canSwap?()=>handleSlotClick(day,block.id,a,realIdx):undefined}/>
                                                <button onClick={()=>{ setTimeFrom(a.start||block.start); setTimeTo(a.end||block.end); setTimeEdit({day,blockId:block.id,empId:a.empId}); }} title={t('week.editTime')} style={{fontSize:9.5,color:(a.start&&a.end)?T.text2:T.text3,fontWeight:(a.start&&a.end)?500:400,background:'transparent',border:'none',cursor:'pointer',textAlign:'left',padding:'0 0 0 8px',fontFamily:'inherit',whiteSpace:'nowrap'}}>🕒 {a.start||block.start}–{a.end||block.end}</button>
                                                {timeEdit&&timeEdit.day===day&&timeEdit.blockId===block.id&&timeEdit.empId===a.empId&&(
                                                  <div style={{position:'absolute',top:'100%',left:6,marginTop:3,background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,boxShadow:'0 4px 16px rgba(28,24,21,0.12)',zIndex:200,padding:10,width:200}}>
                                                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                                                      <div style={{flex:1}}><div style={{fontSize:9,color:T.text3,marginBottom:2,textTransform:'uppercase',letterSpacing:'0.04em'}}>{t('common.fromCap')}</div><input type="time" value={timeFrom} onChange={e=>setTimeFrom(e.target.value)} style={{...styles.input,width:'100%',padding:'4px 6px',fontSize:12}}/></div>
                                                      <div style={{flex:1}}><div style={{fontSize:9,color:T.text3,marginBottom:2,textTransform:'uppercase',letterSpacing:'0.04em'}}>{t('common.toLower')}</div><input type="time" value={timeTo} onChange={e=>setTimeTo(e.target.value)} style={{...styles.input,width:'100%',padding:'4px 6px',fontSize:12}}/></div>
                                                    </div>
                                                    <div style={{display:'flex',gap:6}}>
                                                      <button onClick={()=>{ setShiftTime(day,block.id,a.empId,timeFrom,timeTo); setTimeEdit(null); }} style={{flex:1,padding:'5px 8px',borderRadius:6,background:T.accent,color:'#fff',border:'none',fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>{t('common.save')}</button>
                                                      <button onClick={()=>{ setShiftTime(day,block.id,a.empId,'',''); setTimeEdit(null); }} title={t('week.resetTime')} style={{padding:'5px 10px',borderRadius:6,background:'transparent',color:T.text2,border:`1px solid ${T.border}`,fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>↺</button>
                                                    </div>
                                                  </div>
                                                )}
                                                {editing?(
                                                  <input autoFocus value={labelVal} onChange={e=>setLabelVal(e.target.value)} onBlur={()=>{ setShiftLabel(day,block.id,a.empId,labelVal); setLabelEdit(null); }} onKeyDown={e=>{ if(e.key==='Enter'){ setShiftLabel(day,block.id,a.empId,labelVal); setLabelEdit(null); } if(e.key==='Escape') setLabelEdit(null); }} placeholder={t('week.labelPlaceholder')} style={{fontSize:10,padding:'1px 6px',borderRadius:5,border:`1px solid ${T.border}`,fontFamily:'inherit',width:'95%',marginLeft:6,outline:'none'}}/>
                                                ):a.label?(
                                                  <button onClick={()=>{ setLabelVal(a.label); setLabelEdit({day,blockId:block.id,empId:a.empId}); }} title={t('week.editLabel')} style={{fontSize:10,color:T.text2,background:'transparent',border:'none',cursor:'pointer',textAlign:'left',padding:'0 0 0 8px',fontFamily:'inherit'}}>🏷 {a.label}</button>
                                                ):(
                                                  <button onClick={()=>{ setLabelVal(''); setLabelEdit({day,blockId:block.id,empId:a.empId}); }} style={{fontSize:9,color:T.text3,opacity:0.55,background:'transparent',border:'none',cursor:'pointer',textAlign:'left',padding:'0 0 0 8px',fontFamily:'inherit'}}>{t('week.addLabel')}</button>
                                                )}
                                              </div>
                                            );
                                          })}
                                          {showMove&&(
                                            <button onClick={()=>handleEmptySlotClick(day,block.id,role)} style={{display:'inline-flex',alignItems:'center',gap:3,padding:'2px 7px',borderRadius:999,fontSize:10,fontWeight:500,background:T.successLight,color:T.success,border:`1px dashed ${T.success}55`,cursor:'pointer',fontFamily:'inherit',alignSelf:'flex-start'}}>{t('week.moveHere')}</button>
                                          )}
                                          {!showMove&&showOpen&&Array.from({length:gap}).map((_,gi)=>(
                                            <div key={'o'+gi} style={{position:'relative'}}>
                                              <button onClick={()=>{ if(!selected) setOpenPicker(p=>p&&p.day===day&&p.blockId===block.id&&p.role===role?null:{day,blockId:block.id,role}); }}
                                                style={{display:'inline-flex',alignItems:'center',gap:5,padding:'3px 9px',borderRadius:999,fontSize:10,fontWeight:500,background:'transparent',color:rs.text,border:`1px dashed ${rs.dot}77`,cursor:selected?'default':'pointer',fontFamily:'inherit',alignSelf:'flex-start'}}>
                                                <span style={{width:6,height:6,borderRadius:'50%',background:rs.dot,flexShrink:0}}/>{t('week.openShift')}
                                              </button>
                                              {gi===0&&!selected&&openPicker?.day===day&&openPicker?.blockId===block.id&&openPicker?.role===role&&(()=>{
                                                const eligible=eligibleForSlot(day,block.id,role);
                                                return (
                                                  <div style={{position:'absolute',top:'100%',left:0,marginTop:4,background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,boxShadow:'0 4px 16px rgba(28,24,21,0.12)',zIndex:200,minWidth:180,maxWidth:240,padding:8}}>
                                                    <div style={{fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em',padding:'2px 4px 6px'}}>{t('week.addRoleDay',{role,day:dl(day)})}</div>
                                                    {eligible.length===0?(
                                                      <div style={{fontSize:11,color:T.text3,padding:'6px 4px',fontStyle:'italic'}}>{t('week.noneAvailable')}</div>
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
                                                      <button onClick={()=>setOpenPicker(null)} style={{display:'block',width:'100%',padding:'4px 8px',borderRadius:6,background:'transparent',border:'none',cursor:'pointer',fontSize:11,color:T.text3,textAlign:'left',fontFamily:'inherit'}}>{t('common.cancel')}</button>
                                                    </div>
                                                  </div>
                                                );
                                              })()}
                                            </div>
                                          ))}
                                          {assignedShown.length===0&&!showMove&&!showOpen&&<span style={{fontSize:11,color:T.text3}}>—</span>}
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

                  <div style={styles.card}>
                    <div style={{fontFamily:"'Fraunces',serif",fontSize:15,fontWeight:500,marginBottom:14}}>{t('week.weeklyHours')}</div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:10}}>
                      {employees.map(emp=>{
                        const h=empHours(emp.id),pct=Math.min(100,(h/emp.maxHours)*100),over=h>emp.maxHours,p=pal(emp);
                        return (
                          <div key={emp.id} style={{padding:'10px 12px',borderRadius:10,border:`1px solid ${over?T.danger+'55':T.border}`,background:over?T.dangerLight:T.surfaceWarm}}>
                            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}><Avatar emp={emp} size={24}/><span style={{fontSize:12,fontWeight:500,color:T.text}}>{emp.name.split(' ')[0]}</span></div>
                            <div style={{fontSize:11,color:T.text3,marginBottom:5,display:'flex',gap:3,flexWrap:'wrap'}}>{(emp.roles||['Other']).map(r=><RoleBadge key={r} role={r} rs={roleStyles[r]}/>)}</div>
                            <div style={{fontSize:13,fontWeight:500,color:over?T.danger:T.text,marginBottom:4}}>{h}h <span style={{fontSize:11,color:T.text3,fontWeight:400}}>/ {emp.maxHours}h</span></div>
                            <div style={{height:3,borderRadius:999,background:T.border,overflow:'hidden'}}><div style={{height:'100%',width:`${pct}%`,borderRadius:999,background:over?T.danger:pct>80?T.warning:T.success,transition:'width 0.4s'}}/></div>
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
            {editingTpl&&templates[editingTpl]&&(
              <TemplateEditor
                key={editingTpl}
                name={editingTpl}
                displayName={t(TEMPLATE_LABEL_KEYS[editingTpl]||editingTpl)}
                availability={templates[editingTpl]}
                t={t} dl={dl}
                onRename={(oldN,newN)=>{ const n=newN.trim(); if(!n||n===oldN||templates[n]) return; setTemplates(p=>{ const c={...p}; c[n]=c[oldN]; delete c[oldN]; return c; }); setEditingTpl(n); }}
                onToggleDay={toggleTemplateDay}
                onUpdate={updateTemplateAvail}
                onDelete={()=>{ removeTemplate(editingTpl); setEditingTpl(null); }}
                onClose={()=>setEditingTpl(null)}
              />
            )}
            {employees.map(emp=>(
              <div key={emp.id} style={styles.card}>
                <div style={{display:'flex',alignItems:'center',gap:12}}>
                  <Avatar emp={emp} size={40}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:500,display:'flex',alignItems:'center',gap:8,marginBottom:3,flexWrap:'wrap'}}>{emp.name}{(emp.roles||['Other']).map(r=><RoleBadge key={r} role={r} rs={roleStyles[r]}/>)}</div>
                    <div style={{fontSize:12,color:T.text2}}>{t('emp.salaryMax',{pct:emp.salaryPct,n:emp.maxHours})}</div>
                  </div>
                  <div style={{display:'flex',gap:6}}>
                    <Btn onClick={()=>duplicateEmp(emp)} variant="ghost" small>{'⧉ '+t('emp.clone')}</Btn>
                    <Btn onClick={()=>setExpandedEmp(expandedEmp===emp.id?null:emp.id)} variant={expandedEmp===emp.id?'secondary':'ghost'} small>{expandedEmp===emp.id?t('common.close'):t('common.edit')}</Btn>
                    <Btn onClick={()=>removeEmp(emp.id)} variant="danger" small>✕</Btn>
                  </div>
                </div>

                {expandedEmp===emp.id&&(
                  <div style={{marginTop:18,paddingTop:18,borderTop:`1px solid ${T.border}`}}>
                    <div style={{display:'flex',gap:10,marginBottom:14,flexWrap:'wrap'}}>
                      <div style={{flex:'2 1 120px'}}><SectionLabel>{t('emp.name')}</SectionLabel><input value={emp.name} onChange={e=>updateEmp(emp.id,'name',e.target.value)} style={styles.input}/></div>
                      <div style={{flex:'2 1 160px'}}><SectionLabel>{t('emp.rolesSelect')}</SectionLabel><div style={{display:'flex',gap:5,flexWrap:'wrap',marginTop:4}}>{allRoles.map(r=>{ const active=(emp.roles||['Other']).includes(r); const rs=roleStyles[r]||{dot:'#9C9088',bg:'#F2F1EF',text:'#5C5248',border:'#C8C4BE'}; return <button key={r} onClick={()=>{ const cur=emp.roles||[]; const next=active?cur.filter(x=>x!==r):[...cur,r]; if(next.length>0) updateEmp(emp.id,'roles',next); }} style={{display:'inline-flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:999,fontSize:11,fontWeight:500,background:active?rs.bg:'transparent',color:active?rs.text:T.text3,border:`1px solid ${active?rs.border:T.border}`,cursor:'pointer',fontFamily:'inherit',transition:'all 0.15s'}}><span style={{width:5,height:5,borderRadius:'50%',background:active?rs.dot:T.text3}}/>{r}</button>; })}</div></div>
                    </div>
                    <div style={{background:T.surfaceWarm,border:`1px solid ${T.border}`,borderRadius:10,padding:'12px 14px',marginBottom:12}}>
                      <SectionLabel>{t('emp.contract')}</SectionLabel>
                      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:6,alignItems:'flex-start'}}>
                        <div style={{flex:'1 1 140px'}}>
                          <div style={{fontSize:11,color:T.text3,marginBottom:4}}>{t('emp.paidBy')}</div>
                          <div style={{display:'flex',gap:3}}>
                            {[['hourly',t('emp.hourly')],['fixed',t('emp.fixedSalary')]].map(([k,l])=>(
                              <button key={k} onClick={()=>updateEmp(emp.id,'contractType',k)} style={{flex:1,padding:'5px 6px',borderRadius:7,fontSize:11,fontWeight:(emp.contractType||'hourly')===k?600:400,background:(emp.contractType||'hourly')===k?T.surface:'transparent',border:`1px solid ${T.border}`,cursor:'pointer',fontFamily:'inherit',color:(emp.contractType||'hourly')===k?T.text:T.text2,boxShadow:(emp.contractType||'hourly')===k?'0 1px 3px rgba(0,0,0,0.08)':'none',transition:'all 0.15s'}}>{l}</button>
                            ))}
                          </div>
                        </div>
                        <div style={{flex:'1 1 130px'}}>
                          <div style={{fontSize:11,color:T.text3,marginBottom:4}}>{t('emp.period')}</div>
                          <div style={{display:'flex',gap:3}}>
                            {[['week',t('emp.perWeek')],['month',t('emp.perMonth')]].map(([k,l])=>(
                              <button key={k} onClick={()=>updateEmp(emp.id,'contractPeriod',k)} style={{flex:1,padding:'5px 6px',borderRadius:7,fontSize:11,fontWeight:(emp.contractPeriod||'week')===k?600:400,background:(emp.contractPeriod||'week')===k?T.surface:'transparent',border:`1px solid ${T.border}`,cursor:'pointer',fontFamily:'inherit',color:(emp.contractPeriod||'week')===k?T.text:T.text2,boxShadow:(emp.contractPeriod||'week')===k?'0 1px 3px rgba(0,0,0,0.08)':'none',transition:'all 0.15s'}}>{l}</button>
                            ))}
                          </div>
                        </div>
                        <div style={{flex:'1 1 110px'}}>
                          <div style={{fontSize:11,color:T.text3,marginBottom:4}}>{(emp.contractType||'hourly')==='hourly'?t('emp.hourlyRate'):t('emp.monthlySalary')}</div>
                          <div style={{display:'flex',alignItems:'center',gap:5}}>
                            <input type="number" min="0" step="1" value={emp.wage===0?'':emp.wage} placeholder="0" onChange={e=>updateEmp(emp.id,'wage',Number(e.target.value))} style={{...styles.input,flex:1}}/>
                            <span style={{fontSize:11,color:T.text3,flexShrink:0}}>{(emp.contractType||'hourly')==='hourly'?'kr/h':'kr/mo'}</span>
                          </div>
                        </div>
                        <div style={{flex:'1 1 90px'}}>
                          <div style={{fontSize:11,color:T.text3,marginBottom:4}}>{(emp.contractPeriod||'week')==='month'?t('emp.maxHMonth'):t('emp.maxHWeek')}</div>
                          <input type="number" min="4" max="250" value={emp.maxHours} onChange={e=>updateEmp(emp.id,'maxHours',Number(e.target.value))} style={styles.input}/>
                        </div>
                        <div style={{flex:'1 1 80px'}}>
                          <div style={{fontSize:11,color:T.text3,marginBottom:4}}>{t('emp.priority')}</div>
                          <input type="number" min="10" max="200" step="5" value={emp.salaryPct} onChange={e=>updateEmp(emp.id,'salaryPct',Number(e.target.value))} style={styles.input}/>
                          <div style={{fontSize:9,color:T.text3,marginTop:3}}>{t('emp.lowerFirst')}</div>
                        </div>
                      </div>
                    </div>
                    <div style={{marginBottom:14}}>
                      <SectionLabel>{t('emp.quickTemplates')}</SectionLabel>
                      <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:4,alignItems:'center'}}>
                        {Object.keys(templates).map(tpl=>(
                          <span key={tpl} style={{display:'inline-flex',alignItems:'center',background:T.surfaceWarm,border:`1px solid ${T.border}`,borderRadius:6,overflow:'hidden'}}>
                            <button onClick={()=>applyTemplate(emp.id,tpl)} style={{padding:'4px 8px 4px 10px',fontSize:11,cursor:'pointer',background:'transparent',border:'none',color:T.text2,fontFamily:'inherit'}}>{t(TEMPLATE_LABEL_KEYS[tpl]||tpl)}</button>
                            <button onClick={()=>setEditingTpl(tpl)} title={t('tpl.editTitle')} style={{padding:'4px 7px',fontSize:11,cursor:'pointer',background:'transparent',border:'none',borderLeft:`1px solid ${T.border}`,color:T.text3,fontFamily:'inherit'}}>✎</button>
                            <button onClick={()=>removeTemplate(tpl)} title={t('tpl.removeTitle')} style={{padding:'4px 8px',fontSize:11,cursor:'pointer',background:'transparent',border:'none',borderLeft:`1px solid ${T.border}`,color:T.text3,fontFamily:'inherit'}}>✕</button>
                          </span>
                        ))}
                        <SaveTemplateInline t={t} onSave={name=>saveTemplate(name,emp.availability)} />
                      </div>
                    </div>
                    <SectionLabel>{t('emp.weeklyAvail')}</SectionLabel>
                    <div style={{display:'flex',flexDirection:'column',gap:6,marginTop:6}}>
                      {DAYS.map(day=>{ const avail=emp.availability[day],p=pal(emp); return (
                        <div key={day} style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                          <button onClick={()=>toggleDay(emp.id,day)} style={{width:46,padding:'4px 0',borderRadius:6,fontSize:11,fontWeight:500,cursor:'pointer',background:avail?p.bg:'transparent',color:avail?p.text:T.text3,border:`1px solid ${avail?p.dot+'55':T.border}`,textAlign:'center',fontFamily:'inherit',transition:'all 0.15s'}}>{dl(day)}</button>
                          {avail?(<><span style={{fontSize:11,color:T.text3}}>{t('common.fromCap')}</span><input type="time" value={avail.from} onChange={e=>updateAvail(emp.id,day,'from',e.target.value)} style={{...styles.input,width:'auto',padding:'4px 8px',fontSize:12}}/><span style={{fontSize:11,color:T.text3}}>{t('common.toLower')}</span><input type="time" value={avail.to} onChange={e=>updateAvail(emp.id,day,'to',e.target.value)} style={{...styles.input,width:'auto',padding:'4px 8px',fontSize:12}}/><span style={{fontSize:11,color:T.text3}}>{(()=>{ const s=toMin(avail.from); let e=toMin(avail.to); if(e<=s) e+=1440; return `${((e-s)/60).toFixed(1)}h`; })()}</span></>):(<span style={{fontSize:11,color:T.text3}}>{t('emp.notAvailable')}</span>)}
                        </div>
                      ); })}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {showAddEmp&&(
              <div style={styles.card}>
                <div style={{fontFamily:"'Fraunces',serif",fontSize:15,fontWeight:500,marginBottom:14}}>{t('emp.newEmployee')}</div>
                <div style={{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap'}}>
                  <input placeholder={t('emp.fullName')} value={newEmp.name} onChange={e=>setNewEmp(p=>({...p,name:e.target.value}))} style={{...styles.input,flex:'2 1 130px'}}/>
                  <div style={{flex:'2 1 200px'}}>
                    <div style={{fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>{t('emp.roles')}</div>
                    <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>{allRoles.map(r=>{ const active=(newEmp.roles||[]).includes(r); const rs=roleStyles[r]||{dot:'#9C9088',bg:'#F2F1EF',text:'#5C5248',border:'#C8C4BE'}; return <button key={r} onClick={()=>{ const cur=newEmp.roles||[]; const next=active?cur.filter(x=>x!==r):[...cur,r]; if(next.length>0) setNewEmp(p=>({...p,roles:next})); }} style={{display:'inline-flex',alignItems:'center',gap:4,padding:'4px 9px',borderRadius:999,fontSize:11,fontWeight:500,background:active?rs.bg:'transparent',color:active?rs.text:T.text3,border:`1px solid ${active?rs.border:T.border}`,cursor:'pointer',fontFamily:'inherit'}}><span style={{width:5,height:5,borderRadius:'50%',background:active?rs.dot:T.text3}}/>{r}</button>; })}</div>
                  </div>
                </div>
                <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap',alignItems:'flex-start'}}>
                  <div style={{flex:'1 1 120px'}}>
                    <div style={{fontSize:11,color:T.text3,marginBottom:3}}>{t('emp.paidBy')}</div>
                    <div style={{display:'flex',gap:3}}>{[['hourly',t('emp.hourly')],['fixed',t('emp.fixed')]].map(([k,l])=>(<button key={k} onClick={()=>setNewEmp(p=>({...p,contractType:k}))} style={{flex:1,padding:'5px 6px',borderRadius:7,fontSize:11,fontWeight:(newEmp.contractType||'hourly')===k?600:400,background:(newEmp.contractType||'hourly')===k?T.bg:'transparent',border:`1px solid ${T.border}`,cursor:'pointer',fontFamily:'inherit',color:(newEmp.contractType||'hourly')===k?T.text:T.text2}}>{l}</button>))}</div>
                  </div>
                  <div style={{flex:'1 1 120px'}}>
                    <div style={{fontSize:11,color:T.text3,marginBottom:3}}>{t('emp.period')}</div>
                    <div style={{display:'flex',gap:3}}>{[['week',t('emp.week')],['month',t('emp.month')]].map(([k,l])=>(<button key={k} onClick={()=>setNewEmp(p=>({...p,contractPeriod:k}))} style={{flex:1,padding:'5px 6px',borderRadius:7,fontSize:11,fontWeight:(newEmp.contractPeriod||'week')===k?600:400,background:(newEmp.contractPeriod||'week')===k?T.bg:'transparent',border:`1px solid ${T.border}`,cursor:'pointer',fontFamily:'inherit',color:(newEmp.contractPeriod||'week')===k?T.text:T.text2}}>{l}</button>))}</div>
                  </div>
                  <div style={{flex:'1 1 100px'}}>
                    <div style={{fontSize:11,color:T.text3,marginBottom:3}}>{(newEmp.contractType||'hourly')==='hourly'?t('emp.hourlyRate'):t('emp.monthlySalary')}</div>
                    <div style={{display:'flex',gap:4,alignItems:'center'}}><input type="number" min="0" step="1" value={newEmp.wage===0?'':newEmp.wage} placeholder="0" onChange={e=>setNewEmp(p=>({...p,wage:Number(e.target.value)}))} style={{...styles.input,flex:1}}/><span style={{fontSize:11,color:T.text3,flexShrink:0}}>{(newEmp.contractType||'hourly')==='hourly'?'kr/h':'kr/mo'}</span></div>
                  </div>
                  <div style={{flex:'1 1 70px'}}>
                    <div style={{fontSize:11,color:T.text3,marginBottom:3}}>{(newEmp.contractPeriod||'week')==='month'?t('emp.maxHMo'):t('emp.maxHWk')}</div>
                    <input type="number" min="4" max="250" value={newEmp.maxHours} onChange={e=>setNewEmp(p=>({...p,maxHours:Number(e.target.value)}))} style={styles.input}/>
                  </div>
                  <div style={{flex:'1 1 70px'}}>
                    <div style={{fontSize:11,color:T.text3,marginBottom:3}}>{t('emp.priority')}</div>
                    <input type="number" min="10" max="200" step="5" value={newEmp.salaryPct} onChange={e=>setNewEmp(p=>({...p,salaryPct:Number(e.target.value)}))} style={styles.input}/>
                  </div>
                </div>
                <div style={{display:'flex',gap:8}}><Btn onClick={addEmployee}>{t('emp.addEmployee')}</Btn><Btn onClick={()=>setShowAddEmp(false)} variant="ghost">{t('common.cancel')}</Btn></div>
              </div>
            )}
            {!showAddEmp&&<Btn onClick={()=>setShowAddEmp(true)} variant="secondary">{t('emp.addEmployeeBtn')}</Btn>}
          </div>
        )}

        {/* ══ TIME OFF ══ */}
        {view==='timeoff'&&(
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            {offThisWeek.length>0&&(
              <div style={{background:T.warningLight,border:`1px solid ${T.warning}33`,borderRadius:10,padding:'12px 16px'}}>
                <div style={{fontSize:12,fontWeight:600,color:T.warning,marginBottom:8}}>🌴 {t('to.onLeaveWeekDates',{a:fmt(weekDates[0]),b:fmt(weekDates[6])})}</div>
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{offThisWeek.map(e=><EmpChip key={e.id} emp={e}/>)}</div>
              </div>
            )}

            <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
              <div style={{display:'flex',background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:3,gap:2}}>
                {[['all',t('to.all')],['pending',t('to.pending')],['approved',t('to.approved')],['this-week',t('to.thisWeek')]].map(([k,l])=>(
                  <button key={k} onClick={()=>setToFilter(k)} style={{padding:'4px 10px',borderRadius:6,background:toFilter===k?T.bg:'transparent',border:toFilter===k?`1px solid ${T.border}`:'1px solid transparent',cursor:'pointer',fontSize:12,fontWeight:toFilter===k?500:400,color:toFilter===k?T.text:T.text2,fontFamily:'inherit'}}>{l}</button>
                ))}
              </div>
              <div style={{marginLeft:'auto'}}><Btn onClick={()=>setShowAddTO(true)}>{t('to.addRequest')}</Btn></div>
            </div>

            {showAddTO&&(
              <div style={styles.card}>
                <div style={{fontFamily:"'Fraunces',serif",fontSize:15,fontWeight:500,marginBottom:14}}>{t('to.newRequest')}</div>
                <div style={{display:'flex',gap:10,marginBottom:12,flexWrap:'wrap'}}>
                  <div style={{flex:'2 1 140px'}}><SectionLabel>{t('to.employee')}</SectionLabel><select value={newTO.empId} onChange={e=>setNewTO(p=>({...p,empId:e.target.value}))} style={styles.select}><option value="">{t('to.selectEllipsis')}</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
                  <div style={{flex:'1 1 120px'}}><SectionLabel>{t('common.fromCap')}</SectionLabel><input type="date" value={newTO.startDate} onChange={e=>setNewTO(p=>({...p,startDate:e.target.value}))} style={styles.input}/></div>
                  <div style={{flex:'1 1 120px'}}><SectionLabel>{t('common.toCap')}</SectionLabel><input type="date" value={newTO.endDate} onChange={e=>setNewTO(p=>({...p,endDate:e.target.value}))} style={styles.input}/></div>
                  <div style={{flex:'1 1 100px'}}><SectionLabel>{t('to.type')}</SectionLabel><select value={newTO.type} onChange={e=>setNewTO(p=>({...p,type:e.target.value}))} style={styles.select}>{TIMEOFF_TYPES.map(ty=><option key={ty} value={ty}>{ty}</option>)}</select></div>
                  <div style={{flex:'2 1 140px'}}><SectionLabel>{t('to.note')}</SectionLabel><input placeholder={t('to.optional')} value={newTO.note} onChange={e=>setNewTO(p=>({...p,note:e.target.value}))} style={styles.input}/></div>
                  <div style={{flex:'1 1 100px'}}><SectionLabel>{t('to.status')}</SectionLabel><select value={newTO.status} onChange={e=>setNewTO(p=>({...p,status:e.target.value}))} style={styles.select}><option value="Pending">{t('to.pending')}</option><option value="Approved">{t('to.approved')}</option></select></div>
                </div>
                <div style={{display:'flex',gap:8}}><Btn onClick={addTO}>{t('to.saveRequest')}</Btn><Btn onClick={()=>setShowAddTO(false)} variant="ghost">{t('common.cancel')}</Btn></div>
              </div>
            )}

            {filteredTO.length===0?(
              <div style={{...styles.card,textAlign:'center',padding:'44px 32px',position:'relative',overflow:'hidden'}}>
                <div style={{position:'absolute',inset:0,backgroundImage:`radial-gradient(circle, ${T.border} 1px, transparent 1px)`,backgroundSize:'24px 24px',opacity:0.4,pointerEvents:'none'}}/>
                <div style={{position:'relative'}}>
                  <div style={{fontSize:36,marginBottom:12,opacity:0.25}}>🌴</div>
                  <div style={{fontFamily:"'Fraunces',serif",fontSize:18,color:T.text,marginBottom:6}}>{toFilter==='all'?t('to.noneYet'):t('to.noneFilter',{filter:filterLabel.toLowerCase()})}</div>
                  <div style={{fontSize:12,color:T.text2,maxWidth:300,margin:'0 auto 20px'}}>{toFilter==='all'?t('to.noneYetDesc'):t('to.tryOther')}</div>
                  {toFilter==='all'&&<Btn onClick={()=>setShowAddTO(true)}>{t('to.addFirst')}</Btn>}
                </div>
              </div>
            ):filteredTO.map(req=>{
              const emp=employees.find(e=>e.id===req.empId);
              const days=Math.round((new Date(req.endDate)-new Date(req.startDate))/(24*3600*1000))+1;
              const borderColor={Approved:T.success,Pending:T.warning,Rejected:T.danger}[req.status]||T.border;
              return (
                <div key={req.id} style={{...styles.card,borderLeft:`3px solid ${borderColor}`,padding:'14px 18px',display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
                  {emp&&<Avatar emp={emp} size={38}/>}
                  <div style={{flex:1,minWidth:140}}>
                    <div style={{fontSize:13,fontWeight:500,marginBottom:3}}>{emp?.name||t('to.unknown')}</div>
                    <div style={{fontSize:12,color:T.text2}}>{fmtLong(req.startDate)} – {fmtLong(req.endDate)} · <b>{days}</b> {t.n('to.dayUnit',days)}</div>
                    <div style={{display:'flex',gap:6,marginTop:4,alignItems:'center'}}>
                      <span style={{fontSize:11,color:T.text3,background:T.bg,padding:'1px 7px',borderRadius:999,border:`1px solid ${T.border}`}}>{req.type}</span>
                      {req.note&&<span style={{fontSize:11,color:T.text3,fontStyle:'italic'}}>"{req.note}"</span>}
                    </div>
                  </div>
                  <StatusBadge status={req.status} label={t('to.'+req.status.toLowerCase())}/>
                  <div style={{display:'flex',gap:6}}>
                    {req.status!=='Approved'&&<Btn onClick={()=>updateTOStatus(req.id,'Approved')} variant="success" small>{t('to.approve')}</Btn>}
                    {req.status!=='Rejected'&&<Btn onClick={()=>updateTOStatus(req.id,'Rejected')} variant="danger" small>{t('to.reject')}</Btn>}
                    {req.status==='Rejected'&&<Btn onClick={()=>updateTOStatus(req.id,'Pending')} variant="ghost" small>{t('to.reset')}</Btn>}
                    <Btn onClick={()=>removeTO(req.id)} variant="ghost" small>✕</Btn>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ══ COVERAGE ══ */}
        {view==='coverage'&&(
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div style={styles.card}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
                <div style={{flex:1}}>
                  <div style={{fontFamily:"'Fraunces',serif",fontSize:15,fontWeight:500}}>{t('cov.roles')}</div>
                  <div style={{fontSize:12,color:T.text2,marginTop:2}}>{t('cov.rolesDesc')}</div>
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
                        <input autoFocus value={editingRole.newName} onChange={e=>setEditingRole(p=>({...p,newName:e.target.value}))} style={{...styles.input,width:130,flex:'0 0 auto'}} placeholder={t('cov.roleName')}/>
                        <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                          {ROLE_COLOR_PALETTE.map((pp,i)=>(<button key={i} onClick={()=>setEditingRole(p=>({...p,colorIdx:i}))} style={{width:20,height:20,borderRadius:'50%',background:pp.dot,border:editingRole.colorIdx===i?`2px solid ${T.text}`:`2px solid transparent`,cursor:'pointer',padding:0,transition:'border 0.15s'}}/>))}
                        </div>
                        <div style={{display:'flex',gap:6,marginLeft:'auto'}}>
                          <Btn small onClick={()=>{
                            const {name,newName,colorIdx}=editingRole;
                            if(!newName.trim()) return;
                            const newStyle=ROLE_COLOR_PALETTE[colorIdx];
                            if(newName!==name){
                              setRoleStyles(p=>{ const next={...p}; delete next[name]; return {...next,[newName]:newStyle}; });
                              setEmployees(p=>p.map(e=>({...e,roles:(e.roles||['Other']).map(r=>r===name?newName:r)})));
                              setBlocks(p=>p.map(b=>{ const nr={...b.roles}; const val=nr[name]||0; delete nr[name]; return {...b,roles:{...nr,[newName]:val}}; }));
                            } else { setRoleStyles(p=>({...p,[name]:newStyle})); }
                            setEditingRole(null);
                          }}>{t('common.save')}</Btn>
                          <Btn small variant="ghost" onClick={()=>setEditingRole(null)}>{t('common.cancel')}</Btn>
                        </div>
                      </div>
                    );
                  }

                  if(isDeleting){
                    return (
                      <div key={role} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:10,background:T.dangerLight,border:`1px solid ${T.danger}33`}}>
                        <span style={{fontSize:12,color:T.danger,flex:1}}>{t('cov.removeRolePre')}<b>{role}</b>{t('cov.removeRolePost')}</span>
                        <Btn small variant="danger" onClick={()=>{
                          setRoleStyles(p=>{ const next={...p}; delete next[role]; return next; });
                          setEmployees(p=>p.map(e=>({...e,roles:(e.roles||['Other']).filter(r=>r!==role)})));
                          setBlocks(p=>p.map(b=>{ const nr={...b.roles}; delete nr[role]; return {...b,roles:nr}; }));
                          setConfirmDelete(null);
                        }}>{t('cov.yesRemove')}</Btn>
                        <Btn small variant="ghost" onClick={()=>setConfirmDelete(null)}>{t('common.cancel')}</Btn>
                      </div>
                    );
                  }

                  return (
                    <div key={role} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',borderRadius:10,background:T.surfaceWarm,border:`1px solid ${T.border}`}}>
                      <div style={{width:10,height:10,borderRadius:'50%',background:rs.dot,flexShrink:0}}/>
                      <span style={{fontSize:13,fontWeight:500,color:T.text,flex:1}}>{role}</span>
                      {isProtected&&<span style={{fontSize:11,color:T.text3,fontStyle:'italic'}}>{t('cov.protected')}</span>}
                      {!isProtected&&(
                        <div style={{display:'flex',gap:4}}>
                          <Btn small variant="ghost" onClick={()=>{ const colorIdx=ROLE_COLOR_PALETTE.findIndex(p=>p.dot===rs.dot); setEditingRole({name:role,newName:role,colorIdx:colorIdx>=0?colorIdx:0}); }}>{t('common.edit')}</Btn>
                          <Btn small variant="danger" onClick={()=>setConfirmDelete(role)}>{t('common.remove')}</Btn>
                        </div>
                      )}
                      {isProtected&&(<Btn small variant="ghost" onClick={()=>{ const colorIdx=ROLE_COLOR_PALETTE.findIndex(p=>p.dot===rs.dot); setEditingRole({name:role,newName:role,colorIdx:colorIdx>=0?colorIdx:0}); }}>{t('cov.editColour')}</Btn>)}
                    </div>
                  );
                })}
                <AddRoleInline t={t} onAdd={(name)=>{ if(!name.trim()||roleStyles[name]) return; const idx=Object.keys(roleStyles).length%ROLE_COLOR_PALETTE.length; setRoleStyles(p=>({...p,[name]:ROLE_COLOR_PALETTE[idx]})); }}/>
              </div>
            </div>

            <div style={{fontSize:13,color:T.text2,background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:'12px 16px'}}>{t('cov.blocksDesc')}</div>
            {blocks.map(block=>{
              const overrides = block.overrides||{};
              const daysWithOverride = DAYS.filter(d=>overrides[d]);
              const updateDefaultRole=(role,val)=>setBlocks(p=>p.map(b=>b.id===block.id?{...b,roles:{...b.roles,[role]:Math.max(0,Number(val))}}:b));
              const updateOverrideRole=(day,role,val)=>setBlocks(p=>p.map(b=>{ if(b.id!==block.id) return b; const ov={...b.overrides||{}}; ov[day]={...(ov[day]||{...b.roles}),[role]:Math.max(0,Number(val))}; return {...b,overrides:ov}; }));
              const addDayOverride=(day)=>setBlocks(p=>p.map(b=>{ if(b.id!==block.id) return b; const ov={...b.overrides||{}}; ov[day]={...b.roles}; return {...b,overrides:ov}; }));
              const removeDayOverride=(day)=>setBlocks(p=>p.map(b=>{ if(b.id!==block.id) return b; const ov={...b.overrides||{}}; delete ov[day]; return {...b,overrides:Object.keys(ov).length?ov:undefined}; }));
              return (
              <div key={block.id} style={styles.card}>
                <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap',alignItems:'flex-end'}}>
                  <div style={{flex:'2 1 100px'}}><SectionLabel>{t('cov.blockName')}</SectionLabel><input value={block.name} onChange={e=>setBlocks(p=>p.map(b=>b.id===block.id?{...b,name:e.target.value}:b))} style={styles.input}/></div>
                  <div style={{flex:'1 1 80px'}}><SectionLabel>{t('cov.start')}</SectionLabel><input type="time" value={block.start} onChange={e=>setBlocks(p=>p.map(b=>b.id===block.id?{...b,start:e.target.value}:b))} style={styles.input}/></div>
                  <div style={{flex:'1 1 80px'}}><SectionLabel>{t('cov.end')}</SectionLabel><input type="time" value={block.end} onChange={e=>setBlocks(p=>p.map(b=>b.id===block.id?{...b,end:e.target.value}:b))} style={styles.input}/></div>
                  <div style={{flex:'0 0 auto'}}><SectionLabel>{t('cov.duration')}</SectionLabel><div style={{fontSize:13,color:T.text2,padding:'7px 0'}}>{blockHours(block).toFixed(1)}h</div></div>
                  <Btn onClick={()=>setBlocks(p=>p.filter(b=>b.id!==block.id))} variant="danger" small>{t('common.remove')}</Btn>
                </div>
                <SectionLabel>{t('cov.defaultStaffing')}</SectionLabel>
                <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:6,marginBottom:16}}>
                  {allRoles.map(role=>{
                    const rs=roleStyles[role]||{dot:'#9C9088',bg:'#F2F1EF',text:'#5C5248',border:'#C8C4BE'};
                    return (
                      <div key={role} style={{display:'flex',alignItems:'center',gap:6,background:rs.bg,border:`1px solid ${rs.border}`,borderRadius:8,padding:'6px 10px'}}>
                        <span style={{fontSize:11,fontWeight:500,color:rs.text}}>{role}</span>
                        <input type="number" min="0" max="10" value={block.roles[role]||0} onChange={e=>updateDefaultRole(role,e.target.value)} style={{width:36,textAlign:'center',padding:'3px 4px',fontSize:12,borderRadius:5,border:`1px solid ${rs.border}`,background:'rgba(255,255,255,0.6)',color:rs.text,fontFamily:'inherit'}}/>
                      </div>
                    );
                  })}
                </div>
                <SectionLabel>{t('cov.dayOverrides')}</SectionLabel>
                <div style={{marginTop:6,display:'flex',flexDirection:'column',gap:8}}>
                  {daysWithOverride.map(day=>{
                    const dayRoles=overrides[day];
                    return (
                      <div key={day} style={{background:T.surfaceWarm,border:`1px solid ${T.border}`,borderRadius:10,padding:'10px 12px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                          <span style={{fontSize:12,fontWeight:600,color:T.text,width:36}}>{dl(day)}</span>
                          <span style={{fontSize:11,color:T.text3,flex:1}}>{t('cov.customStaffing',{day:dl(day)})}</span>
                          <Btn small variant="ghost" onClick={()=>removeDayOverride(day)}>{t('cov.removeX')}</Btn>
                        </div>
                        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                          {allRoles.map(role=>{
                            const rs=roleStyles[role]||{dot:'#9C9088',bg:'#F2F1EF',text:'#5C5248',border:'#C8C4BE'};
                            const isChanged=(dayRoles[role]||0)!==(block.roles[role]||0);
                            return (
                              <div key={role} style={{display:'flex',alignItems:'center',gap:6,background:rs.bg,border:`1.5px solid ${isChanged?rs.dot:rs.border}`,borderRadius:8,padding:'6px 10px'}}>
                                <span style={{fontSize:11,fontWeight:500,color:rs.text}}>{role}</span>
                                <input type="number" min="0" max="10" value={dayRoles[role]||0} onChange={e=>updateOverrideRole(day,role,e.target.value)} style={{width:36,textAlign:'center',padding:'3px 4px',fontSize:12,borderRadius:5,border:`1px solid ${rs.border}`,background:'rgba(255,255,255,0.6)',color:rs.text,fontFamily:'inherit'}}/>
                                {isChanged&&<span style={{fontSize:9,color:rs.dot,fontWeight:600}}>↑</span>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
                    <span style={{fontSize:11,color:T.text3}}>{t('cov.addOverrideFor')}</span>
                    {DAYS.filter(d=>!overrides[d]).map(day=>(
                      <button key={day} onClick={()=>addDayOverride(day)} style={{padding:'3px 10px',borderRadius:999,fontSize:11,fontWeight:500,cursor:'pointer',background:'transparent',border:`1px dashed ${T.border}`,color:T.text2,fontFamily:'inherit',transition:'all 0.15s'}} onMouseEnter={e=>{e.target.style.borderColor=T.accent;e.target.style.color=T.accent;}} onMouseLeave={e=>{e.target.style.borderColor=T.border;e.target.style.color=T.text2;}}>+ {dl(day)}</button>
                    ))}
                    {DAYS.every(d=>overrides[d])&&<span style={{fontSize:11,color:T.text3,fontStyle:'italic'}}>{t('cov.allDaysCustom')}</span>}
                  </div>
                </div>
              </div>
              );
            })}
            <div><Btn onClick={()=>setBlocks(p=>[...p,{id:`b${Date.now()}`,name:'New Block',start:'09:00',end:'17:00',roles:Object.fromEntries(Object.keys(roleStyles).map(r=>[r,0]))}])} variant="secondary">{t('cov.addBlock')}</Btn></div>
          </div>
        )}

        {/* ══ COSTS ══ */}
        {view==='costs'&&(
          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
              <div style={{display:'flex',background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:3,gap:2}}>
                {[['week',t('cost.thisWeek')],['month',t('cost.thisMonth')]].map(([k,l])=>(
                  <button key={k} onClick={()=>setCostsMode(k)} style={{padding:'4px 14px',borderRadius:6,background:costsMode===k?T.bg:'transparent',border:costsMode===k?`1px solid ${T.border}`:'1px solid transparent',cursor:'pointer',fontSize:12,fontWeight:costsMode===k?500:400,color:costsMode===k?T.text:T.text2,fontFamily:'inherit'}}>{l}</button>
                ))}
              </div>
              {costsMode==='month'&&(
                <span style={{fontSize:12,color:T.text2}}>
                  {new Date(displayMonth.y,displayMonth.m,1).toLocaleDateString(LOCALE,{month:'long',year:'numeric'})}
                  {' — '}{t('cost.weeksGenerated',{a:getMonthOffsets(displayMonth).filter(off=>schedules[weekKey(off)]).length,b:getMonthOffsets(displayMonth).length})}
                </span>
              )}
              {costsMode==='week'&&schedule&&(<span style={{fontSize:12,color:T.text2}}>{fmt(weekDates[0])} – {fmt(weekDates[6])}</span>)}
              <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6,background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:'4px 10px'}}>
                <span style={{fontSize:11,color:T.text3,whiteSpace:'nowrap'}}>{t('cost.baseRate')}</span>
                <input type="number" min="1" step="1" value={hourlyRate.amount} onChange={e=>setHourlyRate(p=>({...p,amount:Math.max(1,Number(e.target.value))}))} style={{width:60,padding:'2px 6px',borderRadius:5,border:`1px solid ${T.border}`,fontSize:12,fontFamily:'inherit',textAlign:'right',background:T.surfaceWarm}}/>
                <input value={hourlyRate.currency} onChange={e=>setHourlyRate(p=>({...p,currency:e.target.value.slice(0,5)}))} style={{width:36,padding:'2px 4px',borderRadius:5,border:`1px solid ${T.border}`,fontSize:12,fontFamily:'inherit',background:T.surfaceWarm}} placeholder="kr"/>
                <span style={{fontSize:11,color:T.text3}}>/h</span>
              </div>
            </div>

            {(costsMode!=='month'&&!schedule)||(costsMode==='month'&&!getMonthOffsets(displayMonth).some(off=>schedules[weekKey(off)]))?(
              <div style={{...styles.card,textAlign:'center',padding:'52px 32px',position:'relative',overflow:'hidden'}}>
                <div style={{position:'absolute',inset:0,backgroundImage:`radial-gradient(circle, ${T.border} 1px, transparent 1px)`,backgroundSize:'24px 24px',opacity:0.5,pointerEvents:'none'}}/>
                <div style={{position:'relative'}}>
                  <div style={{fontSize:36,marginBottom:12,opacity:0.25}}>💷</div>
                  <div style={{fontFamily:"'Fraunces',serif",fontSize:20,marginBottom:8}}>{t('cost.noSchedule')}</div>
                  <div style={{fontSize:13,color:T.text2,marginBottom:20}}>{t('cost.noScheduleDesc')}</div>
                  <Btn onClick={()=>setView('schedule')}>{t('cost.goToSchedule')}</Btn>
                </div>
              </div>
            ):(()=>{
              const data = costsMode==='month' ? monthCostData : costData;
              const totalCost = costsMode==='month' ? totalMonthCostUnits : totalCostUnits;
              const maxCost = costsMode==='month' ? maxMonthCostUnits : maxCostUnits;
              return (
                <>
                  {(()=>{
                    const workingCount=data.filter(d=>d.hours>0).length;
                    const totalHours=data.reduce((s,d)=>s+d.hours,0);
                    const cards=[
                      {label:t('cost.estimatedCost'),value:toMoney(totalCost),sub:t('cost.estimatedCostSub',{rate:hourlyRate.amount,cur:hourlyRate.currency}),color:T.accent,big:true},
                      {label:t('cost.totalHours'),value:totalHours+'h',sub:costsMode==='month'?t('cost.thisMonthSub'):t('cost.thisWeekSub'),color:T.text},
                      {label:t('cost.staffScheduled'),value:`${workingCount} ${t('cost.ofN',{n:employees.length}).replace(/^/, '')}`,sub:costsMode==='month'?t('cost.staffMonthSub',{n:getMonthOffsets(displayMonth).filter(off=>schedules[weekKey(off)]).length}):t('cost.staffWeekSub'),color:T.success},
                      {label:t('cost.avgCost'),value:workingCount>0?toMoney(totalCost/workingCount):'—',sub:t('cost.avgCostSub'),color:T.text2},
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

                  <div style={styles.card}>
                    <div style={{fontFamily:"'Fraunces',serif",fontSize:15,fontWeight:500,marginBottom:4}}>{t('cost.empBreakdown')}</div>
                    <div style={{fontSize:12,color:T.text2,marginBottom:16}}>{t('cost.empBreakdownDesc')}</div>
                    <div style={{display:'flex',flexDirection:'column',gap:6}}>
                      {[...data].sort((a,b)=>b.costUnits-a.costUnits).map(({emp,hours,costUnits})=>{
                        const p=pal(emp);
                        const pct=maxCost>0?(costUnits/maxCost*100):0;
                        const isOff=weekDates.some(d=>isOnTimeOff(emp.id,d,timeOff));
                        return (
                          <div key={emp.id} style={{display:'grid',gridTemplateColumns:'160px 48px 52px 1fr 52px',alignItems:'center',gap:10,padding:'8px 0',borderBottom:`1px solid ${T.border}`}}>
                            <div style={{display:'flex',alignItems:'center',gap:8,minWidth:0}}>
                              <Avatar emp={emp} size={26}/>
                              <div style={{minWidth:0}}>
                                <div style={{fontSize:12,fontWeight:500,color:T.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{emp.name}</div>
                                <div style={{display:'flex',gap:3,flexWrap:'wrap',marginTop:1}}>{(emp.roles||[]).slice(0,2).map(r=><RoleBadge key={r} role={r} rs={roleStyles[r]}/>)}</div>
                              </div>
                            </div>
                            <div style={{textAlign:'center'}}>
                              <div style={{fontSize:12,fontWeight:500,color:T.text}}>{emp.salaryPct}%</div>
                              <div style={{fontSize:10,color:T.text3}}>{t('cost.salary')}</div>
                            </div>
                            <div style={{textAlign:'center'}}>
                              <div style={{fontSize:12,fontWeight:500,color:hours>emp.maxHours?T.danger:T.text}}>{hours}h</div>
                              <div style={{fontSize:10,color:T.text3}}>{t('cost.ofN',{n:emp.maxHours})}</div>
                            </div>
                            <div style={{position:'relative',height:8,background:T.border,borderRadius:999,overflow:'hidden'}}>
                              <div style={{position:'absolute',left:0,top:0,height:'100%',width:`${pct}%`,background:hours===0?T.border:p.dot,borderRadius:999,transition:'width 0.4s'}}/>
                            </div>
                            <div style={{textAlign:'right'}}>
                              {isOff&&costsMode!=='month'
                                ? <span style={{fontSize:10,color:T.warning}}>🌴 {t('cost.off')}</span>
                                : <div>
                                    <div style={{fontSize:12,fontWeight:600,color:hours===0?T.text3:T.text}}>{hours===0?'—':toMoney(costUnits)}</div>
                                    <div style={{fontSize:10,color:T.text3}}>{hours>0?t('cost.index',{n:costUnits.toFixed(1)}):''}</div>
                                  </div>
                              }
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div style={styles.card}>
                    <div style={{fontFamily:"'Fraunces',serif",fontSize:15,fontWeight:500,marginBottom:16}}>{t('cost.costByRole')}</div>
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
                                <span style={{fontSize:10,color:T.text3}}>{t('common.staffN',{n:roleEmps.length})}</span>
                              </div>
                            </div>
                          );
                        });
                      })()}
                      {Object.values(costsMode==='month'?monthRoleCosts:weekRoleCosts).every(v=>v===0)&&(<div style={{fontSize:13,color:T.text3,textAlign:'center',padding:'16px 0'}}>{t('cost.noHours')}</div>)}
                    </div>
                  </div>

                  <div style={{fontSize:12,color:T.text2,background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:'10px 14px'}}>💡 {t('cost.infoBox')}</div>
                </>
              );
            })()}
          </div>
        )}

      </div>
    </div>
  );
}