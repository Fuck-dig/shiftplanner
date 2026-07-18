import React, { useState, useEffect, useCallback, useRef } from 'react';
import { T, styles, THEMES, computeStyles, DEFAULT_ROLE_STYLES, DEFAULT_BLOCKS, DEFAULT_EMPLOYEES, DAYS, AVAIL_TEMPLATES, TIMEOFF_TYPES, EMP_PALETTE, pal, initials, isDark } from './lib/constants';
import { getWeekDates, getMondayDate, weekKey, dateToISO, fmt, toMin, getMonthOffsets, todayISO } from './lib/dates';
import { blockHours, coversBlock, getBlockRoles, isOnTimeOff, buildSchedule, dayCoverage } from './lib/schedule';
import { fetchEmployees, syncEmployees, fetchBlocks, syncBlocks, fetchTimeOff, syncTimeOff, fetchSchedules, syncSchedules } from './lib/data';
import { migrateEmployee } from './lib/storage';
import { supabase } from './lib/supabase';
import { listOrgs, acceptPendingInvitations } from './lib/org';
import { Avatar, RoleBadge, EmpChip, Btn } from './components/ui';
import Auth from './components/Auth';
import RestaurantPicker from './components/RestaurantPicker';
import EmployeeView from './components/EmployeeView';
import Onboarding from './components/Onboarding';
import AccountBar from './components/AccountBar';
import EmployeesView from './components/views/EmployeesView';
import TimeOffView from './components/views/TimeOffView';
import CoverageView from './components/views/CoverageView';
import CostsView from './components/views/CostsView';
import { LANGUAGES, makeT, detectLang } from './i18n';

const loadPref = (k, fb) => { try { const v=localStorage.getItem(k); return v?JSON.parse(v):fb; } catch { return fb; } };
const savePref = (k, v) => { try { localStorage.setItem(k,JSON.stringify(v)); } catch {} };

function LoadingScreen() {
  return <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:T.bg,color:T.text3,fontFamily:"'Hanken Grotesk',sans-serif",fontSize:26}}><span style={{fontFamily:'Fraunces, Georgia, serif',opacity:0.5}}>Rorota</span></div>;
}

function Dashboard({ orgId, orgName='Restaurant', isOwner=false, theme, toggleTheme, onBack=()=>{} }) {
  const [loading,setLoading]         = useState(true);
  const [view,setView]               = useState('schedule');
  const [calMode,setCalMode]         = useState('week');
  const [employees,setEmpRaw]        = useState([]);
  const [blocks,setBlocksRaw]        = useState([]);
  const [schedules,setSchedsRaw]     = useState({});
  const [timeOff,setTORaw]           = useState([]);
  const [weekOffset,setWeekOffset]   = useState(0);
  const [roleStyles,setRoleStylesRaw]= useState(DEFAULT_ROLE_STYLES);
  const [displayMonth,setDisplayMonth]= useState(()=>{const n=new Date();return{y:n.getFullYear(),m:n.getMonth()};});
  const [editingRole,setEditingRole] = useState(null);
  const [confirmDelete,setConfirmDelete]=useState(null);
  const [generating,setGenerating]   = useState(false);
  const [selected,setSelected]       = useState(null);
  const [openPicker,setOpenPicker]   = useState(null);
  const [expandedEmp,setExpandedEmp] = useState(null);
  const [showAddEmp,setShowAddEmp]   = useState(false);
  const [newEmp,setNewEmp]           = useState({name:'',roles:['Manager'],priority:100,contractType:'hourly',contractPeriod:'week',wage:0,maxHours:40});
  const [showAddTO,setShowAddTO]     = useState(false);
  const [newTO,setNewTO]             = useState({empId:'',startDate:todayISO(),endDate:todayISO(),type:'Holiday',note:'',status:'Pending'});
  const [toFilter,setToFilter]       = useState('all');
  const [gridGroupBy,setGridGroupBy] = useState('name');  // 'name' | 'role'
  const [gridTight,setGridTight]     = useState(false);
  const [dayFilter,setDayFilter]     = useState(null);     // null = all days, else one of DAYS — isolates a single day in Week view
  const [dayGroupBy,setDayGroupBy]   = useState('role');   // 'role' | 'name' — sort order for the day-isolation timeline
  const [collapsedBlocks,setCollapsedBlocks]=useState({}); // blockId -> true when collapsed in Week view
  const [costsMode,setCostsMode]     = useState('week');
  const [hourlyRate,setHourlyRateRaw]= useState(()=>loadPref('sa2_rate',{amount:150,currency:'kr'}));
  const [lang,setLangRaw]            = useState(()=>loadPref('sa2_lang',detectLang()));
  const [isMobile,setIsMobile]       = useState(()=>typeof window!=='undefined'&&window.innerWidth<860);
  const [mobileMenuOpen,setMobileMenuOpen]=useState(false);
  useEffect(()=>{
    const onResize=()=>setIsMobile(window.innerWidth<860);
    window.addEventListener('resize',onResize);
    return ()=>window.removeEventListener('resize',onResize);
  },[]);

  const setLang=v=>{setLangRaw(v);savePref('sa2_lang',v);};
  const setHourlyRate=v=>{const val=typeof v==='function'?v(hourlyRate):v;setHourlyRateRaw(val);savePref('sa2_rate',val);};
  const t=makeT(lang);
  const allRoles=Object.keys(roleStyles);

  // debounce helper — tracks in-flight saves and surfaces failures (with a
  // retry closure) instead of failing silently to the console.
  const [savingCount,setSavingCount]=useState(0);
  const [saveError,setSaveError]   =useState(null); // {label,message,retry} | null
  const mkDebounce=(fn,label,ms=600)=>{
    let timer;
    const attempt=(args)=>{
      setSavingCount(c=>c+1);
      fn(...args)
        .then(()=>{ setSaveError(e=>(e&&e.label===label)?null:e); })
        .catch(err=>{
          console.error(`Save failed (${label}):`,err);
          setSaveError({label,message:err?.message||t('save.failedGeneric'),retry:()=>attempt(args)});
        })
        .finally(()=>setSavingCount(c=>Math.max(0,c-1)));
    };
    return(...args)=>{clearTimeout(timer);timer=setTimeout(()=>attempt(args),ms);};
  };

  useEffect(()=>{
    let alive=true; setLoading(true);
    Promise.all([fetchEmployees(orgId),fetchBlocks(orgId),fetchTimeOff(orgId),fetchSchedules(orgId)])
      .then(([emps,blks,to,scheds])=>{
        if(!alive) return;
        setEmpRaw(emps.length?emps.map(migrateEmployee):DEFAULT_EMPLOYEES);
        setBlocksRaw(blks.length?blks:DEFAULT_BLOCKS);
        setTORaw(to); setSchedsRaw(scheds); setLoading(false);
      }).catch(err=>{console.error('Load error:',err);if(alive)setLoading(false);});
    return ()=>{alive=false;};
  },[orgId]);

  // time_off.employee_id has a FK on employees.id, so a time-off save that
  // races ahead of an in-flight/pending employees save can violate that
  // constraint (e.g. add an employee, then quickly add their time off).
  // Track the latest employees-save promise so the time-off sync can wait
  // for it to settle before writing, regardless of the independent debounce timers.
  const empSaveRef=useRef(Promise.resolve());
  const dEmp  =useCallback(mkDebounce(v=>{const p=syncEmployees(orgId,v);empSaveRef.current=p.catch(()=>{});return p;},'employees'),[orgId]);
  const dBlk  =useCallback(mkDebounce(v=>syncBlocks(orgId,v),'blocks'),[orgId]);
  const dTO   =useCallback(mkDebounce(v=>empSaveRef.current.then(()=>syncTimeOff(orgId,v)),'timeoff'),[orgId]);
  const dSched=useCallback(mkDebounce(v=>syncSchedules(orgId,v),'schedules'),[orgId]);

  const setEmployees=v=>{const val=typeof v==='function'?v(employees):v;setEmpRaw(val);dEmp(val);};
  const setBlocks   =v=>{const val=typeof v==='function'?v(blocks):v;setBlocksRaw(val);dBlk(val);};
  const setSchedules=v=>{const val=typeof v==='function'?v(schedules):v;setSchedsRaw(val);dSched(val);};
  const setTimeOff  =v=>{const val=typeof v==='function'?v(timeOff):v;setTORaw(val);dTO(val);};
  const setRoleStyles=v=>{const val=typeof v==='function'?v(roleStyles):v;setRoleStylesRaw(val);};

  useEffect(()=>{
    const s=document.createElement('style');
    s.textContent=`html,body,#root{width:100%;margin:0;padding:0}*{box-sizing:border-box}body{background:${T.bg}}input,select{font-family:'Hanken Grotesk',sans-serif!important}input:focus,select:focus{outline:2px solid ${T.accent}!important;outline-offset:1px}input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}input[type=number]{-moz-appearance:textfield}::-webkit-scrollbar{width:7px;height:7px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${T.border};border-radius:4px}`;
    document.head.appendChild(s); document.body.style.background=T.bg;
    return ()=>{try{document.head.removeChild(s);}catch{}};
  },[theme]);

  useEffect(()=>{
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,400&family=Hanken+Grotesk:wght@400;500;600&display=swap';
    document.head.appendChild(link);
    return ()=>{try{document.head.removeChild(link);}catch{}};
  },[]);

  if(loading) return <LoadingScreen/>;

  const weekDates  =getWeekDates(weekOffset);
  const wKey       =weekKey(weekOffset);
  const weekData   =schedules[wKey]||null;
  const schedule   =weekData?.schedule||null;
  const confirmed  =weekData?.confirmed||false;
  const monthOff   =getMonthOffsets(calMode==='month'?displayMonth:weekOffset);
  const pendingCount=timeOff.filter(t=>t.status==='Pending').length;
  const offThisWeek=employees.filter(e=>weekDates.some(d=>isOnTimeOff(e.id,d,timeOff)));
  const wkISOs=weekDates.map(dateToISO);
  const shiftDay=(delta)=>{
    const cur=weekDates[DAYS.indexOf(dayFilter||DAYS[0])];
    const nd=new Date(cur); nd.setDate(cur.getDate()+delta);
    const dow=nd.getDay();
    const mondayOfNd=new Date(nd); mondayOfNd.setDate(nd.getDate()-(dow===0?6:dow-1));
    const baseMonday=getMondayDate(0);
    const newOffset=Math.round((mondayOfNd-baseMonday)/(7*86400000));
    setWeekOffset(newOffset);
    setDayFilter(DAYS[dow===0?6:dow-1]);
  };

  const generate=(forOff=weekOffset)=>{
    setGenerating(true);setSelected(null);
    setTimeout(()=>{
      const wd=getWeekDates(forOff);
      const{schedule:s,total,noMgr}=buildSchedule(employees,blocks,wd,timeOff,allRoles);
      const notes=noMgr.length?t('sched.notesGaps',{total,n:noMgr.length}):t('sched.notesOk',{total});
      const warnings=noMgr.map(({day,block})=>'⚠️ '+t('sched.noMgr',{day:`${t('day.'+day)} ${fmt(wd[DAYS.indexOf(day)])}`,block}));
      setSchedules(p=>({...p,[weekKey(forOff)]:{schedule:s,notes,warnings}}));
      setGenerating(false);
    },100);
  };

  const generateMonth=()=>{
    setGenerating(true);setSelected(null);
    setTimeout(()=>{
      const updates={};
      getMonthOffsets(displayMonth).forEach(off=>{
        const wd=getWeekDates(off);
        const{schedule:s,total,noMgr}=buildSchedule(employees,blocks,wd,timeOff,allRoles);
        const notes=noMgr.length?t('sched.notesGaps',{total,n:noMgr.length}):t('sched.notesOk',{total});
        const warnings=noMgr.map(({day,block})=>'⚠️ '+t('sched.noMgr',{day:`${t('day.'+day)} ${fmt(wd[DAYS.indexOf(day)])}`,block}));
        updates[weekKey(off)]={schedule:s,notes,warnings};
      });
      setSchedules(p=>({...p,...updates}));setGenerating(false);
    },100);
  };

  // TEST ONLY: replaces the employee list with a set of test staff (several with
  // multiple roles, full-week availability, generous hours) and fills the whole
  // displayed month with shifts, so multi-role + full-coverage behavior can be
  // checked at a glance. Safe to remove once no longer needed.
  const seedTestDataAndGenerateMonth=()=>{
    const input=window.prompt('How many test employees? (4–40)','12');
    if(input===null)return;
    let n=parseInt(input,10);
    if(!Number.isFinite(n))return;
    n=Math.max(4,Math.min(40,n));
    if(!confirm(`This replaces your current employee list with ${n} generated test employees (varied roles, availability, and some approved time off) and fills the whole month with shifts.\n\nContinue?`))return;
    setGenerating(true);setSelected(null);
    setTimeout(()=>{
      const FIRST_NAMES=['Alma','Bo','Cecilie','Daniel','Emilie','Frederik','Gitte','Henrik','Ida','Jacob','Karen','Lars','Maja','Nikolaj','Oliver','Pernille','Rasmus','Sofie','Thomas','Ulla','Viggo','Winnie','Anders','Birgit','Christian','Ditte'];
      const LAST_NAMES=['Berg','Frank','Holm','Vang','Skov','Lang','Krogh','Toft','Fog','Ry','Møller','Nielsen','Hansen','Jensen','Larsen','Sørensen','Christensen','Pedersen','Andersen','Thomsen'];
      const SHIFT_TEMPLATES=[{from:'08:00',to:'16:00'},{from:'10:00',to:'16:00'},{from:'16:00',to:'00:00'},{from:'10:00',to:'00:00'},{from:'08:00',to:'00:00'}];
      const nonMgrRoles=allRoles.filter(r=>r!=='Manager');
      const usedNames=new Set();
      const randomName=()=>{
        let name;
        do{ name=`${FIRST_NAMES[Math.floor(Math.random()*FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(Math.random()*LAST_NAMES.length)]}`; }
        while(usedNames.has(name)&&usedNames.size<FIRST_NAMES.length*LAST_NAMES.length);
        usedNames.add(name);
        return name;
      };
      const randomRoles=()=>{
        const roles=[];
        if(Math.random()<0.18)roles.push('Manager');
        const shuffled=[...nonMgrRoles].sort(()=>Math.random()-0.5);
        const count=Math.random()<0.35?2:1;
        shuffled.slice(0,count).forEach(r=>roles.push(r));
        if(!roles.length)roles.push(nonMgrRoles[0]||'Waiter');
        return roles;
      };
      const randomAvailability=()=>{
        const avail={};
        DAYS.forEach(d=>{ avail[d]=Math.random()<0.22?null:SHIFT_TEMPLATES[Math.floor(Math.random()*SHIFT_TEMPLATES.length)]; });
        const availableDays=DAYS.filter(d=>avail[d]);
        if(availableDays.length<3)DAYS.filter(d=>!avail[d]).slice(0,3-availableDays.length).forEach(d=>{avail[d]=SHIFT_TEMPLATES[Math.floor(Math.random()*SHIFT_TEMPLATES.length)];});
        return avail;
      };
      const testEmployees=Array.from({length:n},(_,i)=>{
        const isCore=i<Math.ceil(n*0.3);
        return {
          id:crypto.randomUUID(), name:randomName(), roles:randomRoles(),
          priority:isCore?100:70+Math.floor(Math.random()*20),
          palIdx:i%EMP_PALETTE.length,
          contractType:isCore?'fixed':'hourly',
          contractPeriod:isCore?'month':'week',
          wage:isCore?30000+Math.floor(Math.random()*8000):150+Math.floor(Math.random()*30),
          maxHours:isCore?40+Math.floor(Math.random()*20):15+Math.floor(Math.random()*20),
          availability:randomAvailability(),
        };
      });
      // A handful of employees get a fake approved vacation/time-off entry
      // somewhere in the target month, so the generated schedule actually has
      // to work around real unavailability instead of everyone being free.
      const monthStart=new Date(displayMonth.y,displayMonth.m,1);
      const daysInMonth=new Date(displayMonth.y,displayMonth.m+1,0).getDate();
      const fakeTimeOff=[];
      testEmployees.forEach((e,i)=>{
        if(Math.random()<0.25){
          const span=1+Math.floor(Math.random()*4);
          const startOffset=Math.floor(Math.random()*Math.max(1,daysInMonth-span));
          const start=new Date(monthStart); start.setDate(1+startOffset);
          const end=new Date(start); end.setDate(start.getDate()+span-1);
          fakeTimeOff.push({id:crypto.randomUUID(), empId:e.id, startDate:dateToISO(start), endDate:dateToISO(end), type:TIMEOFF_TYPES[Math.floor(Math.random()*TIMEOFF_TYPES.length)], note:'', status:'Approved'});
        }
      });
      const updates={};
      getMonthOffsets(displayMonth).forEach(off=>{
        const wd=getWeekDates(off);
        // Jitter priority per week so a different mix of same-tier staff gets
        // picked each week — otherwise buildSchedule is deterministic and every
        // week ends up identical.
        const weekEmployees=testEmployees.map(e=>({...e,priority:e.priority+Math.floor(Math.random()*30)}));
        const{schedule:s,total,noMgr}=buildSchedule(weekEmployees,blocks,wd,fakeTimeOff,allRoles);
        const notes=noMgr.length?t('sched.notesGaps',{total,n:noMgr.length}):t('sched.notesOk',{total});
        const warnings=noMgr.map(({day,block})=>'⚠️ '+t('sched.noMgr',{day:`${t('day.'+day)} ${fmt(wd[DAYS.indexOf(day)])}`,block}));
        updates[weekKey(off)]={schedule:s,notes,warnings};
      });
      // Update local state directly (not the debounced setters) so the two
      // saves below can be strictly ordered — time_off.employee_id has a
      // foreign-key constraint on employees.id, so the employees insert must
      // land in the DB before the time-off insert that references it. Firing
      // both through the independent per-field debounces races them instead.
      setEmpRaw(testEmployees);
      setTORaw(fakeTimeOff);
      setSchedules(p=>({...p,...updates}));
      setCalMode('month');
      setGenerating(false);
      const runSeedSync=()=>{
        setSavingCount(c=>c+1);
        (async()=>{
          try{
            await syncEmployees(orgId,testEmployees);
            await syncTimeOff(orgId,fakeTimeOff);
            setSaveError(e=>(e&&e.label==='seed')?null:e);
          }catch(err){
            console.error('Seed sync failed:',err);
            setSaveError({label:'seed',message:err?.message||t('save.failedGeneric'),retry:runSeedSync});
          }finally{
            setSavingCount(c=>Math.max(0,c-1));
          }
        })();
      };
      runSeedSync();
    },100);
  };

  const confirmSchedule   =()=>setSchedules(p=>({...p,[wKey]:{...p[wKey],confirmed:true}}));
  const unconfirmSchedule =()=>setSchedules(p=>({...p,[wKey]:{...p[wKey],confirmed:false}}));
  const deleteSchedule    =()=>{setSchedules(p=>{const n={...p};delete n[wKey];return n;});setSelected(null);};
  const deleteMonth       =()=>{const offs=getMonthOffsets(displayMonth);setSchedules(p=>{const n={...p};offs.forEach(off=>delete n[weekKey(off)]);return n;});};

  const handleSlotClick=(day,blockId,entry,idx)=>{
    if(!schedule)return;setOpenPicker(null);
    if(!selected){setSelected({...entry,day,blockId,idx});return;}
    if(selected.day===day&&selected.blockId===blockId&&selected.idx===idx){setSelected(null);return;}
    const ns=JSON.parse(JSON.stringify(schedule));
    const src=ns[selected.day][selected.blockId],dst=ns[day][blockId];
    const se=src[selected.idx],de=dst[idx];
    src[selected.idx]={...de,role:se.role};dst[idx]={...se,role:de.role};
    setSchedules(p=>({...p,[wKey]:{...p[wKey],schedule:ns}}));setSelected(null);
  };

  const handleEmptySlotClick=(day,blockId,role)=>{
    if(!selected||!schedule)return;
    const ns=JSON.parse(JSON.stringify(schedule));
    const entry=ns[selected.day][selected.blockId].splice(selected.idx,1)[0];
    ns[day][blockId]=[...(ns[day][blockId]||[]),{...entry,role}];
    setSchedules(p=>({...p,[wKey]:{...p[wKey],schedule:ns}}));setSelected(null);
  };

  const empHoursMap=employees.reduce((acc,e)=>{
    if(!schedule){acc[e.id]=0;return acc;}
    let h=0;DAYS.forEach(day=>blocks.forEach(b=>{if((schedule[day]?.[b.id]||[]).some(a=>a.empId===e.id))h+=blockHours(b);}));
    acc[e.id]=h;return acc;
  },{});
  const empHours=id=>empHoursMap[id]||0;

  const eligibleForSlot=(day,blockId,role)=>{
    if(!schedule)return[];
    const block=blocks.find(b=>b.id===blockId);if(!block)return[];
    const bh=blockHours(block),date=weekDates[DAYS.indexOf(day)];
    const working=new Set(blocks.flatMap(b=>(schedule[day]?.[b.id]||[]).map(a=>a.empId)));
    return employees.filter(e=>(e.roles||[]).includes(role)&&coversBlock(e.availability[day],block)&&!isOnTimeOff(e.id,date,timeOff)&&!working.has(e.id)&&empHours(e.id)+bh<=e.maxHours).sort((a,b)=>(a.priority||100)-(b.priority||100));
  };

  const addToSlot=(day,blockId,role,emp)=>{
    const ns=JSON.parse(JSON.stringify(schedule));
    ns[day][blockId]=[...(ns[day][blockId]||[]),{empId:emp.id,name:emp.name,role}];
    setSchedules(p=>({...p,[wKey]:{...p[wKey],schedule:ns,confirmed:false}}));setOpenPicker(null);
  };

  const updateEmp   =(id,f,v)=>setEmployees(p=>p.map(e=>e.id===id?{...e,[f]:v}:e));
  const updateAvail =(id,day,f,v)=>setEmployees(p=>p.map(e=>{if(e.id!==id)return e;const cur=e.availability[day]||{from:'10:00',to:'18:00'};return{...e,availability:{...e.availability,[day]:{...cur,[f]:v}}};}));
  const toggleDay   =(id,day)=>setEmployees(p=>p.map(e=>{if(e.id!==id)return e;const cur=e.availability[day];return{...e,availability:{...e.availability,[day]:cur?null:{from:'10:00',to:'18:00'}}};}));
  const applyTemplate=(id,tpl)=>{const tmpl=AVAIL_TEMPLATES[tpl];if(tmpl)setEmployees(p=>p.map(e=>e.id===id?{...e,availability:JSON.parse(JSON.stringify(tmpl))}:e));};
  const duplicateEmp=emp=>setEmployees(p=>[...p,{...JSON.parse(JSON.stringify(emp)),id:crypto.randomUUID(),name:emp.name+' (copy)',palIdx:p.length%EMP_PALETTE.length}]);
  const removeEmp   =id=>{setEmployees(p=>p.filter(e=>e.id!==id));if(expandedEmp===id)setExpandedEmp(null);};
  const addEmployee =()=>{
    if(!newEmp.name.trim())return;
    setEmployees(p=>[...p,{...newEmp,id:crypto.randomUUID(),palIdx:p.length%EMP_PALETTE.length,availability:Object.fromEntries(DAYS.map(d=>[d,null]))}]);
    setNewEmp({name:'',roles:['Manager'],priority:100,contractType:'hourly',contractPeriod:'week',wage:0,maxHours:40});setShowAddEmp(false);
  };

  const addTO         =()=>{if(!newTO.empId)return;setTimeOff(p=>[...p,{...newTO,id:crypto.randomUUID()}]);setNewTO({empId:'',startDate:todayISO(),endDate:todayISO(),type:'Holiday',note:'',status:'Pending'});setShowAddTO(false);};
  const updateTOStatus=(id,status)=>setTimeOff(p=>p.map(t=>t.id===id?{...t,status}:t));
  const removeTO      =id=>setTimeOff(p=>p.filter(t=>t.id!==id));

  const calcWageCost=(e,hours)=>{const wage=e.wage||0;if(!wage)return parseFloat((hours*(e.priority||100)/100).toFixed(2));if((e.contractType||'hourly')==='hourly')return parseFloat((hours*wage).toFixed(2));const cm=e.maxHours||40,wim=4.33,mh=(e.contractPeriod||'week')==='month'?cm:cm*wim;return parseFloat(((hours/mh)*((e.contractPeriod||'week')==='month'?wage:wage*wim)).toFixed(2));};
  const hasWages=employees.some(e=>e.wage>0);
  const costData=employees.map(e=>({emp:e,hours:empHours(e.id),costUnits:hasWages?calcWageCost(e,empHours(e.id)):parseFloat((empHours(e.id)*(e.priority||100)/100).toFixed(2))}));
  const totalCostUnits=costData.reduce((s,d)=>s+d.costUnits,0);
  const maxCostUnits=Math.max(...costData.map(d=>d.costUnits),0.01);
  const monthCostData=employees.map(e=>{let h=0;getMonthOffsets(displayMonth).forEach(off=>{const ws=schedules[weekKey(off)]?.schedule;if(!ws)return;DAYS.forEach(day=>blocks.forEach(b=>{if((ws[day]?.[b.id]||[]).some(a=>a.empId===e.id))h+=blockHours(b);}));});return{emp:e,hours:h,costUnits:hasWages?calcWageCost(e,h):parseFloat((h*(e.priority||100)/100).toFixed(2))};});
  const totalMonthCostUnits=monthCostData.reduce((s,d)=>s+d.costUnits,0);
  const maxMonthCostUnits=Math.max(...monthCostData.map(d=>d.costUnits),0.01);
  const mkRoleCosts=data=>allRoles.reduce((acc,r)=>{acc[r]=parseFloat(data.filter(d=>(d.emp.roles||[]).includes(r)).reduce((s,d)=>s+d.costUnits,0).toFixed(2));return acc;},{});
  const weekRoleCosts=mkRoleCosts(costData),monthRoleCosts=mkRoleCosts(monthCostData);
  const toMoney=u=>{if(hasWages){const v=u;return v>=10000?`kr ${Math.round(v/1000)}k`:`kr ${Math.round(v).toLocaleString('da-DK')}`;}const val=u*hourlyRate.amount;return val>=10000?`${hourlyRate.currency} ${Math.round(val/1000)}k`:`${hourlyRate.currency} ${Math.round(val).toLocaleString('da-DK')}`;};

  const totalStats=()=>{if(!schedule)return null;let f=0,m=0;DAYS.forEach(day=>blocks.forEach(b=>{const a=schedule[day]?.[b.id]||[],r=getBlockRoles(b,day);f+=a.length;allRoles.forEach(role=>{const need=r[role]||0,got=a.filter(x=>x.role===role).length;if(got<need)m+=(need-got);});}));return{filled:f,missing:m};};
  const stats=totalStats();
  const cDot=s=>(isDark()?{full:{bg:'#5AAE8025',border:'#5AAE8080',text:'#7BC79A'},partial:{bg:'#D4A83025',border:'#D4A83080',text:'#E0BC5E'},low:{bg:'#D0606025',border:'#D0606080',text:'#E08585'},empty:{bg:T.bg,border:T.border,text:T.text3}}:{full:{bg:'#D4F0E2',border:'#5AAE80',text:'#236040'},partial:{bg:'#FBF0D5',border:'#D4A830',text:'#7A5010'},low:{bg:'#F5E2E2',border:'#D06060',text:'#783030'},empty:{bg:T.bg,border:T.border,text:T.text3}})[s];
  const filteredTO=timeOff.filter(to=>{if(toFilter==='pending')return to.status==='Pending';if(toFilter==='approved')return to.status==='Approved';if(toFilter==='this-week')return wkISOs.some(iso=>to.startDate<=iso&&to.endDate>=iso);return true;}).sort((a,b)=>a.startDate.localeCompare(b.startDate));
  const navItems=[{k:'schedule',l:t('nav.schedule')},{k:'employees',l:t('nav.employees')},{k:'timeoff',l:pendingCount?`${t('nav.timeoff')} · ${pendingCount}`:t('nav.timeoff')},{k:'coverage',l:t('nav.coverage')},{k:'costs',l:t('nav.costs')}];
  const notes=weekData?.notes||'',warnings=weekData?.warnings||[];

  const s=styles;

  return (
    <div style={{minHeight:'100vh',width:'100vw',background:T.bg,backgroundImage:isDark()?'radial-gradient(circle at 12% 6%, rgba(217,122,74,0.07), transparent 38%), radial-gradient(circle at 88% 94%, rgba(95,174,122,0.06), transparent 42%)':'radial-gradient(circle at 12% 6%, rgba(191,90,44,0.045), transparent 38%), radial-gradient(circle at 88% 94%, rgba(61,122,82,0.04), transparent 42%)',backgroundAttachment:'fixed',fontFamily:"'Hanken Grotesk',sans-serif",color:T.text,fontSize:13}}>
      <div style={{background:T.surface,borderBottom:`1px solid ${T.border}`,padding:isMobile?'0 12px':'0 24px',display:'flex',alignItems:'center',height:56,position:'sticky',top:0,zIndex:100,boxShadow:'0 2px 14px -8px rgba(33,27,21,0.18)'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginRight:isMobile?'auto':36,minWidth:0,overflow:'hidden'}}>
          <button onClick={onBack} style={{display:'flex',alignItems:'center',gap:5,padding:'4px 8px',borderRadius:7,background:'transparent',border:'none',cursor:'pointer',color:T.text3,fontFamily:'inherit',fontSize:12,flexShrink:0}} onMouseEnter={e=>e.currentTarget.style.color=T.text} onMouseLeave={e=>e.currentTarget.style.color=T.text3}>{'‹ '+t('to.all')}</button>
          <div style={{display:'flex',alignItems:'baseline',gap:7,minWidth:0,overflow:'hidden'}}>
            <span style={{fontFamily:'Fraunces, Georgia, serif',fontSize:21,fontWeight:600,color:T.text,letterSpacing:'-0.02em',flexShrink:0}}>Rorota</span>
            <span style={{fontSize:11,color:T.text3,fontWeight:500,letterSpacing:'0.03em',textTransform:'uppercase',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{orgName}</span>
          </div>
        </div>
        {!isMobile&&(<>
        <div style={{display:'flex',alignItems:'center',flex:1}}>
          {navItems.map(({k,l})=>{const active=view===k;return(<button key={k} onClick={()=>setView(k)} style={{fontFamily:'inherit',padding:'0 16px',height:56,background:'none',border:'none',cursor:'pointer',fontSize:13,fontWeight:active?500:400,color:active?T.text:T.text2,position:'relative',transition:'color 0.15s',whiteSpace:'nowrap'}}>{l}{active&&<div style={{position:'absolute',bottom:0,left:16,right:16,height:2,background:T.accent,borderRadius:'2px 2px 0 0'}}/>}</button>);})}
        </div>
        <select value={lang} onChange={e=>setLang(e.target.value)} style={{fontFamily:'inherit',fontSize:12,color:T.text2,background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:'6px 8px',marginRight:8,cursor:'pointer',outline:'none'}}>{LANGUAGES.map(L=><option key={L.code} value={L.code}>{L.flag} {L.label}</option>)}</select>
        <button onClick={toggleTheme} style={{width:34,height:34,marginRight:8,borderRadius:8,border:`1px solid ${T.border}`,background:T.surface,color:T.text2,cursor:'pointer',fontSize:15,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{isDark()?'☀':'☾'}</button>
        <Btn onClick={()=>calMode==='month'?generateMonth():generate()} disabled={generating} variant="primary">{generating?t('common.generating'):'✦ '+t('common.generate')}</Btn>
        <span style={{marginLeft:8,display:'inline-block'}}><Btn onClick={seedTestDataAndGenerateMonth} disabled={generating} variant="secondary">🧪 Test: full month</Btn></span>
        </>)}
        {isMobile&&(
          <button onClick={()=>setMobileMenuOpen(p=>!p)} aria-label="Menu" style={{width:36,height:36,marginLeft:8,borderRadius:8,border:`1px solid ${T.border}`,background:mobileMenuOpen?T.surfaceWarm:T.surface,color:T.text,cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{mobileMenuOpen?'✕':'☰'}</button>
        )}
      </div>

      {isMobile&&mobileMenuOpen&&(
        <div style={{position:'fixed',top:56,left:0,right:0,background:T.surface,borderBottom:`1px solid ${T.border}`,boxShadow:'0 12px 30px -12px rgba(33,27,21,0.35)',zIndex:99,padding:'8px 16px 16px',display:'flex',flexDirection:'column',gap:4,maxHeight:'calc(100vh - 56px)',overflowY:'auto'}}>
          {navItems.map(({k,l})=>{const active=view===k;return(<button key={k} onClick={()=>{setView(k);setMobileMenuOpen(false);}} style={{fontFamily:'inherit',textAlign:'left',padding:'11px 12px',borderRadius:8,background:active?T.surfaceWarm:'transparent',border:'none',cursor:'pointer',fontSize:14,fontWeight:active?600:400,color:active?T.text:T.text2}}>{l}</button>);})}
          <div style={{display:'flex',gap:8,marginTop:8,alignItems:'center'}}>
            <select value={lang} onChange={e=>setLang(e.target.value)} style={{flex:1,fontFamily:'inherit',fontSize:13,color:T.text2,background:T.surfaceWarm,border:`1px solid ${T.border}`,borderRadius:8,padding:'8px 10px',cursor:'pointer',outline:'none'}}>{LANGUAGES.map(L=><option key={L.code} value={L.code}>{L.flag} {L.label}</option>)}</select>
            <button onClick={toggleTheme} style={{width:38,height:38,borderRadius:8,border:`1px solid ${T.border}`,background:T.surfaceWarm,color:T.text2,cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{isDark()?'☀':'☾'}</button>
          </div>
          <div style={{marginTop:8}}><Btn onClick={()=>{setMobileMenuOpen(false);calMode==='month'?generateMonth():generate();}} disabled={generating} variant="primary">{generating?t('common.generating'):'✦ '+t('common.generate')}</Btn></div>
          <div style={{marginTop:6}}><Btn onClick={()=>{setMobileMenuOpen(false);seedTestDataAndGenerateMonth();}} disabled={generating} variant="secondary">🧪 Test: full month</Btn></div>
        </div>
      )}

      {saveError?(
        <div style={{position:'fixed',bottom:20,left:isMobile?14:'auto',right:20,maxWidth:isMobile?'calc(100% - 28px)':360,zIndex:200,background:T.surface,border:`1px solid ${T.danger}55`,borderRadius:12,padding:'12px 14px',display:'flex',alignItems:'flex-start',gap:10,boxShadow:'0 12px 30px -10px rgba(33,27,21,0.35)'}}>
          <span style={{fontSize:14}}>⚠️</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:12,color:T.danger,fontWeight:500,marginBottom:8}}>{t('save.failedPrefix')} {saveError.message}</div>
            <div style={{display:'flex',gap:6}}>
              <Btn small variant="danger" onClick={saveError.retry}>{t('save.retry')}</Btn>
              <Btn small variant="ghost" onClick={()=>setSaveError(null)}>{t('save.dismiss')}</Btn>
            </div>
          </div>
        </div>
      ):savingCount>0&&(
        <div style={{position:'fixed',bottom:20,left:isMobile?14:'auto',right:20,zIndex:200,background:T.surface,border:`1px solid ${T.border}`,borderRadius:999,padding:'6px 14px',fontSize:12,color:T.text3,boxShadow:'0 8px 20px -10px rgba(33,27,21,0.3)'}}>
          {t('save.saving')}
        </div>
      )}

      <div style={{maxWidth:1100,margin:'0 auto',padding:isMobile?'20px 14px':'24px 20px'}}>

{/* SCHEDULE */}
{view==='schedule'&&(<div>
  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:20,flexWrap:'wrap',...(calMode!=='grid'?{position:'sticky',top:56,zIndex:20,background:T.bg,backgroundImage:isDark()?'radial-gradient(circle at 12% 6%, rgba(217,122,74,0.07), transparent 38%), radial-gradient(circle at 88% 94%, rgba(95,174,122,0.06), transparent 42%)':'radial-gradient(circle at 12% 6%, rgba(191,90,44,0.045), transparent 38%), radial-gradient(circle at 88% 94%, rgba(61,122,82,0.04), transparent 42%)',backgroundAttachment:'fixed',paddingTop:8,marginTop:-8,paddingBottom:8}:{})}}>
    <div style={{display:'flex',alignItems:'center',gap:4,background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:3}}>
      <button onClick={()=>{if(calMode==='month'){setDisplayMonth(p=>p.m===0?{y:p.y-1,m:11}:{y:p.y,m:p.m-1});}else if(calMode==='week'&&dayFilter){shiftDay(-1);}else{setWeekOffset(w=>w-1);}}} style={{padding:'4px 10px',borderRadius:6,background:'none',border:'none',cursor:'pointer',color:T.text2,fontFamily:'inherit',fontSize:13}}>‹</button>
      <span style={{fontSize:13,fontWeight:500,minWidth:150,textAlign:'center',color:T.text,padding:'0 4px'}}>{calMode==='month'?new Date(displayMonth.y,displayMonth.m,1).toLocaleDateString('en-GB',{month:'long',year:'numeric'}):calMode==='week'&&dayFilter?`${t('day.'+dayFilter)} ${fmt(weekDates[DAYS.indexOf(dayFilter)])}`:`${fmt(weekDates[0])} – ${fmt(weekDates[6])}`}</span>
      <button onClick={()=>{if(calMode==='month'){setDisplayMonth(p=>p.m===11?{y:p.y+1,m:0}:{y:p.y,m:p.m+1});}else if(calMode==='week'&&dayFilter){shiftDay(1);}else{setWeekOffset(w=>w+1);}}} style={{padding:'4px 10px',borderRadius:6,background:'none',border:'none',cursor:'pointer',color:T.text2,fontFamily:'inherit',fontSize:13}}>›</button>
    </div>
    <button onClick={()=>{setWeekOffset(0);const n=new Date();setDisplayMonth({y:n.getFullYear(),m:n.getMonth()});if(calMode==='week'&&dayFilter){const jsDay=n.getDay();setDayFilter(DAYS[jsDay===0?6:jsDay-1]);}}} style={{padding:'5px 12px',borderRadius:8,background:T.surface,border:`1px solid ${T.border}`,cursor:'pointer',fontSize:12,color:T.text2,fontFamily:'inherit'}}>{t('common.today')}</button>
    <div style={{display:'flex',background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:3,gap:2}}>
      {[['week',t('sched.week')],['month',t('sched.month')],['grid',t('sched.team')]].map(([k,l])=><button key={k} onClick={()=>{setDayFilter(null);setCalMode(k);}} style={{padding:'4px 12px',borderRadius:6,background:calMode===k?T.bg:'transparent',border:calMode===k?`1px solid ${T.border}`:'1px solid transparent',cursor:'pointer',fontSize:12,fontWeight:calMode===k?500:400,color:calMode===k?T.text:T.text2,fontFamily:'inherit'}}>{l}</button>)}
    </div>
    {calMode==='week'&&dayFilter&&(<button onClick={()=>setDayFilter(null)} style={{display:'flex',alignItems:'center',gap:6,padding:'4px 10px',borderRadius:999,background:T.accentLight,border:`1px solid ${T.accent}44`,color:T.accent,fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'inherit'}}>{t('week.showingDay',{day:t('day.'+dayFilter)})} ✕</button>)}
    {calMode==='week'&&dayFilter&&(()=>{const offDate=weekDates[DAYS.indexOf(dayFilter)],off=employees.filter(e=>isOnTimeOff(e.id,offDate,timeOff));if(!off.length)return null;return(
      <span title={off.map(e=>e.name).join(', ')} style={{display:'flex',alignItems:'center',gap:6,padding:'4px 10px',borderRadius:999,background:T.warningLight,border:`1px solid ${T.warning}44`,color:T.warning,fontSize:12,fontWeight:500}}>🌴 {t('week.offToday',{n:off.length})}</span>
    );})()}
    {calMode==='week'&&schedule&&(<div style={{marginLeft:'auto',display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
      <span style={{fontSize:12,color:T.text2}}>{stats?.filled||0} slots</span>
      {stats?.missing>0&&<span style={{fontSize:12,color:T.danger,fontWeight:500,background:T.dangerLight,padding:'2px 10px',borderRadius:999,border:`1px solid ${T.danger}33`}}>{stats.missing} missing</span>}
      {stats?.missing===0&&<span style={{fontSize:12,color:T.success,fontWeight:500,background:T.successLight,padding:'2px 10px',borderRadius:999,border:`1px solid ${T.success}33`}}>{t('sched.fullCoverage')} ✓</span>}
      <div style={{width:1,height:16,background:T.border}}/>
      {confirmed?<span style={{fontSize:12,color:T.success,fontWeight:500,background:T.successLight,padding:'2px 10px',borderRadius:999,border:`1px solid ${T.success}33`}}>✓ {t('sched.confirmed')}</span>:<span style={{fontSize:12,color:T.text3,background:T.surfaceWarm,padding:'2px 10px',borderRadius:999,border:`1px solid ${T.border}`}}>{t('sched.draft')}</span>}
      {confirmed?<Btn small variant="ghost" onClick={unconfirmSchedule}>{t('sched.unconfirm')}</Btn>:<Btn small variant="success" onClick={confirmSchedule}>{t('sched.confirm')}</Btn>}
      <Btn small variant="danger" onClick={deleteSchedule}>{t('common.delete')}</Btn>
    </div>)}
  </div>
  {offThisWeek.length>0&&calMode!=='month'&&(<div style={{background:T.warningLight,border:`1px solid ${T.warning}33`,borderRadius:10,padding:'10px 14px',marginBottom:16,display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}><span style={{fontSize:13,color:T.warning}}>🌴</span><span style={{fontSize:12,fontWeight:500,color:T.warning}}>{t('sched.onLeaveWeek')}</span><div style={{display:'flex',gap:5,flexWrap:'wrap'}}>{offThisWeek.map(e=><EmpChip key={e.id} emp={e}/>)}</div></div>)}
  {selected&&(<div style={{background:T.accentLight,border:`1px solid ${T.accent}44`,borderRadius:10,padding:'10px 14px',marginBottom:16,display:'flex',alignItems:'center',gap:10}}><span>✋</span><span style={{fontSize:12,color:T.accentText}}><b>{selected.name}</b>{t('sched.swapHintTail')}</span><button onClick={()=>setSelected(null)} style={{marginLeft:'auto',padding:'4px 10px',borderRadius:6,background:'transparent',border:`1px solid ${T.accent}55`,color:T.accent,cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>{t('common.cancel')}</button></div>)}
  {confirmed&&calMode!=='month'&&(<div style={{background:T.successLight,border:`1px solid ${T.success}44`,borderRadius:10,padding:'10px 16px',marginBottom:16,display:'flex',alignItems:'center',gap:10}}><span>✅</span><span style={{flex:1,fontSize:12,fontWeight:600,color:T.success}}>{t('sched.confirmedBanner')}.</span><Btn small variant="ghost" onClick={unconfirmSchedule}>{t('sched.unconfirm')}</Btn></div>)}
  {notes&&<div style={{fontSize:12,color:T.text2,background:T.surfaceWarm,border:`1px solid ${T.border}`,borderRadius:10,padding:'10px 14px',marginBottom:16,display:'flex',gap:8}}><span>💡</span><span>{notes}</span></div>}
  {warnings.filter(w=>w.startsWith('⚠️')).map((w,i)=><div key={i} style={{fontSize:12,color:T.danger,background:T.dangerLight,border:`1px solid ${T.danger}33`,borderRadius:10,padding:'8px 14px',marginBottom:8}}>{w}</div>)}

{/* MONTH VIEW */}
{calMode==='month'&&(<div style={{...s.cardFlush,padding:0}}>
  <div style={{display:'grid',gridTemplateColumns:'48px repeat(7,1fr)',borderBottom:`1px solid ${T.border}`,background:T.surfaceWarm}}><div/>{DAYS.map(d=><div key={d} style={{padding:'10px 4px',textAlign:'center',fontSize:11,fontWeight:600,color:T.text2,textTransform:'uppercase',letterSpacing:'0.06em'}}>{t('day.'+d)}</div>)}</div>
  {monthOff.map(off=>{
    const wd=getWeekDates(off),k=weekKey(off),ws=schedules[k]?.schedule||null,wConf=schedules[k]?.confirmed||false,isCur=off===weekOffset;
    return(<div key={off} style={{display:'grid',gridTemplateColumns:'48px repeat(7,1fr)',borderBottom:`1px solid ${T.border}`,background:isCur?T.accentLight:wConf?T.successLight+'88':'transparent'}}>
      <div style={{display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',gap:4,padding:'8px 4px',borderRight:`1px solid ${T.border}`}}>
        {wConf&&<span style={{fontSize:9,color:T.success,fontWeight:600}}>✓</span>}
        <button onClick={()=>{setWeekOffset(off);setCalMode('week');}} style={{fontSize:9,padding:'2px 6px',borderRadius:4,cursor:'pointer',border:`1px solid ${isCur?T.accent:T.border}`,background:isCur?T.accent:'transparent',color:isCur?'#fff':T.text3,fontFamily:'inherit'}}>{t('month.view')}</button>
        {!ws&&<button onClick={()=>generate(off)} style={{fontSize:9,padding:'2px 6px',borderRadius:4,cursor:'pointer',border:`1px solid ${T.accent}`,background:'transparent',color:T.accent,fontFamily:'inherit'}}>{t('month.gen')}</button>}
      </div>
      {wd.map((d,di)=>{
        const dayName=DAYS[di],inMonth=d.getMonth()===displayMonth.m&&d.getFullYear()===displayMonth.y;
        const status=ws?dayCoverage(ws,blocks,dayName,allRoles):'empty',dot=cDot(status);
        const empCount=ws?[...new Set(Object.values(ws[dayName]||{}).flatMap(a=>a.map(x=>x.empId)))].length:0;
        const offCount=employees.filter(e=>isOnTimeOff(e.id,d,timeOff)).length;
        return(<div key={di} onClick={()=>{setWeekOffset(off);setCalMode('week');}} style={{padding:'8px 6px',cursor:'pointer',borderRight:di<6?`1px solid ${T.border}`:'none',background:inMonth?dot.bg:'transparent',opacity:inMonth?1:0.35,minHeight:60}}>
          <div style={{fontSize:13,fontWeight:500,color:inMonth?dot.text:T.text3,marginBottom:2}}>{d.getDate()}</div>
          {ws&&inMonth&&<div style={{fontSize:10,color:dot.text}}>{t('common.staffN',{n:empCount})}</div>}
          {offCount>0&&inMonth&&<div style={{fontSize:10,color:T.warning}}>🌴 {offCount}</div>}
          {!ws&&inMonth&&<div style={{fontSize:10,color:T.text3}}>—</div>}
        </div>);
      })}
    </div>);
  })}
  <div style={{display:'flex',gap:16,padding:'12px 16px',background:T.surfaceWarm,alignItems:'center',flexWrap:'wrap'}}>
    <span style={{fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em'}}>{t('month.coverage')}</span>
    {[['full',t('month.full')],['partial',t('month.partial')],['low',t('month.low')],['empty',t('month.notGenerated')]].map(([sv,l])=>{const d=cDot(sv);return<div key={sv} style={{display:'flex',alignItems:'center',gap:5}}><div style={{width:10,height:10,borderRadius:3,background:d.bg,border:`1px solid ${d.border}`}}/><span style={{fontSize:11,color:T.text2}}>{l}</span></div>;})}
    {monthOff.some(off=>schedules[weekKey(off)])&&<><div style={{flex:1}}/><Btn small variant="danger" onClick={deleteMonth}>{t('month.deleteMonth')}</Btn></>}
  </div>
</div>)}

{/* GRID VIEW — Planday-style: employees as rows, days as columns */}
{calMode==='grid'&&(!schedule?(<div style={{...s.card,padding:'52px 32px',textAlign:'center',position:'relative',overflow:'hidden'}}>
  <div style={{position:'absolute',inset:0,backgroundImage:`radial-gradient(circle, ${T.border} 1px, transparent 1px)`,backgroundSize:'24px 24px',opacity:0.5,pointerEvents:'none'}}/>
  <div style={{position:'relative'}}>
    <div style={{fontSize:40,marginBottom:16,opacity:0.25}}>📋</div>
    <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:22,fontWeight:500,color:T.text,marginBottom:8}}>{t('empty.nothing')}</div>
    <div style={{fontSize:13,color:T.text2,marginBottom:4}}>{t.n('empty.across',blocks.length,{emp:employees.length,blocks:blocks.length})}</div>
    <div style={{fontSize:12,color:T.text3,marginBottom:28}}>{t('empty.respected')}</div>
    <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap'}}><Btn onClick={()=>generate()}>{'✦ '+t('empty.generateWeek')}</Btn><Btn onClick={generateMonth} variant="secondary">{t('empty.generateMonth')}</Btn></div>
  </div>
</div>):(()=>{
  // Sort/group employees — in "by role" mode, an employee with multiple roles appears once per matching role group
  const allRoleOrder=Object.keys(roleStyles);
  const rows=gridGroupBy==='role'
    ?allRoleOrder
        .filter(role=>employees.some(e=>(e.roles||[]).includes(role)))
        .flatMap(role=>[...employees].filter(e=>(e.roles||[]).includes(role)).sort((a,b)=>a.name.localeCompare(b.name)).map(emp=>({emp,role})))
    :[...employees].sort((a,b)=>a.name.localeCompare(b.name)).map(emp=>({emp,role:null}));
  const rowH=gridTight?60:80;
  const nameW=gridTight?140:180;
  return(
  <div>
    {/* Grid controls + header — sticky so they stay visible while scrolling the employee list */}
    <div style={{position:'sticky',top:56,zIndex:20,background:T.bg,backgroundImage:isDark()?'radial-gradient(circle at 12% 6%, rgba(217,122,74,0.07), transparent 38%), radial-gradient(circle at 88% 94%, rgba(95,174,122,0.06), transparent 42%)':'radial-gradient(circle at 12% 6%, rgba(191,90,44,0.045), transparent 38%), radial-gradient(circle at 88% 94%, rgba(61,122,82,0.04), transparent 42%)',backgroundAttachment:'fixed',paddingTop:8,marginTop:-8}}>
      <div style={{display:'flex',gap:8,marginBottom:12,alignItems:'center',flexWrap:'wrap'}}>
        <div style={{display:'flex',background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:3,gap:2}}>
          {[['name',t('grid.byName')],['role',t('grid.byRole')]].map(([k,l])=><button key={k} onClick={()=>setGridGroupBy(k)} style={{padding:'4px 12px',borderRadius:6,background:gridGroupBy===k?T.bg:'transparent',border:gridGroupBy===k?`1px solid ${T.border}`:'1px solid transparent',cursor:'pointer',fontSize:12,fontWeight:gridGroupBy===k?500:400,color:gridGroupBy===k?T.text:T.text2,fontFamily:'inherit'}}>{l}</button>)}
        </div>
        <button onClick={()=>setGridTight(p=>!p)} style={{padding:'4px 12px',borderRadius:8,background:gridTight?T.bg:T.surface,border:`1px solid ${T.border}`,cursor:'pointer',fontSize:12,color:gridTight?T.text:T.text2,fontFamily:'inherit',fontWeight:gridTight?500:400}}>
          {gridTight?t('grid.compact'):t('grid.comfortable')}
        </button>
        <span style={{fontSize:12,color:T.text3,marginLeft:4}}>{t('grid.scheduledOfTotal',{n:employees.filter(e=>Object.values(schedule).some(day=>Object.values(day).some(b=>b.some(a=>a.empId===e.id)))).length,total:employees.length})}</span>
      </div>
      <div style={{...s.cardFlush,overflowX:'auto',overflowY:'visible',borderBottomLeftRadius:0,borderBottomRightRadius:0}}>
        {/* Header */}
        <div style={{display:'grid',gridTemplateColumns:`${nameW}px repeat(7,1fr)`,minWidth:700,borderBottom:`2px solid ${T.border}`,background:T.surfaceWarm}}>
          <div style={{padding:gridTight?'10px 14px':'14px 20px',fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.08em',borderRight:`1px solid ${T.border}`}}>{t('to.employee')}</div>
          {DAYS.map((day,i)=>{
            const date=weekDates[i],isToday=dateToISO(date)===dateToISO(new Date());
            return(<div key={day} style={{padding:gridTight?'10px 8px':'14px 12px',textAlign:'center',borderRight:i<6?`1px solid ${T.border}`:'none'}}>
              <div style={{fontSize:gridTight?12:13,fontWeight:600,color:isToday?T.accent:T.text}}>{t('day.'+day)}</div>
              <div style={{fontSize:gridTight?10:12,color:isToday?T.accent:T.text3,marginTop:1}}>{date.getDate()} {date.toLocaleDateString('en-GB',{month:'short'})}</div>
            </div>);
          })}
        </div>
      </div>
    </div>
    <div style={{...s.cardFlush,overflowX:'auto',overflowY:'visible',borderTop:'none',borderTopLeftRadius:0,borderTopRightRadius:0}}>
      {/* Rows */}
      {rows.map((row,ri)=>{
        const emp=row.emp;
        const p=pal(emp);
        const prevRole=ri>0?rows[ri-1].role:undefined;
        const showDivider=gridGroupBy==='role'&&row.role!==prevRole;
        return(<div key={`${row.role||'all'}-${emp.id}`}>
          {/* Role group divider */}
          {showDivider&&<div style={{display:'grid',gridTemplateColumns:`${nameW}px repeat(7,1fr)`,minWidth:700,background:T.surfaceWarm,borderTop:`2px solid ${T.border}`,borderBottom:`1px solid ${T.border}`}}>
            <div style={{padding:'6px 14px',display:'flex',alignItems:'center',gap:8,borderRight:`1px solid ${T.border}`}}>
              <RoleBadge role={row.role} rs={roleStyles[row.role]}/>
            </div>
            {DAYS.map((_,i)=><div key={i} style={{borderRight:i<6?`1px solid ${T.border}`:'none'}}/>)}
          </div>}
          <div style={{display:'grid',gridTemplateColumns:`${nameW}px repeat(7,1fr)`,minWidth:700,borderBottom:`1px solid ${T.border}`,background:ri%2===1?T.surfaceWarm:T.surface}}>
            {/* Name cell */}
            <div style={{padding:gridTight?'8px 14px':'12px 20px',borderRight:`1px solid ${T.border}`,display:'flex',alignItems:'center',gap:gridTight?8:10,minHeight:rowH}}>
              {!gridTight&&<div style={{width:36,height:36,borderRadius:'50%',background:isDark()?p.dot+'25':p.bg,color:isDark()?p.dot:p.text,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,flexShrink:0,border:`2px solid ${p.dot}33`}}>{initials(emp.name)}</div>}
              <div style={{minWidth:0}}>
                <div style={{fontSize:gridTight?12:14,fontWeight:600,color:T.text,lineHeight:1.2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{gridTight?emp.name.split(' ')[0]:emp.name}</div>
                {!gridTight&&<div style={{fontSize:11,color:T.text3,marginTop:2}}>{emp.name.split(' ').slice(1).join(' ')}</div>}
                {!gridTight&&<div style={{display:'flex',gap:3,marginTop:3,flexWrap:'wrap'}}>{(emp.roles||[]).slice(0,2).map(r=>{const rs=roleStyles[r]||DEFAULT_ROLE_STYLES.Other;return<span key={r} style={{fontSize:9,fontWeight:600,color:isDark()?rs.dot:rs.text,background:isDark()?rs.dot+'22':rs.bg,border:`1px solid ${isDark()?rs.dot+'55':rs.border}`,padding:'1px 5px',borderRadius:999}}>{r}</span>;})}</div>}
                {!gridTight&&(()=>{const h=empHours(emp.id);return(
                  <div style={{display:'flex',alignItems:'center',gap:6,marginTop:5}}>
                    <div style={{height:4,width:50,borderRadius:999,background:T.border,overflow:'hidden'}}><div style={{height:'100%',width:`${Math.min(100,(h/emp.maxHours)*100)}%`,borderRadius:999,background:h>emp.maxHours?T.danger:h/emp.maxHours>0.8?T.warning:T.success}}/></div>
                    <span style={{fontSize:10,color:h>emp.maxHours?T.danger:T.text3}}>{h}h / {emp.maxHours}h</span>
                  </div>
                );})()}
              </div>
            </div>
            {/* Day cells */}
            {DAYS.map((day,di)=>{
              const date=weekDates[di];
              const onTO=isOnTimeOff(emp.id,date,timeOff);
              const assignedBlocks=blocks.filter(b=>(schedule[day]?.[b.id]||[]).some(a=>a.empId===emp.id));
              return(<div key={day} style={{padding:gridTight?'6px 5px':'8px 7px',borderRight:di<6?`1px solid ${T.border}`:'none',display:'flex',flexDirection:'column',gap:4,justifyContent:'center',minHeight:rowH}}>
                {onTO?(
                  <div style={{padding:gridTight?'4px 7px':'7px 9px',borderRadius:7,background:T.warningLight,border:`1px solid ${T.warning}44`,textAlign:'center'}}>
                    <div style={{fontSize:gridTight?11:13}}>🌴</div>
                    {!gridTight&&<div style={{fontSize:10,fontWeight:500,color:T.warning,marginTop:1}}>Leave</div>}
                  </div>
                ):assignedBlocks.length>0?assignedBlocks.map(b=>{
                  const bh=blockHours(b);
                  const shiftEntry=(schedule[day]?.[b.id]||[]).find(a=>a.empId===emp.id);
                  const shiftRole=shiftEntry?.role;
                  const rrs=shiftRole?(roleStyles[shiftRole]||DEFAULT_ROLE_STYLES.Other):null;
                  return(
                    <div key={b.id} style={{padding:gridTight?'5px 8px':'9px 11px',borderRadius:8,background:isDark()?p.dot+'28':p.bg,border:`2px solid ${p.dot}55`,position:'relative',flexShrink:0}}>
                      <div style={{position:'absolute',top:gridTight?5:7,right:gridTight?5:7,width:6,height:6,borderRadius:'50%',background:p.dot}}/>
                      <div style={{fontSize:gridTight?11:14,fontWeight:700,color:isDark()?p.dot:p.text,lineHeight:1.1}}>{b.name}</div>
                      {!gridTight&&<div style={{fontSize:11,color:isDark()?p.dot+'CC':p.text,opacity:0.85,marginTop:2}}>{b.start}–{b.end}</div>}
                      {gridTight&&<div style={{fontSize:9,color:isDark()?p.dot+'99':p.text,opacity:0.7}}>{b.start.slice(0,5)}</div>}
                      {!gridTight&&<div style={{fontSize:10,color:isDark()?p.dot+'88':p.text,opacity:0.65,marginTop:1}}>{bh.toFixed(1)}h</div>}
                      {(emp.roles||[]).length>1&&shiftRole&&<div style={{marginTop:3,display:'inline-block',fontSize:9,fontWeight:600,color:isDark()?rrs.dot:rrs.text,background:isDark()?rrs.dot+'22':rrs.bg,border:`1px solid ${isDark()?rrs.dot+'55':rrs.border}`,padding:'1px 5px',borderRadius:999}}>{shiftRole}</div>}
                    </div>
                  );
                }):(
                  <div style={{height:gridTight?32:46,borderRadius:7,border:`1.5px dashed ${T.border}`,display:'flex',alignItems:'center',justifyContent:'center',opacity:0.3}}>
                    <span style={{fontSize:16,color:T.text3}}>—</span>
                  </div>
                )}
              </div>);
            })}
          </div>
        </div>);
      })}
      {/* Footer */}
      <div style={{display:'grid',gridTemplateColumns:`${nameW}px repeat(7,1fr)`,minWidth:700,background:T.surfaceWarm,borderTop:`2px solid ${T.border}`}}>
        <div style={{padding:'10px 20px',fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em',borderRight:`1px solid ${T.border}`,display:'flex',alignItems:'center'}}>{t('grid.totalLabel')}</div>
        {DAYS.map((day,di)=>{
          const count=[...new Set(blocks.flatMap(b=>(schedule[day]?.[b.id]||[]).map(a=>a.empId)))].length;
          const onLeave=employees.filter(e=>isOnTimeOff(e.id,weekDates[di],timeOff)).length;
          return(<div key={day} style={{padding:'10px 12px',textAlign:'center',borderRight:di<6?`1px solid ${T.border}`:'none'}}>
            <div style={{fontSize:15,fontWeight:700,color:count===0?T.text3:T.text}}>{count}</div>
            <div style={{fontSize:10,color:T.text3}}>{t('grid.workingLabel')}</div>
            {onLeave>0&&<div style={{fontSize:10,color:T.warning,marginTop:2}}>🌴 {onLeave}</div>}
          </div>);
        })}
      </div>
    </div>
    <div style={{marginTop:16,padding:'12px 16px',background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,display:'flex',gap:20,flexWrap:'wrap',alignItems:'center'}}>
      <span style={{fontSize:11,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em'}}>{t('staff.weekSummary')}</span>
      <span style={{fontSize:12,color:T.text2}}><b style={{color:T.text}}>{employees.reduce((acc,e)=>acc+empHours(e.id),0)}h</b>{t('staff.totalHours')}</span>
      <span style={{fontSize:12,color:T.text2}}><b style={{color:T.text}}>{employees.filter(e=>empHours(e.id)>0).length}</b>{t('staff.staffWorking',{n:employees.length})}</span>
      {offThisWeek.length>0&&<span style={{fontSize:12,color:T.warning}}><b>{offThisWeek.length}</b>{t('staff.onLeaveCount')}</span>}
    </div>
  </div>
  );
})())}
{/* WEEK VIEW */}
{calMode==='week'&&(!schedule?(<div style={{...s.card,padding:'52px 32px',textAlign:'center',position:'relative',overflow:'hidden'}}>
  <div style={{position:'absolute',inset:0,backgroundImage:`radial-gradient(circle, ${T.border} 1px, transparent 1px)`,backgroundSize:'24px 24px',opacity:0.5,pointerEvents:'none'}}/>
  <div style={{position:'relative'}}>
    <div style={{fontSize:40,marginBottom:16,opacity:0.25}}>📅</div>
    <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:22,fontWeight:500,color:T.text,marginBottom:8}}>{t('empty.nothing')}</div>
    <div style={{fontSize:13,color:T.text2,marginBottom:4}}>{t.n('empty.across',blocks.length,{emp:employees.length,blocks:blocks.length})}{offThisWeek.length>0?t('empty.leaveSuffix',{n:offThisWeek.length}):''}</div>
    <div style={{fontSize:12,color:T.text3,marginBottom:28}}>{t('empty.respected')}</div>
    <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap'}}><Btn onClick={()=>generate()}>{'✦ '+t('empty.generateWeek')}</Btn><Btn onClick={generateMonth} variant="secondary">{t('empty.generateMonth')}</Btn></div>
  </div>
</div>):(()=>{const effectiveDay=dayFilter;
  const filterDays=effectiveDay?[effectiveDay]:DAYS;
  const dayShiftsRaw=effectiveDay?blocks.flatMap(b=>{
    const bs=toMin(b.start);let be=toMin(b.end);if(be<=bs)be+=1440;
    return (schedule[effectiveDay]?.[b.id]||[]).map(a=>({empId:a.empId,name:a.name,role:a.role,blockName:b.name,startStr:b.start,endStr:b.end,start:bs,end:be}));
  }):[];
  const byEmp=new Map();
  dayShiftsRaw.forEach(s=>{
    if(!byEmp.has(s.empId))byEmp.set(s.empId,{empId:s.empId,name:s.name,role:s.role,segs:[]});
    byEmp.get(s.empId).segs.push({start:s.start,end:s.end,startStr:s.startStr,endStr:s.endStr});
  });
  const dayRows=[...byEmp.values()].map(r=>{
    const sorted=[...r.segs].sort((a,b)=>a.start-b.start);
    const merged=[];
    sorted.forEach(seg=>{
      const last=merged[merged.length-1];
      if(last&&seg.start<=last.end){ if(seg.end>last.end){last.end=seg.end;last.endStr=seg.endStr;} }
      else merged.push({...seg});
    });
    return {...r,merged};
  }).sort((a,b)=>dayGroupBy==='role'?(allRoles.indexOf(a.role)-allRoles.indexOf(b.role))||a.name.localeCompare(b.name):a.name.localeCompare(b.name));
  const fmtTick=m=>String(Math.floor((m%1440)/60)).padStart(2,'0')+':00';
  let timeline=null;
  if(effectiveDay&&dayRows.length){
    const allStarts=dayRows.flatMap(r=>r.merged.map(m=>m.start)),allEnds=dayRows.flatMap(r=>r.merged.map(m=>m.end));
    const rangeStart=Math.floor(Math.min(...allStarts)/60)*60;
    const rangeEnd=Math.ceil(Math.max(...allEnds)/60)*60;
    const totalMin=Math.max(60,rangeEnd-rangeStart);
    const ticks=[];for(let m=rangeStart;m<=rangeEnd;m+=60)ticks.push(m);
    timeline=(
      <div style={{...s.cardFlush,padding:'16px 18px 14px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8,marginBottom:10}}>
          <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
            {[...new Set(dayRows.map(r=>r.role))].map(role=>{const rs=roleStyles[role]||DEFAULT_ROLE_STYLES.Other;return(<div key={role} style={{display:'flex',alignItems:'center',gap:5}}><span style={{width:8,height:8,borderRadius:'50%',background:rs.dot,flexShrink:0}}/><span style={{fontSize:11,color:T.text2}}>{role}</span></div>);})}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:2,background:T.surfaceWarm,border:`1px solid ${T.border}`,borderRadius:8,padding:3}}>
            {[['role',t('grid.byRole')],['name',t('grid.byName')]].map(([k,l])=><button key={k} onClick={()=>setDayGroupBy(k)} style={{padding:'3px 10px',borderRadius:6,background:dayGroupBy===k?T.bg:'transparent',border:dayGroupBy===k?`1px solid ${T.border}`:'1px solid transparent',cursor:'pointer',fontSize:11,fontWeight:dayGroupBy===k?500:400,color:dayGroupBy===k?T.text:T.text2,fontFamily:'inherit'}}>{l}</button>)}
          </div>
        </div>
        <div style={{position:'relative',height:16,marginLeft:120,marginBottom:10}}>
          {ticks.map(m=>(<span key={m} style={{position:'absolute',left:`${(m-rangeStart)/totalMin*100}%`,transform:'translateX(-50%)',fontSize:10,color:T.text3,whiteSpace:'nowrap'}}>{fmtTick(m)}</span>))}
        </div>
        <div style={{display:'flex',gap:8}}>
          <div style={{width:112,flexShrink:0,display:'flex',flexDirection:'column',gap:8}}>
            {dayRows.map(row=>{const rs=roleStyles[row.role]||DEFAULT_ROLE_STYLES.Other;return(<div key={row.empId} style={{height:24,display:'flex',alignItems:'center',gap:5,fontSize:12,fontWeight:500,color:T.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}><span style={{width:7,height:7,borderRadius:'50%',background:rs.dot,flexShrink:0}}/>{row.name}</div>);})}
          </div>
          <div style={{position:'relative',flex:1}}>
            {ticks.map(m=>(<div key={m} style={{position:'absolute',left:`${(m-rangeStart)/totalMin*100}%`,top:0,bottom:0,width:1,zIndex:2,pointerEvents:'none',background:m===rangeStart||m===rangeEnd?'transparent':T.border}}/>))}
            <div style={{display:'flex',flexDirection:'column',gap:8,position:'relative'}}>
              {dayRows.map(row=>{
                const rs=roleStyles[row.role]||DEFAULT_ROLE_STYLES.Other;
                return(<div key={row.empId} style={{position:'relative',height:24,background:T.surfaceWarm,borderRadius:6}}>
                  {row.merged.map((seg,si)=>{
                    const leftPct=(seg.start-rangeStart)/totalMin*100,widthPct=(seg.end-seg.start)/totalMin*100;
                    return(<div key={si} style={{position:'absolute',left:`${leftPct}%`,width:`${widthPct}%`,top:0,bottom:0,minWidth:2,background:isDark()?rs.dot+'40':rs.dot+'30',border:`1.5px solid ${rs.dot}`,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden'}}>
                      <span style={{fontSize:10,fontWeight:600,color:isDark()?rs.dot:rs.text,whiteSpace:'nowrap',padding:'0 5px'}}>{seg.startStr}–{seg.endStr}</span>
                    </div>);
                  })}
                </div>);
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }
  return(<div style={{display:'flex',flexDirection:'column',gap:16}}>
  {timeline}
  {blocks.map(block=>{
    const isCollapsed=!!collapsedBlocks[block.id];
    const blockWarnings=warnings.filter(w=>w.includes(block.name));
    return(
    <div key={block.id} style={s.cardFlush}>
      <div onClick={()=>setCollapsedBlocks(p=>({...p,[block.id]:!p[block.id]}))} style={{padding:'12px 20px',borderBottom:isCollapsed?'none':`1px solid ${T.border}`,background:T.surfaceWarm,display:'flex',alignItems:'center',gap:12,cursor:'pointer',userSelect:'none'}}>
        <span style={{fontSize:11,color:T.text3,transform:isCollapsed?'rotate(-90deg)':'none',transition:'transform 0.15s',display:'inline-block'}}>▾</span>
        <div style={{flex:1}}><span style={{fontFamily:'Fraunces, Georgia, serif',fontSize:15,fontWeight:500}}>{block.name}</span><span style={{fontSize:12,color:T.text3,marginLeft:10}}>{block.start} – {block.end} · {blockHours(block).toFixed(1)}h</span></div>
        {blockWarnings.length>0&&<span style={{fontSize:10,color:T.danger,background:T.dangerLight,border:`1px solid ${T.danger}33`,padding:'2px 8px',borderRadius:999,fontWeight:500}}>⚠️ {blockWarnings.length}</span>}
        <span style={{fontSize:10,color:T.success,background:T.successLight,border:`1px solid ${T.success}33`,padding:'2px 8px',borderRadius:999,fontWeight:500}}>{t('week.managerEnforced')}</span>
      </div>
      {!isCollapsed&&<div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',minWidth:580}}>
          <thead><tr>
            <th style={{width:90,textAlign:'left',padding:'10px 20px',fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em',background:T.surfaceWarm,borderBottom:`1px solid ${T.border}`}}>{t('week.role')}</th>
            {filterDays.map(day=>{const i=DAYS.indexOf(day),isActive=effectiveDay===day;return(<th key={day} onClick={()=>setDayFilter(f=>f===day?null:day)} style={{textAlign:'left',padding:'10px 10px',fontSize:11,fontWeight:500,color:isActive?T.accent:T.text,background:isActive?T.accentLight:T.surfaceWarm,borderBottom:`1px solid ${T.border}`,cursor:'pointer',userSelect:'none'}} title={t('week.isolateDay')}>{t('day.'+day)}<div style={{fontSize:10,fontWeight:400,color:isActive?T.accent:T.text3}}>{fmt(weekDates[i])}</div></th>);})}
          </tr></thead>
          <tbody>
            {allRoles.map(role=>{
              const anyDay=filterDays.some(day=>{const r=getBlockRoles(block,day)[role]||0,g=(schedule[day]?.[block.id]||[]).filter(a=>a.role===role).length;return r>0||g>0;});
              if(!anyDay)return null;
              const rs=roleStyles[role]||DEFAULT_ROLE_STYLES.Other;
              return(<tr key={role} style={{borderBottom:`1px solid ${T.border}`}}>
                <td style={{padding:'10px 20px',verticalAlign:'top',background:T.surface}}><RoleBadge role={role} rs={rs}/></td>
                {filterDays.map(day=>{
                  const allA=schedule[day]?.[block.id]||[],assigned=allA.filter(a=>a.role===role),req=getBlockRoles(block,day)[role]||0,gap=Math.max(0,req-assigned.length),isTarget=selected&&selected.role===role&&selected.day!==day;
                  return(<td key={day} style={{padding:'8px 10px',verticalAlign:'top',borderLeft:`1px solid ${T.border}`,background:T.surface}}>
                    <div style={{display:'flex',flexDirection:effectiveDay?'row':'column',flexWrap:effectiveDay?'wrap':'nowrap',gap:effectiveDay?14:3,alignItems:effectiveDay?'flex-start':'stretch'}}>
                      {assigned.map((a,idx)=>{const emp=employees.find(e=>e.id===a.empId),realIdx=allA.findIndex(x=>x.empId===a.empId),isSel=selected?.empId===a.empId&&selected?.day===day&&selected?.blockId===block.id;return(
                        <div key={idx}>
                          <EmpChip emp={emp||{name:a.name,palIdx:0}} selected={isSel} onClick={()=>handleSlotClick(day,block.id,a,realIdx)}/>
                          {effectiveDay&&<div style={{fontSize:9,color:T.text3,marginTop:1,marginLeft:2}}>{block.start}–{block.end}</div>}
                        </div>
                      );})}
                      {gap>0&&(<div style={{position:'relative'}}>
                        <button onClick={()=>{if(selected&&isTarget){handleEmptySlotClick(day,block.id,role);return;}if(!selected)setOpenPicker(p=>p&&p.day===day&&p.blockId===block.id&&p.role===role?null:{day,blockId:block.id,role});}} style={{display:'inline-flex',alignItems:'center',gap:3,padding:'2px 7px',borderRadius:999,fontSize:10,fontWeight:500,background:isTarget?T.successLight:T.dangerLight,color:isTarget?T.success:T.danger,border:`1px dashed ${isTarget?T.success:T.danger}55`,cursor:'pointer',fontFamily:'inherit'}}>{isTarget?t('week.moveHere'):t('week.shortCount',{n:gap})}</button>
                        {!selected&&openPicker?.day===day&&openPicker?.blockId===block.id&&openPicker?.role===role&&(()=>{const eligible=eligibleForSlot(day,block.id,role);return(<div style={{position:'absolute',top:'100%',left:0,marginTop:4,background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,boxShadow:'0 4px 16px rgba(28,24,21,0.12)',zIndex:200,minWidth:180,maxWidth:240,padding:8}}>
                          <div style={{fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em',padding:'2px 4px 6px'}}>{t('week.addRoleDay',{role,day:t('day.'+day)})}</div>
                          {eligible.length===0?<div style={{fontSize:11,color:T.text3,padding:'6px 4px',fontStyle:'italic'}}>{t('week.noneAvailable')}</div>:eligible.map(emp=>{const p=pal(emp);return(<button key={emp.id} onClick={()=>addToSlot(day,block.id,role,emp)} style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'6px 8px',borderRadius:7,background:'transparent',border:'none',cursor:'pointer',fontFamily:'inherit',textAlign:'left'}} onMouseEnter={e=>e.currentTarget.style.background=T.surfaceWarm} onMouseLeave={e=>e.currentTarget.style.background='transparent'}><div style={{width:24,height:24,borderRadius:'50%',background:isDark()?p.dot+'25':p.bg,color:isDark()?p.dot:p.text,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700}}>{initials(emp.name)}</div><div><div style={{fontSize:12,fontWeight:500,color:T.text}}>{emp.name}</div><div style={{fontSize:10,color:T.text3}}>{empHours(emp.id)}h / {emp.maxHours}h</div></div></button>);})}
                          <div style={{borderTop:`1px solid ${T.border}`,marginTop:4,paddingTop:4}}><button onClick={()=>setOpenPicker(null)} style={{display:'block',width:'100%',padding:'4px 8px',borderRadius:6,background:'transparent',border:'none',cursor:'pointer',fontSize:11,color:T.text3,textAlign:'left',fontFamily:'inherit'}}>{t('common.cancel')}</button></div>
                        </div>);})()} 
                      </div>)}
                      {req===0&&assigned.length===0&&<span style={{fontSize:11,color:T.text3}}>—</span>}
                    </div>
                  </td>);})}
              </tr>);
            })}
          </tbody>
        </table>
      </div>}
    </div>
    );})}
  <div style={s.card}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:8}}>
      <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:15,fontWeight:500}}>{t('week.weeklyHours')}</div>
      <div style={{display:'flex',background:T.surfaceWarm,border:`1px solid ${T.border}`,borderRadius:8,padding:3,gap:2}}>
        {[['name',t('grid.byName')],['role',t('grid.byRole')]].map(([k,l])=><button key={k} onClick={()=>setGridGroupBy(k)} style={{padding:'3px 10px',borderRadius:6,background:gridGroupBy===k?T.bg:'transparent',border:gridGroupBy===k?`1px solid ${T.border}`:'1px solid transparent',cursor:'pointer',fontSize:11,fontWeight:gridGroupBy===k?500:400,color:gridGroupBy===k?T.text:T.text2,fontFamily:'inherit'}}>{l}</button>)}
      </div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:10}}>
      {[...employees].sort((a,b)=>gridGroupBy==='role'?(allRoles.indexOf((a.roles||[])[0]||'')-allRoles.indexOf((b.roles||[])[0]||''))||a.name.localeCompare(b.name):a.name.localeCompare(b.name)).map(emp=>{const h=empHours(emp.id),pct=Math.min(100,(h/emp.maxHours)*100),over=h>emp.maxHours,rs=roleStyles[(emp.roles||[])[0]]||DEFAULT_ROLE_STYLES.Other;return(<div key={emp.id} style={{padding:'10px 12px',borderRadius:10,border:`1px solid ${over?T.danger+'55':T.border}`,background:over?T.dangerLight:T.surfaceWarm}}>
        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}><Avatar emp={emp} size={24}/><span style={{fontSize:12,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{emp.name.split(' ')[0]}</span></div>
        {gridGroupBy==='role'&&(emp.roles||[])[0]&&<div style={{marginBottom:6}}><RoleBadge role={(emp.roles||[])[0]} rs={rs}/></div>}
        <div style={{fontSize:13,fontWeight:500,color:over?T.danger:T.text,marginBottom:4}}>{h}h <span style={{fontSize:11,color:T.text3,fontWeight:400}}>/ {emp.maxHours}h</span></div>
        <div style={{height:3,borderRadius:999,background:T.border,overflow:'hidden'}}><div style={{height:'100%',width:`${pct}%`,borderRadius:999,background:over?T.danger:pct>80?T.warning:T.success}}/></div>
      </div>);})}
    </div>
  </div>
</div>);})())}
</div>)}

{/* EMPLOYEES */}
{view==='employees'&&(
  <EmployeesView
    employees={employees} allRoles={allRoles} roleStyles={roleStyles}
    expandedEmp={expandedEmp} setExpandedEmp={setExpandedEmp}
    updateEmp={updateEmp} updateAvail={updateAvail} toggleDay={toggleDay} applyTemplate={applyTemplate} duplicateEmp={duplicateEmp} removeEmp={removeEmp}
    showAddEmp={showAddEmp} setShowAddEmp={setShowAddEmp} newEmp={newEmp} setNewEmp={setNewEmp} addEmployee={addEmployee}
    orgId={orgId} orgName={orgName} isOwner={isOwner} s={s} t={t}
  />
)}

{/* TIME OFF */}
{view==='timeoff'&&(
  <TimeOffView
    offThisWeek={offThisWeek} weekDates={weekDates}
    toFilter={toFilter} setToFilter={setToFilter}
    showAddTO={showAddTO} setShowAddTO={setShowAddTO} newTO={newTO} setNewTO={setNewTO} addTO={addTO}
    employees={employees} filteredTO={filteredTO} updateTOStatus={updateTOStatus} removeTO={removeTO}
    s={s} t={t}
  />
)}

{/* COVERAGE */}
{view==='coverage'&&(
  <CoverageView
    allRoles={allRoles} roleStyles={roleStyles} setRoleStyles={setRoleStyles}
    editingRole={editingRole} setEditingRole={setEditingRole} confirmDelete={confirmDelete} setConfirmDelete={setConfirmDelete}
    setEmployees={setEmployees} blocks={blocks} setBlocks={setBlocks}
    s={s} t={t}
  />
)}

{/* COSTS */}
{view==='costs'&&(
  <CostsView
    costsMode={costsMode} setCostsMode={setCostsMode} displayMonth={displayMonth} schedules={schedules} schedule={schedule} weekDates={weekDates}
    hourlyRate={hourlyRate} setHourlyRate={setHourlyRate}
    monthCostData={monthCostData} costData={costData} totalMonthCostUnits={totalMonthCostUnits} totalCostUnits={totalCostUnits} maxMonthCostUnits={maxMonthCostUnits} maxCostUnits={maxCostUnits} monthRoleCosts={monthRoleCosts} weekRoleCosts={weekRoleCosts}
    toMoney={toMoney} employees={employees} timeOff={timeOff} roleStyles={roleStyles} setView={setView}
    s={s} t={t}
  />
)}

      </div>
    </div>
  );
}

// ─── Outer App — auth gate ────────────────────────────────────────────────────
export default function App(){
  const [theme,setThemeRaw]=useState(()=>loadPref('sa2_theme','light'));
  Object.assign(T,THEMES[theme]||THEMES.light);
  Object.assign(styles,computeStyles());
  const toggleTheme=()=>{const next=theme==='dark'?'light':'dark';setThemeRaw(next);savePref('sa2_theme',next);};

  const [session,setSession]    =useState(undefined);
  const [orgs,setOrgs]          =useState(undefined);
  const [orgTick,setOrgTick]    =useState(0);
  const [activeOrg,setActiveOrg]=useState(null); // always starts null — user picks on login

  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{
      setSession(data.session);
      // Accept any pending invitations when user logs in
      if(data.session) acceptPendingInvitations().catch(err=>{console.error(err);alert(err.message||'Failed to accept a pending team invitation. Please refresh and try again.');});
    });
    const{data:sub}=supabase.auth.onAuthStateChange((_e,s)=>{
      setSession(s);
      if(s) acceptPendingInvitations().then(()=>setOrgTick(t=>t+1)).catch(err=>{console.error(err);alert(err.message||'Failed to accept a pending team invitation. Please refresh and try again.');});
    });
    return()=>sub.subscription.unsubscribe();
  },[]);

  useEffect(()=>{
    if(!session){setOrgs(undefined);return;}
    let alive=true;
    listOrgs().then(list=>{if(alive)setOrgs(list);}).catch(e=>{console.error(e);if(alive)setOrgs([]);});
    return()=>{alive=false;};
  },[session,orgTick]);

  // Don't auto-select — let user pick from RestaurantPicker

  const switchOrg =id=>{setActiveOrg(id);try{localStorage.setItem('sa2_active_org',id);}catch{}};
  const reloadOrgs=async()=>{setOrgs(undefined);setOrgTick(t=>t+1);};

  if(session===undefined)return<LoadingScreen/>;
  if(!session)return<Auth/>;
  if(orgs===undefined)return<LoadingScreen/>;

  // Show restaurant picker if no active org selected or user has no orgs yet
  if(!activeOrg||!orgs.find(o=>o.id===activeOrg)){
    return<RestaurantPicker
      orgs={orgs}
      onSelect={id=>switchOrg(id)}
      onCreated={async id=>{await reloadOrgs();switchOrg(id);}}
      theme={theme}
      toggleTheme={toggleTheme}
    />;
  }

  const active=orgs.find(o=>o.id===activeOrg);
  if(!active)return<LoadingScreen/>;

  const isManager=(active.role==='owner'||active.role==='manager'||!active.role);
  const isOwner=(active.role==='owner');

  if(!isManager)return(
    <EmployeeView orgId={active.id} key={active.id} orgName={active.name} theme={theme} toggleTheme={toggleTheme} onBack={()=>setActiveOrg(null)}/>
  );

  return(
    <Dashboard orgId={active.id} key={active.id} orgName={active.name} isOwner={isOwner} theme={theme} toggleTheme={toggleTheme} onBack={()=>setActiveOrg(null)}/>
  );
}
