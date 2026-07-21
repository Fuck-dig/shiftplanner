import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { T, styles, THEMES, computeStyles, DEFAULT_ROLE_STYLES, DEFAULT_BLOCKS, DEFAULT_EMPLOYEES, DAYS, AVAIL_TEMPLATES, TIMEOFF_TYPES, EMP_PALETTE, pal, initials, isDark } from './lib/constants';
import { getWeekDates, getMondayDate, weekKey, dateToISO, fmt, toMin, getMonthOffsets, todayISO } from './lib/dates';
import { blockHours, coversBlock, getBlockRoles, isOnTimeOff, buildSchedule, dayCoverage, effectiveHourlyRate } from './lib/schedule';
import { fetchEmployees, syncEmployees, fetchBlocks, syncBlocks, fetchTimeOff, syncTimeOff, fetchSchedules, syncSchedules } from './lib/data';
import { migrateEmployee } from './lib/storage';
import { supabase } from './lib/supabase';
import { listOrgs, acceptPendingInvitations } from './lib/org';
import { Avatar, RoleBadge, EmpChip, Btn, TimePicker } from './components/ui';
import Auth from './components/Auth';
import RestaurantPicker from './components/RestaurantPicker';
import EmployeeView from './components/EmployeeView';
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
  const [pickerRoleFilter,setPickerRoleFilter] = useState([]);
  const [pickerSortBy,setPickerSortBy] = useState('name'); // 'name' | 'avail' — sort for the "All staff" fallback list
  const [pickerSearch,setPickerSearch] = useState('');
  const [ganttPreview,setGanttPreview] = useState(null); // live {day,blockId,empId,start,end} while dragging a Gantt bar's edge
  const ganttDragRef = useRef(null);
  const [shiftModalEmp,setShiftModalEmp]         = useState(null); // employee being assigned a shift from the Employees tab
  const [shiftModalMonth,setShiftModalMonth]     = useState(()=>{const n=new Date();return{y:n.getFullYear(),m:n.getMonth()};});
  const [shiftModalDaySel,setShiftModalDaySel]   = useState(null); // {date,dayName,weekOff} — a specific calendar day chosen from the month grid
  const [shiftModalRole,setShiftModalRole]       = useState(null); // which of the employee's roles to add — one row per block instead of one per block×role
  const [shiftModalTimes,setShiftModalTimes]     = useState({}); // per-blockId custom {start,end} override, defaults to the block's own hours
  const [expandedEmp,setExpandedEmp] = useState(null);
  const [showAddEmp,setShowAddEmp]   = useState(false);
  const [newEmp,setNewEmp]           = useState({name:'',roles:['Manager'],priority:100,contractType:'hourly',contractPeriod:'week',wage:0,maxHours:40,targetHours:40});
  const [showAddTO,setShowAddTO]     = useState(false);
  const [newTO,setNewTO]             = useState({empId:'',startDate:todayISO(),endDate:todayISO(),type:'Holiday',note:'',status:'Pending'});
  const [toFilter,setToFilter]       = useState('all');
  const [gridGroupBy,setGridGroupBy] = useState('name');  // 'name' | 'role'
  const [gridTight,setGridTight]     = useState(false);
  const [gridSearch,setGridSearch]   = useState('');
  const [dayFilter,setDayFilter]     = useState(null);     // null = all days, else one of DAYS — isolates a single day in Week view
  const [dayGroupBy,setDayGroupBy]   = useState('role');   // 'role' | 'name' — sort order for the day-isolation timeline
  const [collapsedBlocks,setCollapsedBlocks]=useState({}); // blockId -> true when collapsed in Week view
  const [costsMode,setCostsMode]     = useState('week');
  const [costsWeekOffset,setCostsWeekOffset]=useState(0); // independent of the Schedule tab's own week
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
        setEmpRaw((emps.length?emps:DEFAULT_EMPLOYEES).map(migrateEmployee));
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

  // Safety net: the add-staff modal locks background scroll while open by
  // setting document.body.style.overflow directly (not React state), so if
  // this component ever unmounts while it happens to be open, make sure the
  // lock doesn't outlive it.
  useEffect(()=>()=>{ document.body.style.overflow=''; },[]);

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
    if(!schedule)return;closePicker();
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

  // Pull one person off a shift outright — e.g. they've called in sick.
  // No confirmation: it's a single click to remove, a single click to re-add.
  const removeFromSlot=(day,blockId,idx)=>{
    if(!schedule)return;
    const ns=JSON.parse(JSON.stringify(schedule));
    ns[day][blockId].splice(idx,1);
    setSchedules(p=>({...p,[wKey]:{...p[wKey],schedule:ns,confirmed:false}}));
    if(selected&&selected.day===day&&selected.blockId===blockId&&selected.idx===idx)setSelected(null);
  };

  // The add-staff picker is a proper centered modal (not an anchored popover
  // tied to the trigger's on-screen position) — that approach kept breaking:
  // the page could still scroll behind/away from it, leaving it looking
  // disconnected from whatever it was supposed to be next to. A modal with a
  // scroll-locked backdrop sidesteps the whole problem.
  const openPickerFor=(day,blockId,role)=>{
    setOpenPicker(p=>{
      if(p&&p.day===day&&p.blockId===blockId&&p.role===role){ document.body.style.overflow=''; return null; }
      document.body.style.overflow='hidden';
      return{day,blockId,role};
    });
    setPickerRoleFilter([]);
    setPickerSortBy('name');
    setPickerSearch('');
  };
  const closePicker=()=>{ document.body.style.overflow=''; setOpenPicker(null); setPickerRoleFilter([]); setPickerSortBy('name'); setPickerSearch(''); };

  // Assignments can carry an optional per-person start/end override (set by
  // dragging their bar in the Gantt view) that takes precedence over the
  // block's default hours — this is what lets someone's actual worked time
  // for a shift differ from the block's nominal window.
  const assignmentHours=(a,b)=>blockHours({start:a.start||b.start,end:a.end||b.end});

  const empHoursMap=employees.reduce((acc,e)=>{
    if(!schedule){acc[e.id]=0;return acc;}
    let h=0;DAYS.forEach(day=>blocks.forEach(b=>{const a=(schedule[day]?.[b.id]||[]).find(a=>a.empId===e.id);if(a)h+=assignmentHours(a,b);}));
    acc[e.id]=h;return acc;
  },{});
  const empHours=id=>empHoursMap[id]||0;

  // Two groups: a recommended list (right role, available, not on leave,
  // under their hour cap), and a true "everyone else" roster with no
  // filtering at all — a deliberate full-override escape hatch so a manager
  // can add literally anyone, for whatever real-world reason isn't captured
  // by role/availability/hours. Only exclusion in the second group: someone
  // already assigned to this exact shift (that'd just be a no-op duplicate).
  const candidatesForSlot=(day,blockId,role)=>{
    if(!schedule)return{available:[],unavailable:[]};
    const block=blocks.find(b=>b.id===blockId);if(!block)return{available:[],unavailable:[]};
    const bh=blockHours(block),date=weekDates[DAYS.indexOf(day)];
    const alreadyHere=new Set((schedule[day]?.[blockId]||[]).map(a=>a.empId));
    const working=new Set(blocks.flatMap(b=>(schedule[day]?.[b.id]||[]).map(a=>a.empId)));
    // Same checks as the recommended filter, but itemized — so the "All
    // staff" fallback list can tell a manager exactly why each person isn't
    // in the recommended group, instead of just dumping everyone unlabeled.
    const reasonsFor=e=>{
      const r=[];
      if(!(e.roles||[]).includes(role))r.push('role');
      if(isOnTimeOff(e.id,date,timeOff))r.push('leave');
      if(working.has(e.id))r.push('working');
      if(empHours(e.id)+bh>e.maxHours)r.push('hours');
      if(!coversBlock(e.availability[day],block))r.push('avail');
      return r;
    };
    const recommended=employees.filter(e=>reasonsFor(e).length===0).sort((a,b)=>(a.priority||100)-(b.priority||100));
    const recommendedIds=new Set(recommended.map(e=>e.id));
    const everyoneElse=employees.filter(e=>!alreadyHere.has(e.id)&&!recommendedIds.has(e.id)).sort((a,b)=>a.name.localeCompare(b.name)).map(e=>({...e,_reasons:reasonsFor(e)}));
    return{available:recommended,unavailable:everyoneElse};
  };

  const addToSlot=(day,blockId,role,emp)=>{
    const ns=JSON.parse(JSON.stringify(schedule));
    ns[day][blockId]=[...(ns[day][blockId]||[]),{empId:emp.id,name:emp.name,role}];
    setSchedules(p=>({...p,[wKey]:{...p[wKey],schedule:ns,confirmed:false}}));setOpenPicker(null);
  };

  // Lets a manager assign someone a shift straight from the Employees tab,
  // without having to first go find the right cell in the Schedule grid.
  // The day picker inside the modal spans the whole month (not just one
  // week) so a manager can jump straight to any day without paging week by
  // week — each day still resolves back to its own week's schedule blob.
  const openShiftModalFor=(emp,weekOff=null,day=null)=>{
    setShiftModalEmp(emp);
    if(weekOff!=null&&day){
      const date=getWeekDates(weekOff)[DAYS.indexOf(day)];
      setShiftModalMonth({y:date.getFullYear(),m:date.getMonth()});
      setShiftModalDaySel({date,dayName:day,weekOff});
    }else{
      const n=new Date();setShiftModalMonth({y:n.getFullYear(),m:n.getMonth()});
      setShiftModalDaySel(null);
    }
    setShiftModalRole((emp.roles||[])[0]||allRoles[0]||null);
    setShiftModalTimes({});
    document.body.style.overflow='hidden';
  };
  const closeShiftModal=()=>{ document.body.style.overflow=''; setShiftModalEmp(null); setShiftModalDaySel(null); };
  const shiftModalDays=getMonthOffsets(shiftModalMonth).flatMap(off=>getWeekDates(off).map((d,di)=>({date:d,dayName:DAYS[di],weekOff:off})).filter(x=>x.date.getMonth()===shiftModalMonth.m&&x.date.getFullYear()===shiftModalMonth.y));
  const shiftModalSchedule=shiftModalDaySel?(schedules[weekKey(shiftModalDaySel.weekOff)]?.schedule||null):null;
  const addShiftForEmployee=(day,blockId,role,emp,customStart,customEnd)=>{
    if(!shiftModalDaySel)return;
    const wKeyD=weekKey(shiftModalDaySel.weekOff);
    const block=blocks.find(b=>b.id===blockId);
    setSchedules(p=>{
      const wd=p[wKeyD];if(!wd||!wd.schedule)return p;
      const ns=JSON.parse(JSON.stringify(wd.schedule));
      const entry={empId:emp.id,name:emp.name,role};
      if(block&&customStart&&customEnd&&(customStart!==block.start||customEnd!==block.end)){entry.start=customStart;entry.end=customEnd;}
      ns[day][blockId]=[...(ns[day][blockId]||[]),entry];
      return{...p,[wKeyD]:{...wd,schedule:ns,confirmed:false}};
    });
  };

  // Dragging a Gantt bar's edge sets a per-person start/end override on that
  // one assignment for that one day, so someone's actual worked time for a
  // shift can differ from the block's nominal window (e.g. covering half of
  // Lunch instead of the whole thing).
  const minToHHMM=m=>{m=((Math.round(m)%1440)+1440)%1440;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');};
  const applyGanttResize=(day,blockId,empId,startMin,endMin)=>{
    const block=blocks.find(b=>b.id===blockId);if(!block)return;
    const newStart=minToHHMM(startMin),newEnd=minToHHMM(endMin);
    setSchedules(p=>{
      const wd=p[wKey];if(!wd)return p;
      const ns=JSON.parse(JSON.stringify(wd.schedule));
      const arr=ns[day]?.[blockId];if(!arr)return p;
      const idx=arr.findIndex(a=>a.empId===empId);if(idx<0)return p;
      if(newStart===block.start&&newEnd===block.end){ delete arr[idx].start; delete arr[idx].end; }
      else { arr[idx]={...arr[idx],start:newStart,end:newEnd}; }
      return{...p,[wKey]:{...wd,schedule:ns,confirmed:false}};
    });
  };
  const beginGanttDrag=(e,{day,blockId,empId,edge,origStart,origEnd,railEl,rangeStart,totalMin})=>{
    e.preventDefault();e.stopPropagation();
    const SNAP=15;
    const rect=railEl.getBoundingClientRect();
    const state={day,blockId,empId,edge,rect,rangeStart,totalMin,live:{start:origStart,end:origEnd}};
    ganttDragRef.current=state;
    setGanttPreview({day,blockId,empId,start:origStart,end:origEnd});
    const clientXOf=ev=>ev.touches?ev.touches[0].clientX:ev.clientX;
    const onMove=ev=>{
      const st=ganttDragRef.current;if(!st)return;
      if(ev.cancelable)ev.preventDefault();
      const x=clientXOf(ev);
      const pct=Math.min(1,Math.max(0,(x-st.rect.left)/st.rect.width));
      let mins=st.rangeStart+pct*st.totalMin;
      mins=Math.round(mins/SNAP)*SNAP;
      let{start,end}=st.live;
      if(st.edge==='start') start=Math.min(mins,end-SNAP);
      else end=Math.max(mins,start+SNAP);
      st.live={start,end};
      setGanttPreview({day:st.day,blockId:st.blockId,empId:st.empId,start,end});
    };
    const onUp=()=>{
      window.removeEventListener('mousemove',onMove);
      window.removeEventListener('mouseup',onUp);
      window.removeEventListener('touchmove',onMove);
      window.removeEventListener('touchend',onUp);
      const st=ganttDragRef.current;
      ganttDragRef.current=null;
      setGanttPreview(null);
      if(st) applyGanttResize(st.day,st.blockId,st.empId,st.live.start,st.live.end);
    };
    window.addEventListener('mousemove',onMove);
    window.addEventListener('mouseup',onUp);
    window.addEventListener('touchmove',onMove,{passive:false});
    window.addEventListener('touchend',onUp);
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
    setNewEmp({name:'',roles:['Manager'],priority:100,contractType:'hourly',contractPeriod:'week',wage:0,maxHours:40,targetHours:40});setShowAddEmp(false);
  };

  const addTO         =()=>{if(!newTO.empId)return;setTimeOff(p=>[...p,{...newTO,id:crypto.randomUUID()}]);setNewTO({empId:'',startDate:todayISO(),endDate:todayISO(),type:'Holiday',note:'',status:'Pending'});setShowAddTO(false);};
  const updateTOStatus=(id,status)=>setTimeOff(p=>p.map(t=>t.id===id?{...t,status}:t));
  const removeTO      =id=>setTimeOff(p=>p.filter(t=>t.id!==id));

  const calcWageCost=(e,hours)=>{const rate=effectiveHourlyRate(e);if(rate==null)return parseFloat((hours*(e.priority||100)/100).toFixed(2));return parseFloat((hours*rate).toFixed(2));};
  const hasWages=employees.some(e=>e.wage>0);
  // Costs tab has its own week selector, independent of whatever week the
  // Schedule tab is currently showing.
  const costsWeekDates=getWeekDates(costsWeekOffset);
  const costsWKey=weekKey(costsWeekOffset);
  const costsSchedule=schedules[costsWKey]?.schedule||null;
  const hoursForSchedule=(ws,empId)=>{ if(!ws) return 0; let h=0; DAYS.forEach(day=>blocks.forEach(b=>{ const a=(ws[day]?.[b.id]||[]).find(a=>a.empId===empId); if(a) h+=assignmentHours(a,b); })); return h; };
  const costData=employees.map(e=>{const hours=hoursForSchedule(costsSchedule,e.id);return{emp:e,hours,costUnits:hasWages?calcWageCost(e,hours):parseFloat((hours*(e.priority||100)/100).toFixed(2))};});
  const totalCostUnits=costData.reduce((s,d)=>s+d.costUnits,0);
  const maxCostUnits=Math.max(...costData.map(d=>d.costUnits),0.01);
  const monthCostData=employees.map(e=>{let h=0;getMonthOffsets(displayMonth).forEach(off=>{const ws=schedules[weekKey(off)]?.schedule;if(!ws)return;DAYS.forEach(day=>blocks.forEach(b=>{const a=(ws[day]?.[b.id]||[]).find(a=>a.empId===e.id);if(a)h+=assignmentHours(a,b);}));});return{emp:e,hours:h,costUnits:hasWages?calcWageCost(e,h):parseFloat((h*(e.priority||100)/100).toFixed(2))};});
  const totalMonthCostUnits=monthCostData.reduce((s,d)=>s+d.costUnits,0);
  const maxMonthCostUnits=Math.max(...monthCostData.map(d=>d.costUnits),0.01);
  const mkRoleCosts=data=>allRoles.reduce((acc,r)=>{acc[r]=parseFloat(data.filter(d=>(d.emp.roles||[]).includes(r)).reduce((s,d)=>s+d.costUnits,0).toFixed(2));return acc;},{});
  const weekRoleCosts=mkRoleCosts(costData),monthRoleCosts=mkRoleCosts(monthCostData);
  const toMoney=u=>{if(hasWages){return `kr ${Math.round(u).toLocaleString('da-DK')}`;}const val=u*hourlyRate.amount;return `${hourlyRate.currency} ${Math.round(val).toLocaleString('da-DK')}`;};

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
        {isOwner&&<span style={{marginLeft:8,display:'inline-block'}}><Btn onClick={seedTestDataAndGenerateMonth} disabled={generating} variant="secondary">🧪 Test: full month</Btn></span>}
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
          {isOwner&&<div style={{marginTop:6}}><Btn onClick={()=>{setMobileMenuOpen(false);seedTestDataAndGenerateMonth();}} disabled={generating} variant="secondary">🧪 Test: full month</Btn></div>}
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

{shiftModalEmp&&createPortal(
  <div onClick={closeShiftModal} style={{position:'fixed',inset:0,zIndex:300,background:'rgba(20,16,13,0.5)',display:'flex',alignItems:'center',justifyContent:'center',padding:20,fontFamily:"'Hanken Grotesk',sans-serif"}}>
    <div onClick={e=>e.stopPropagation()} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,width:'min(460px,100%)',maxHeight:'min(80vh,640px)',display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 24px 60px -16px rgba(0,0,0,0.5)'}}>
      <div style={{padding:'16px 18px 10px',flexShrink:0}}>
        <div style={{fontSize:11,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:10}}>{t('emp.addShiftFor',{name:shiftModalEmp.name})}</div>
        <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
          <div style={{display:'flex',alignItems:'center',gap:2,background:T.surfaceWarm,border:`1px solid ${T.border}`,borderRadius:8,padding:3}}>
            <button onClick={()=>setShiftModalMonth(p=>p.m===0?{y:p.y-1,m:11}:{y:p.y,m:p.m-1})} style={{padding:'4px 10px',borderRadius:6,background:'none',border:'none',cursor:'pointer',color:T.text2,fontFamily:'inherit',fontSize:13}}>‹</button>
            <span style={{fontSize:12,fontWeight:500,color:T.text,minWidth:120,textAlign:'center',padding:'0 2px'}}>{new Date(shiftModalMonth.y,shiftModalMonth.m,1).toLocaleDateString('en-GB',{month:'long',year:'numeric'})}</span>
            <button onClick={()=>setShiftModalMonth(p=>p.m===11?{y:p.y+1,m:0}:{y:p.y,m:p.m+1})} style={{padding:'4px 10px',borderRadius:6,background:'none',border:'none',cursor:'pointer',color:T.text2,fontFamily:'inherit',fontSize:13}}>›</button>
          </div>
          <button onClick={()=>{const n=new Date();setShiftModalMonth({y:n.getFullYear(),m:n.getMonth()});}} style={{padding:'5px 12px',borderRadius:8,background:T.surface,border:`1px solid ${T.border}`,cursor:'pointer',fontSize:11,color:T.text2,fontFamily:'inherit'}}>{t('common.today')}</button>
        </div>
      </div>
      <div style={{padding:'0 18px 10px',flexShrink:0}}>
        <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
          {shiftModalDays.map((d,i)=>{
            const wsExists=!!schedules[weekKey(d.weekOff)]?.schedule;
            const isSel=shiftModalDaySel&&shiftModalDaySel.weekOff===d.weekOff&&shiftModalDaySel.dayName===d.dayName;
            const isToday=dateToISO(d.date)===dateToISO(new Date());
            return(<button key={i} onClick={()=>setShiftModalDaySel(d)} title={!wsExists?t('grid.noScheduleThatWeek'):undefined} style={{padding:'5px 8px',borderRadius:8,fontSize:11,fontWeight:600,border:`1px solid ${isSel?T.accent:isToday?T.accent+'55':T.border}`,background:isSel?T.accentLight:'transparent',color:isSel?T.accent:wsExists?T.text2:T.text3,opacity:wsExists?1:0.45,cursor:'pointer',fontFamily:'inherit',minWidth:40,textAlign:'center'}}>
              <div>{t('day.'+d.dayName).slice(0,2)}</div>
              <div style={{fontWeight:400,opacity:0.8}}>{d.date.getDate()}</div>
            </button>);
          })}
        </div>
      </div>
      {(()=>{
        const empRoles=(shiftModalEmp.roles||[]).length?shiftModalEmp.roles:allRoles;
        if(empRoles.length<=1)return null;
        return(<div style={{padding:'0 18px 10px',flexShrink:0}}>
          <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
            {empRoles.map(r=>{const rs=roleStyles[r]||DEFAULT_ROLE_STYLES.Other,active=(shiftModalRole||empRoles[0])===r;return(<button key={r} onClick={()=>setShiftModalRole(r)} style={{display:'inline-flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:999,fontSize:11,fontWeight:500,background:active?(isDark()?rs.dot+'22':rs.bg):'transparent',color:active?(isDark()?rs.dot:rs.text):T.text3,border:`1px solid ${active?(isDark()?rs.dot+'55':rs.border):T.border}`,cursor:'pointer',fontFamily:'inherit'}}><span style={{width:5,height:5,borderRadius:'50%',background:active?rs.dot:T.text3}}/>{r}</button>);})}
          </div>
        </div>);
      })()}
      <div style={{overflowY:'auto',padding:'0 10px 6px',flex:1,minHeight:0}}>
        {shiftModalDaySel&&!shiftModalSchedule&&<div style={{fontSize:12,color:T.text3,padding:'10px 8px',fontStyle:'italic'}}>{t('emp.noScheduleForWeek')}</div>}
        {shiftModalSchedule&&shiftModalDaySel&&(()=>{
          const dayName=shiftModalDaySel.dayName;
          const empRoles=(shiftModalEmp.roles||[]).length?shiftModalEmp.roles:allRoles;
          const role=shiftModalRole||empRoles[0];
          if(!role)return <div style={{fontSize:12,color:T.text3,padding:'10px 8px',fontStyle:'italic'}}>{t('week.noneAvailable')}</div>;
          const rs=roleStyles[role]||DEFAULT_ROLE_STYLES.Other;
          return blocks.map(block=>{
            const already=(shiftModalSchedule[dayName]?.[block.id]||[]).some(a=>a.empId===shiftModalEmp.id);
            const times=shiftModalTimes[block.id]||{start:block.start,end:block.end};
            const setTime=(field,val)=>setShiftModalTimes(p=>({...p,[block.id]:{...(p[block.id]||{start:block.start,end:block.end}),[field]:val}}));
            return(<div key={block.id} style={{display:'flex',flexDirection:'column',gap:6,padding:'8px 10px',borderRadius:8,opacity:already?0.55:1}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:500,color:T.text}}>{block.name} <span style={{fontSize:11,color:T.text3,fontWeight:400}}>{block.start}–{block.end}</span></div>
                  <div style={{marginTop:3}}><RoleBadge role={role} rs={rs}/></div>
                </div>
                <Btn small variant={already?'ghost':'secondary'} disabled={already} onClick={()=>addShiftForEmployee(dayName,block.id,role,shiftModalEmp,block.start,block.end)}>{already?t('emp.alreadyOnShift'):t('emp.addShiftBtn')}</Btn>
              </div>
              {!already&&<div style={{display:'flex',alignItems:'center',gap:10,paddingTop:6,marginTop:2,borderTop:`1px dashed ${T.border}`}}>
                <div style={{flex:1,minWidth:0,display:'flex',alignItems:'center',gap:6}}>
                  <span style={{fontSize:11,fontWeight:500,color:T.text3}}>{t('emp.customTime')}</span>
                  <TimePicker small value={times.start} onChange={v=>setTime('start',v)}/>
                  <span style={{fontSize:11,color:T.text3}}>–</span>
                  <TimePicker small value={times.end} onChange={v=>setTime('end',v)}/>
                </div>
                <Btn small variant="ghost" onClick={()=>addShiftForEmployee(dayName,block.id,role,shiftModalEmp,times.start,times.end)}>{t('emp.addShiftBtn')}</Btn>
              </div>}
            </div>);
          });
        })()}
        {!shiftModalDaySel&&<div style={{fontSize:12,color:T.text3,padding:'10px 8px',fontStyle:'italic'}}>{t('emp.pickADay')}</div>}
      </div>
      <div style={{borderTop:`1px solid ${T.border}`,padding:12,flexShrink:0}}><Btn variant="ghost" onClick={closeShiftModal}>{t('common.done')}</Btn></div>
    </div>
  </div>
,document.body)}

{/* SCHEDULE */}
{view==='schedule'&&(<div>
  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:20,flexWrap:'wrap',position:'sticky',top:56,zIndex:20,background:T.bg,backgroundImage:isDark()?'radial-gradient(circle at 12% 6%, rgba(217,122,74,0.07), transparent 38%), radial-gradient(circle at 88% 94%, rgba(95,174,122,0.06), transparent 42%)':'radial-gradient(circle at 12% 6%, rgba(191,90,44,0.045), transparent 38%), radial-gradient(circle at 88% 94%, rgba(61,122,82,0.04), transparent 42%)',backgroundAttachment:'fixed',paddingTop:8,marginTop:-8,paddingBottom:8}}>
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
  const gq=gridSearch.trim().toLowerCase();
  const gridEmployees=gq?employees.filter(e=>e.name.toLowerCase().includes(gq)):employees;
  const rows=gridGroupBy==='role'
    ?allRoleOrder
        .filter(role=>gridEmployees.some(e=>(e.roles||[]).includes(role)))
        .flatMap(role=>[...gridEmployees].filter(e=>(e.roles||[]).includes(role)).sort((a,b)=>a.name.localeCompare(b.name)).map(emp=>({emp,role})))
    :[...gridEmployees].sort((a,b)=>a.name.localeCompare(b.name)).map(emp=>({emp,role:null}));
  const rowH=gridTight?60:80;
  const nameW=isMobile?(gridTight?110:140):(gridTight?140:180);
  const gridMinW=isMobile?nameW+7*54:700;
  return(
  <div>
    {/* Grid controls + header — sticky so they stay visible while scrolling the employee list, stacked just below the sticky week/view-mode bar above */}
    <div style={{position:'sticky',top:98,zIndex:19,background:T.bg,backgroundImage:isDark()?'radial-gradient(circle at 12% 6%, rgba(217,122,74,0.07), transparent 38%), radial-gradient(circle at 88% 94%, rgba(95,174,122,0.06), transparent 42%)':'radial-gradient(circle at 12% 6%, rgba(191,90,44,0.045), transparent 38%), radial-gradient(circle at 88% 94%, rgba(61,122,82,0.04), transparent 42%)',backgroundAttachment:'fixed',paddingTop:16,marginTop:-16}}>
      <div style={{display:'flex',gap:8,marginBottom:12,alignItems:'center',flexWrap:'wrap'}}>
        <div style={{display:'flex',background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:3,gap:2}}>
          {[['name',t('grid.byName')],['role',t('grid.byRole')]].map(([k,l])=><button key={k} onClick={()=>setGridGroupBy(k)} style={{padding:'4px 12px',borderRadius:6,background:gridGroupBy===k?T.bg:'transparent',border:gridGroupBy===k?`1px solid ${T.border}`:'1px solid transparent',cursor:'pointer',fontSize:12,fontWeight:gridGroupBy===k?500:400,color:gridGroupBy===k?T.text:T.text2,fontFamily:'inherit'}}>{l}</button>)}
        </div>
        <button onClick={()=>setGridTight(p=>!p)} style={{padding:'4px 12px',borderRadius:8,background:gridTight?T.bg:T.surface,border:`1px solid ${T.border}`,cursor:'pointer',fontSize:12,color:gridTight?T.text:T.text2,fontFamily:'inherit',fontWeight:gridTight?500:400}}>
          {gridTight?t('grid.compact'):t('grid.comfortable')}
        </button>
        <input value={gridSearch} onChange={e=>setGridSearch(e.target.value)} placeholder={t('week.searchStaff')} style={{...s.input,width:160,padding:'5px 10px',fontSize:12}}/>
        <span style={{fontSize:12,color:T.text3,marginLeft:4}}>{t('grid.scheduledOfTotal',{n:employees.filter(e=>Object.values(schedule).some(day=>Object.values(day).some(b=>b.some(a=>a.empId===e.id)))).length,total:employees.length})}</span>
      </div>
      <div style={{...s.cardFlush,overflowX:'auto',overflowY:'visible',borderBottomLeftRadius:0,borderBottomRightRadius:0}}>
        {/* Header */}
        <div style={{display:'grid',gridTemplateColumns:`${nameW}px repeat(7,1fr)`,minWidth:gridMinW,borderBottom:`2px solid ${T.border}`,background:T.surfaceWarm}}>
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
          {showDivider&&<div style={{display:'grid',gridTemplateColumns:`${nameW}px repeat(7,1fr)`,minWidth:gridMinW,background:T.surfaceWarm,borderTop:`2px solid ${T.border}`,borderBottom:`1px solid ${T.border}`}}>
            <div style={{padding:'6px 14px',display:'flex',alignItems:'center',gap:8,borderRight:`1px solid ${T.border}`}}>
              <RoleBadge role={row.role} rs={roleStyles[row.role]}/>
            </div>
            {DAYS.map((_,i)=><div key={i} style={{borderRight:i<6?`1px solid ${T.border}`:'none'}}/>)}
          </div>}
          <div style={{display:'grid',gridTemplateColumns:`${nameW}px repeat(7,1fr)`,minWidth:gridMinW,borderBottom:`1px solid ${T.border}`,background:ri%2===1?T.surfaceWarm:T.surface}}>
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
                  <button onClick={()=>openShiftModalFor(emp,weekOffset,day)} title={t('grid.addShiftTitle')} style={{height:gridTight?32:46,borderRadius:7,border:`1.5px dashed ${T.border}`,display:'flex',alignItems:'center',justifyContent:'center',opacity:0.35,background:'transparent',cursor:'pointer',fontFamily:'inherit',width:'100%',transition:'opacity 0.15s,border-color 0.15s'}} onMouseEnter={e=>{e.currentTarget.style.opacity=1;e.currentTarget.style.borderColor=T.accent;}} onMouseLeave={e=>{e.currentTarget.style.opacity=0.35;e.currentTarget.style.borderColor=T.border;}}>
                    <span style={{fontSize:16,color:T.text3}}>+</span>
                  </button>
                )}
              </div>);
            })}
          </div>
        </div>);
      })}
      {/* Footer */}
      <div style={{display:'grid',gridTemplateColumns:`${nameW}px repeat(7,1fr)`,minWidth:gridMinW,background:T.surfaceWarm,borderTop:`2px solid ${T.border}`}}>
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
  // The person currently picked up for a move/swap — if they have more than
  // one role, they should be a valid move target for ANY of their roles, not
  // just whichever role they happened to be filling in their original slot.
  const selectedEmp=selected?employees.find(e=>e.id===selected.empId):null;
  const selectedRoles=selectedEmp?(selectedEmp.roles||[]):(selected?[selected.role]:[]);
  const filterDays=effectiveDay?[effectiveDay]:DAYS;
  // Each segment keeps its own blockId (and the block's own default hours)
  // so a bar in the Gantt maps 1:1 to one real assignment — needed so
  // dragging an edge knows exactly which (day, block, person) to update.
  // Segments are deliberately NOT merged across blocks any more (they used
  // to be, cosmetically, when touching) since that would make a dragged bar
  // ambiguous about which underlying assignment it represents.
  const dayShiftsRaw=effectiveDay?blocks.flatMap(b=>{
    return (schedule[effectiveDay]?.[b.id]||[]).map(a=>{
      const st=a.start||b.start,en=a.end||b.end;
      const bs=toMin(st);let be=toMin(en);if(be<=bs)be+=1440;
      return{empId:a.empId,name:a.name,role:a.role,blockId:b.id,blockName:b.name,blockStart:b.start,blockEnd:b.end,startStr:st,endStr:en,start:bs,end:be};
    });
  }):[];
  const byEmp=new Map();
  dayShiftsRaw.forEach(s=>{
    if(!byEmp.has(s.empId))byEmp.set(s.empId,{empId:s.empId,name:s.name,role:s.role,segs:[]});
    byEmp.get(s.empId).segs.push({blockId:s.blockId,role:s.role,blockStart:s.blockStart,blockEnd:s.blockEnd,start:s.start,end:s.end,startStr:s.startStr,endStr:s.endStr});
  });
  const dayRows=[...byEmp.values()].map(r=>{
    const merged=[...r.segs].sort((a,b)=>a.start-b.start);
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
    const ganttSideW=isMobile?76:112,ganttRowH=isMobile?20:24;
    timeline=(
      <div style={{...s.cardFlush,padding:isMobile?'14px 10px 12px':'16px 18px 14px',overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8,marginBottom:10,minWidth:isMobile?480:'auto'}}>
          <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
            {[...new Set(dayRows.map(r=>r.role))].map(role=>{const rs=roleStyles[role]||DEFAULT_ROLE_STYLES.Other;return(<div key={role} style={{display:'flex',alignItems:'center',gap:5}}><span style={{width:8,height:8,borderRadius:'50%',background:rs.dot,flexShrink:0}}/><span style={{fontSize:11,color:T.text2}}>{role}</span></div>);})}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:2,background:T.surfaceWarm,border:`1px solid ${T.border}`,borderRadius:8,padding:3}}>
            {[['role',t('grid.byRole')],['name',t('grid.byName')]].map(([k,l])=><button key={k} onClick={()=>setDayGroupBy(k)} style={{padding:'3px 10px',borderRadius:6,background:dayGroupBy===k?T.bg:'transparent',border:dayGroupBy===k?`1px solid ${T.border}`:'1px solid transparent',cursor:'pointer',fontSize:11,fontWeight:dayGroupBy===k?500:400,color:dayGroupBy===k?T.text:T.text2,fontFamily:'inherit'}}>{l}</button>)}
          </div>
        </div>
        <div style={{fontSize:11,color:T.text3,marginBottom:8,minWidth:isMobile?480:'auto'}}>{t('week.dragHint')}</div>
        <div style={{position:'relative',height:16,marginLeft:ganttSideW,marginBottom:10,minWidth:isMobile?480-ganttSideW:'auto'}}>
          {ticks.map(m=>(<span key={m} style={{position:'absolute',left:`${(m-rangeStart)/totalMin*100}%`,transform:'translateX(-50%)',fontSize:10,color:T.text3,whiteSpace:'nowrap'}}>{fmtTick(m)}</span>))}
        </div>
        <div style={{display:'flex',gap:8,minWidth:isMobile?480:'auto'}}>
          <div style={{width:ganttSideW,flexShrink:0,display:'flex',flexDirection:'column',gap:8}}>
            {dayRows.map(row=>{const rs=roleStyles[row.role]||DEFAULT_ROLE_STYLES.Other;return(<div key={row.empId} style={{height:ganttRowH,display:'flex',alignItems:'center',gap:5,fontSize:isMobile?11:12,fontWeight:500,color:T.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}><span style={{width:7,height:7,borderRadius:'50%',background:rs.dot,flexShrink:0}}/>{row.name}</div>);})}
          </div>
          <div style={{position:'relative',flex:1}}>
            {ticks.map(m=>(<div key={m} style={{position:'absolute',left:`${(m-rangeStart)/totalMin*100}%`,top:0,bottom:0,width:1,zIndex:2,pointerEvents:'none',background:m===rangeStart||m===rangeEnd?'transparent':T.border}}/>))}
            <div style={{display:'flex',flexDirection:'column',gap:8,position:'relative'}}>
              {dayRows.map(row=>{
                return(<div key={row.empId} style={{position:'relative',height:ganttRowH,background:T.surfaceWarm,borderRadius:6}}>
                  {row.merged.map((seg,si)=>{
                    const rs=roleStyles[seg.role]||DEFAULT_ROLE_STYLES.Other;
                    const dragging=ganttPreview&&ganttPreview.day===effectiveDay&&ganttPreview.blockId===seg.blockId&&ganttPreview.empId===row.empId;
                    const segStart=dragging?ganttPreview.start:seg.start,segEnd=dragging?ganttPreview.end:seg.end;
                    const leftPct=(segStart-rangeStart)/totalMin*100,widthPct=(segEnd-segStart)/totalMin*100;
                    const label=dragging?`${minToHHMM(segStart)}–${minToHHMM(segEnd)}`:`${seg.startStr}–${seg.endStr}`;
                    return(<div key={si} style={{position:'absolute',left:`${leftPct}%`,width:`${widthPct}%`,top:0,bottom:0,minWidth:14,background:isDark()?rs.dot+'40':rs.dot+'30',border:`1.5px solid ${rs.dot}`,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',zIndex:dragging?5:1,boxShadow:dragging?'0 2px 8px rgba(0,0,0,0.25)':'none'}}>
                      <span style={{fontSize:isMobile?9:10,fontWeight:600,color:isDark()?rs.dot:rs.text,whiteSpace:'nowrap',padding:'0 5px',pointerEvents:'none'}}>{label}</span>
                      <div onMouseDown={e=>beginGanttDrag(e,{day:effectiveDay,blockId:seg.blockId,empId:row.empId,edge:'start',origStart:seg.start,origEnd:seg.end,railEl:e.currentTarget.parentElement.parentElement,rangeStart,totalMin})} onTouchStart={e=>beginGanttDrag(e,{day:effectiveDay,blockId:seg.blockId,empId:row.empId,edge:'start',origStart:seg.start,origEnd:seg.end,railEl:e.currentTarget.parentElement.parentElement,rangeStart,totalMin})} style={{position:'absolute',left:0,top:0,bottom:0,width:8,cursor:'ew-resize',touchAction:'none'}}/>
                      <div onMouseDown={e=>beginGanttDrag(e,{day:effectiveDay,blockId:seg.blockId,empId:row.empId,edge:'end',origStart:seg.start,origEnd:seg.end,railEl:e.currentTarget.parentElement.parentElement,rangeStart,totalMin})} onTouchStart={e=>beginGanttDrag(e,{day:effectiveDay,blockId:seg.blockId,empId:row.empId,edge:'end',origStart:seg.start,origEnd:seg.end,railEl:e.currentTarget.parentElement.parentElement,rangeStart,totalMin})} style={{position:'absolute',right:0,top:0,bottom:0,width:8,cursor:'ew-resize',touchAction:'none'}}/>
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
  {selected&&(
    <div style={{position:'fixed',bottom:20,left:isMobile?14:20,right:isMobile?14:'auto',maxWidth:isMobile?'calc(100% - 28px)':340,zIndex:210,background:T.surface,border:`1px solid ${T.accent}55`,borderRadius:12,padding:'12px 14px',display:'flex',alignItems:'flex-start',gap:10,boxShadow:'0 12px 30px -10px rgba(33,27,21,0.35)'}}>
      <span style={{fontSize:14}}>✥</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:12,fontWeight:600,color:T.text,marginBottom:2}}>{t('week.moving',{name:selected.name})}</div>
        <div style={{fontSize:11,color:T.text3,marginBottom:8}}>{t('week.movingHint')}</div>
        <div style={{display:'flex',gap:6}}>
          <Btn small variant="danger" onClick={()=>{removeFromSlot(selected.day,selected.blockId,selected.idx);setSelected(null);}}>{t('common.remove')}</Btn>
          <Btn small variant="ghost" onClick={()=>setSelected(null)}>{t('common.cancel')}</Btn>
        </div>
      </div>
    </div>
  )}
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
                  const allA=schedule[day]?.[block.id]||[],assigned=allA.filter(a=>a.role===role),req=getBlockRoles(block,day)[role]||0,gap=Math.max(0,req-assigned.length),isTarget=selected&&selectedRoles.includes(role)&&selected.day!==day;
                  return(<td key={day} style={{padding:'8px 10px',verticalAlign:'top',borderLeft:`1px solid ${T.border}`,background:T.surface}}>
                    <div style={{display:'flex',flexDirection:effectiveDay?'row':'column',flexWrap:effectiveDay?'wrap':'nowrap',gap:effectiveDay?14:3,alignItems:effectiveDay?'flex-start':'stretch'}}>
                      {assigned.map((a,idx)=>{const emp=employees.find(e=>e.id===a.empId),realIdx=allA.findIndex(x=>x.empId===a.empId),isSel=selected?.empId===a.empId&&selected?.day===day&&selected?.blockId===block.id;return(
                        <div key={idx}>
                          <EmpChip emp={emp||{name:a.name,palIdx:0}} selected={isSel} onClick={()=>handleSlotClick(day,block.id,a,realIdx)}/>
                          {effectiveDay&&<div style={{fontSize:9,color:a.start||a.end?T.accent:T.text3,marginTop:1,marginLeft:2}}>{a.start||block.start}–{a.end||block.end}</div>}
                        </div>
                      );})}
                      {(()=>{
                        const pickerOpen=openPicker?.day===day&&openPicker?.blockId===block.id&&openPicker?.role===role&&!selected;
                        // A centered modal, not an anchored popover — an anchored popup kept
                        // failing because the page could still scroll behind/away from it,
                        // leaving it stranded over unrelated content. A modal with a
                        // scroll-locked backdrop can't drift like that.
                        const reasonLabels={role:t('week.reasonRole',{role}),leave:t('week.reasonLeave'),working:t('week.reasonWorking'),hours:t('week.reasonHours'),avail:t('week.reasonAvail')};
                        const personRow=(emp,dim)=>{const p=pal(emp),rate=effectiveHourlyRate(emp);return(<button key={emp.id} onClick={()=>{addToSlot(day,block.id,role,emp);closePicker();}} style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'10px 12px',marginBottom:6,borderRadius:12,background:isDark()?T.surfaceWarm:'#fff',border:`1px solid ${T.border}`,boxShadow:isDark()?'none':'0 1px 3px -1px rgba(33,27,21,0.08)',cursor:'pointer',fontFamily:"'Hanken Grotesk',sans-serif",textAlign:'left',opacity:dim?0.75:1,transition:'border-color 0.15s,box-shadow 0.15s,transform 0.15s'}} onMouseEnter={e=>{e.currentTarget.style.borderColor=p.dot+'88';e.currentTarget.style.boxShadow=isDark()?'0 0 0 1px '+p.dot+'44':'0 4px 12px -4px rgba(33,27,21,0.18)';e.currentTarget.style.transform='translateY(-1px)';}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.boxShadow=isDark()?'none':'0 1px 3px -1px rgba(33,27,21,0.08)';e.currentTarget.style.transform='none';}}><div style={{width:32,height:32,borderRadius:'50%',background:isDark()?p.dot+'25':p.bg,color:isDark()?p.dot:p.text,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,flexShrink:0}}>{initials(emp.name)}</div><div style={{minWidth:0,flex:1}}><div style={{display:'flex',alignItems:'baseline',gap:6}}><div style={{fontSize:13,fontWeight:500,color:T.text}}>{emp.name}</div>{rate!=null&&<div style={{fontSize:11,fontWeight:600,color:T.accent,whiteSpace:'nowrap'}}>kr {Math.round(rate).toLocaleString('da-DK')}/h</div>}</div><div style={{fontSize:11,color:T.text3}}>{empHours(emp.id)}h / {emp.maxHours}h</div>{(emp.roles||[]).length>0&&<div style={{display:'flex',gap:3,flexWrap:'wrap',marginTop:3}}>{(emp.roles||[]).map(r=>{const rs=roleStyles[r]||DEFAULT_ROLE_STYLES.Other;return<span key={r} style={{fontSize:9,fontWeight:600,color:isDark()?rs.dot:rs.text,background:isDark()?rs.dot+'22':rs.bg,border:`1px solid ${isDark()?rs.dot+'55':rs.border}`,padding:'1px 5px',borderRadius:999}}>{r}</span>;})}</div>}</div>{emp._reasons?.length>0&&<div style={{flexShrink:0,alignSelf:'center',display:'flex',flexDirection:'column',alignItems:'flex-end',gap:2,maxWidth:100}}>{emp._reasons.map(rc=><span key={rc} style={{fontSize:9,fontWeight:600,color:T.warning,background:T.warningLight,border:`1px solid ${T.warning}33`,padding:'2px 7px',borderRadius:999,whiteSpace:'nowrap'}}>{reasonLabels[rc]}</span>)}</div>}</button>);};
                        const picker=pickerOpen&&(()=>{
                          const{available,unavailable}=candidatesForSlot(day,block.id,role);
                          const rolesPresent=allRoles.filter(r=>available.some(e=>(e.roles||[]).includes(r))||unavailable.some(e=>(e.roles||[]).includes(r)));
                          const q=pickerSearch.trim().toLowerCase();
                          const matchesFilter=emp=>(pickerRoleFilter.length===0||(emp.roles||[]).some(r=>pickerRoleFilter.includes(r)))&&(!q||emp.name.toLowerCase().includes(q));
                          const filteredAvailable=available.filter(matchesFilter);
                          const filteredUnavailable=[...unavailable.filter(matchesFilter)].sort((a,b)=>pickerSortBy==='avail'?((a._reasons?.length||0)-(b._reasons?.length||0))||a.name.localeCompare(b.name):a.name.localeCompare(b.name));
                          const toggleRoleFilter=r=>setPickerRoleFilter(p=>p.includes(r)?p.filter(x=>x!==r):[...p,r]);
                          return createPortal(
                          <div onClick={closePicker} style={{position:'fixed',inset:0,zIndex:300,background:'rgba(20,16,13,0.5)',display:'flex',alignItems:'center',justifyContent:'center',padding:20,fontFamily:"'Hanken Grotesk',sans-serif"}}>
                            <div onClick={e=>e.stopPropagation()} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,width:'min(440px,100%)',maxHeight:'min(78vh,620px)',display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 24px 60px -16px rgba(0,0,0,0.5)'}}>
                              <div style={{fontSize:11,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em',padding:'16px 18px 10px',flexShrink:0}}>{t('week.addRoleDay',{role,day:t('day.'+day)})}</div>
                              <div style={{padding:'0 18px 10px',flexShrink:0}}>
                                <input autoFocus value={pickerSearch} onChange={e=>setPickerSearch(e.target.value)} placeholder={t('week.searchStaff')} style={{...s.input,width:'100%'}}/>
                              </div>
                              {rolesPresent.length>1&&<div style={{display:'flex',gap:4,flexWrap:'wrap',padding:'0 18px 10px',flexShrink:0}}>
                                <button onClick={()=>setPickerRoleFilter([])} style={{padding:'3px 9px',borderRadius:999,fontSize:10,fontWeight:600,border:`1px solid ${pickerRoleFilter.length===0?T.accent:T.border}`,background:pickerRoleFilter.length===0?T.accent+'15':'transparent',color:pickerRoleFilter.length===0?T.accent:T.text2,cursor:'pointer',fontFamily:'inherit'}}>{t('week.allRoles')}</button>
                                {rolesPresent.map(r=>{const rs=roleStyles[r]||DEFAULT_ROLE_STYLES.Other,active=pickerRoleFilter.includes(r);return(<button key={r} onClick={()=>toggleRoleFilter(r)} style={{padding:'3px 9px',borderRadius:999,fontSize:10,fontWeight:600,border:`1px solid ${active?rs.dot:T.border}`,background:active?(isDark()?rs.dot+'22':rs.bg):'transparent',color:active?(isDark()?rs.dot:rs.text):T.text2,cursor:'pointer',fontFamily:'inherit'}}>{r}</button>);})}
                              </div>}
                              <div style={{overflowY:'auto',padding:'0 10px',flex:1,minHeight:0}}>
                                {filteredAvailable.length===0&&filteredUnavailable.length===0?<div style={{fontSize:12,color:T.text3,padding:'10px 8px',fontStyle:'italic'}}>{t('week.noneAvailable')}</div>:<>
                                  {filteredAvailable.length===0?<div style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:T.danger,padding:'10px 8px',fontStyle:'italic'}}>⚠ {t('week.noOneAvailableForRole')}</div>:filteredAvailable.map(emp=>personRow(emp,false))}
                                  {filteredUnavailable.length>0&&<>
                                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap',padding:'10px 8px 6px',borderTop:filteredAvailable.length>0?`1px solid ${T.border}`:'none',marginTop:filteredAvailable.length>0?6:0}}>
                                      <span style={{fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.05em'}}>{t('week.allStaff')}</span>
                                      <div style={{display:'flex',background:T.surfaceWarm,border:`1px solid ${T.border}`,borderRadius:7,padding:2,gap:1}}>
                                        {[['name',t('week.sortByName')],['avail',t('week.sortByAvail')]].map(([k,l])=><button key={k} onClick={()=>setPickerSortBy(k)} style={{padding:'3px 8px',borderRadius:5,fontSize:10,fontWeight:pickerSortBy===k?600:400,background:pickerSortBy===k?T.bg:'transparent',border:pickerSortBy===k?`1px solid ${T.border}`:'1px solid transparent',color:pickerSortBy===k?T.text:T.text3,cursor:'pointer',fontFamily:'inherit'}}>{l}</button>)}
                                      </div>
                                    </div>
                                    {filteredUnavailable.map(emp=>personRow(emp,true))}
                                  </>}
                                </>}
                              </div>
                              <div style={{borderTop:`1px solid ${T.border}`,padding:12,flexShrink:0}}><Btn variant="ghost" onClick={closePicker}>{t('common.cancel')}</Btn></div>
                            </div>
                          </div>
                        ,document.body);})();
                        const blocked=selected&&!isTarget; // mid-move, but this isn't a valid destination
                        const noAvail=gap>0&&!isTarget&&candidatesForSlot(day,block.id,role).available.length===0;
                        if(gap>0)return(<div style={{position:'relative'}}>
                          <button onClick={()=>{if(selected&&isTarget){handleEmptySlotClick(day,block.id,role);return;}if(!selected)openPickerFor(day,block.id,role);}} disabled={blocked} title={noAvail?t('week.noOneAvailable'):undefined} style={{display:'inline-flex',alignItems:'center',gap:3,padding:'2px 7px',borderRadius:999,fontSize:10,fontWeight:500,background:isTarget?T.successLight:T.dangerLight,color:isTarget?T.success:T.danger,border:`1px dashed ${isTarget?T.success:T.danger}55`,cursor:blocked?'default':'pointer',opacity:blocked?0.35:1,fontFamily:'inherit'}}>{isTarget?t('week.moveHere'):(noAvail?`⚠ ${t('week.shortCount',{n:gap})}`:t('week.shortCount',{n:gap}))}</button>
                          {picker}
                        </div>);
                        return(<div style={{position:'relative'}}>
                          <button onClick={()=>{if(selected&&isTarget){handleEmptySlotClick(day,block.id,role);return;}if(!selected)openPickerFor(day,block.id,role);}} disabled={blocked} title={isTarget?t('week.moveHere'):t('week.addExtra')} style={{display:'inline-flex',alignItems:'center',justifyContent:'center',minWidth:20,height:20,padding:'0 6px',borderRadius:999,fontSize:isTarget?10:12,fontWeight:isTarget?500:600,lineHeight:1,background:isTarget?T.successLight:'transparent',color:isTarget?T.success:T.text3,border:`1px dashed ${isTarget?T.success+'55':T.border}`,cursor:blocked?'default':'pointer',opacity:blocked?0.35:1,fontFamily:'inherit'}}>{isTarget?t('week.moveHere'):'+'}</button>
                          {picker}
                        </div>);
                      })()}
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
    onAddShift={openShiftModalFor}
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
    costsMode={costsMode} setCostsMode={setCostsMode} costsWeekOffset={costsWeekOffset} setCostsWeekOffset={setCostsWeekOffset} displayMonth={displayMonth} schedules={schedules} schedule={costsSchedule} weekDates={costsWeekDates}
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
