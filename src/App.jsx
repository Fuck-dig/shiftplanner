import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { T, styles, THEMES, computeStyles, DEFAULT_ROLE_STYLES, DEFAULT_BLOCKS, DEFAULT_EMPLOYEES, DAYS, AVAIL_TEMPLATES, TIMEOFF_TYPES, EMP_PALETTE, pal, isDark, MEMBERSHIP_ROLE_COLORS } from './lib/constants';
import { getWeekDates, getMondayDate, weekKey, weekKeyToMonday, dateToISO, fmt, fmtLong, toMin, getMonthOffsets, todayISO, weekOffsetFromDate, setLocale } from './lib/dates';
import { blockHours, assignmentHours, actualAssignmentHours, coversBlock, getBlockRoles, isOnTimeOff, buildSchedule, dayCoverage, calcWageCost } from './lib/schedule';
import { fetchEmployees, syncEmployees, fetchBlocks, syncBlocks, fetchTimeOff, syncTimeOff, fetchSchedules, syncSchedules, createNotification, sendNotificationEmail, fetchShiftSwaps, updateShiftSwap, fetchTemplates, saveTemplate, deleteTemplate, fetchRoleStyles, saveRoleStyles, fetchUnseenMessageReplies, sendMessage, fetchDailyRevenue, saveDailyRevenue } from './lib/data';
import ComposeMessageModal from './components/ComposeMessageModal';
import MessageThreadModal from './components/MessageThreadModal';
import { migrateEmployee, load, save } from './lib/storage';
import { escapeHtml } from './lib/html';
import { mergeRoleOrder, reorderRoleList } from './lib/roles';
import { supabase } from './lib/supabase';
import { listOrgs, acceptPendingInvitations } from './lib/org';
import { RoleBadge, EmpChip, Btn, TimePicker, WeekPicker } from './components/ui';
import NotificationBell from './components/NotificationBell';
import Auth from './components/Auth';
import RestaurantPicker from './components/RestaurantPicker';
import EmployeeView from './components/EmployeeView';
import KioskView from './components/KioskView';
import EmployeesView from './components/views/EmployeesView';
import TimeOffView from './components/views/TimeOffView';
import CoverageView from './components/views/CoverageView';
import CostsView from './components/views/CostsView';
import MonthView from './components/views/MonthView';
import TeamView from './components/views/TeamView';
import WeekView from './components/views/WeekView';
import ProfileSettings from './components/ProfileSettings';
import { LANGUAGES, makeT, detectLang, LOCALES } from './i18n';

// loadPref/savePref used to be redefined here, doing exactly what
// lib/storage.js's load/save already do (and which EmployeeView.jsx, Auth.jsx
// and RestaurantPicker.jsx already use) — now shared instead of duplicated.

function LoadingScreen() {
  return <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:T.bg,color:T.text3,fontFamily:"'Hanken Grotesk',sans-serif",fontSize:26}}><span style={{fontFamily:'Fraunces, Georgia, serif',opacity:0.5}}>Rorota</span></div>;
}

function Dashboard({ orgId, orgName='Restaurant', isOwner=false, role='owner', theme, toggleTheme, onBack=()=>{} }) {
  const [loading,setLoading]         = useState(true);
  const [view,setView]               = useState('schedule');
  const [calMode,setCalMode]         = useState('week');
  const [employees,setEmpRaw]        = useState([]);
  const [blocks,setBlocksRaw]        = useState([]);
  const [schedules,setSchedsRaw]     = useState({});
  const [timeOff,setTORaw]           = useState([]);
  const [swaps,setSwaps]             = useState([]); // shift_swaps for this org, any week/status — polled, not part of the debounced-sync data model
  const [unseenMessageReplies,setUnseenMessageReplies]=useState([]); // sent messages with a new reply the manager hasn't opened yet — polled
  const [composeModal,setComposeModal]=useState(null); // {presetEmpIds} while ComposeMessageModal is open, else null
  const [composeBusy,setComposeBusy] = useState(false);
  const [openManagerThread,setOpenManagerThread]=useState(null); // the message shown in MessageThreadModal from the manager's side, or null
  const [templates,setTemplates]     = useState([]); // saved named snapshots of `blocks`
  const [revenue,setRevenue]         = useState({}); // {isoDate: amount} — manager-entered daily sales, for Costs' revenue-vs-labor-cost view
  const [myEmail,setMyEmail]         = useState(''); // this manager's own login email, so we can (optionally) match them to a roster row too
  const [weekOffset,setWeekOffset]   = useState(0);
  const [roleStyles,setRoleStylesRaw]= useState(DEFAULT_ROLE_STYLES);
  // Personal, per-browser role display/group order — deliberately NOT
  // synced across users: each person (manager or employee) drags their own
  // Team view into whatever order makes sense to them, scoped per org since
  // different orgs have different role sets.
  const [roleOrder,setRoleOrder]     = useState(()=>load('sa2_roleOrder_'+orgId,[]));
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
  const ganttJustDraggedRef = useRef(false); // true right after a real (moved) drag, so the trailing click doesn't also open the edit modal
  const [shiftModalEmp,setShiftModalEmp]         = useState(null); // employee being assigned a shift from the Employees tab
  const [shiftModalMonth,setShiftModalMonth]     = useState(()=>{const n=new Date();return{y:n.getFullYear(),m:n.getMonth()};});
  const [shiftModalDaySel,setShiftModalDaySel]   = useState(null); // {date,dayName,weekOff} — a specific calendar day chosen from the month grid
  const [shiftModalRole,setShiftModalRole]       = useState(null); // which of the employee's roles to add — one row per block instead of one per block×role
  const [shiftModalTimes,setShiftModalTimes]     = useState({}); // per-blockId custom {start,end} override, defaults to the block's own hours
  const [editingSlot,setEditingSlot]             = useState(null); // {day,blockId,idx} — an existing assignment being edited from Week/Day view
  const [editTimes,setEditTimes]                 = useState({start:'',end:''});
  const [editRole,setEditRole]                   = useState(null);
  // What actually happened for this shift, edited separately from the
  // scheduled time above — 'scheduled' means "trust the planned time" (the
  // default, and all that a future shift ever needs), 'adjusted' records a
  // different actualStart/actualEnd, 'noshow' zeroes the hours outright.
  const [editActual,setEditActual]               = useState({mode:'scheduled',start:'',end:''});
  const [editNotes,setEditNotes]                 = useState({inNote:'',outNote:''}); // manager-editable copies of clockInNote/clockNote — see openEditSlot/saveEditSlot
  const [expandedEmp,setExpandedEmp] = useState(null);
  const [showAddEmp,setShowAddEmp]   = useState(false);
  const [newEmp,setNewEmp]           = useState({name:'',email:'',roles:['Manager'],priority:100,contractType:'hourly',contractPeriod:'week',wage:0,maxHours:40,targetHours:40});
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
  const [hourlyRate,setHourlyRateRaw]= useState(()=>load('sa2_rate',{amount:150,currency:'kr'}));
  const [lang,setLangRaw]            = useState(()=>load('sa2_lang',detectLang()));
  const [isMobile,setIsMobile]       = useState(()=>typeof window!=='undefined'&&window.innerWidth<860);
  const [mobileMenuOpen,setMobileMenuOpen]=useState(false);
  const [adminMenuOpen,setAdminMenuOpen]=useState(false);
  const adminMenuRef=useRef(null);
  useEffect(()=>{
    const onResize=()=>setIsMobile(window.innerWidth<860);
    window.addEventListener('resize',onResize);
    return ()=>window.removeEventListener('resize',onResize);
  },[]);
  useEffect(()=>{
    if(!adminMenuOpen)return;
    const onDoc=e=>{ if(adminMenuRef.current && !adminMenuRef.current.contains(e.target)) setAdminMenuOpen(false); };
    const onEsc=e=>{ if(e.key==='Escape') setAdminMenuOpen(false); };
    document.addEventListener('mousedown',onDoc);
    document.addEventListener('keydown',onEsc);
    return ()=>{ document.removeEventListener('mousedown',onDoc); document.removeEventListener('keydown',onEsc); };
  },[adminMenuOpen]);

  const setLang=v=>{setLangRaw(v);save('sa2_lang',v);};
  const setHourlyRate=v=>{const val=typeof v==='function'?v(hourlyRate):v;setHourlyRateRaw(val);save('sa2_rate',val);};
  const t=makeT(lang);
  // Date formatting (fmt/fmtLong in lib/dates.js) reads a module-level
  // locale that defaults to en-GB — without this it never actually followed
  // the selected language, so "23 Jul" would show even with Dansk/Español
  // selected. setLocale is a plain module-level assignment (not React
  // state), so this just needs to run whenever lang changes.
  useEffect(()=>{ setLocale(LOCALES[lang]||'en-GB'); },[lang]);
  // Display/group order: whatever's been explicitly saved, plus any role
  // that exists in roleStyles but hasn't been ordered yet (newly added, or
  // roleOrder just hasn't loaded/been set up for this org) appended at the
  // end — so a fresh org or a brand-new role always shows up without
  // needing a manual reorder first. (mergeRoleOrder/reorderRoleList are
  // shared with EmployeeView.jsx's identical merge — see lib/roles.js.)
  const allRoles=mergeRoleOrder(roleOrder,Object.keys(roleStyles));
  // Drag-and-drop reorder (Team view, grouped "By role") — moves
  // draggedRole to just before targetRole in the display order. Deliberately
  // NOT exposed in Coverage's role list — reordering only happens by
  // dragging role groups around in Team. Saved to this browser only (see
  // roleOrder's init above) — not shared with other users.
  const reorderRoles=(draggedRole,targetRole)=>{
    const next=reorderRoleList(allRoles,draggedRole,targetRole);
    if(next===allRoles)return;
    setRoleOrder(next);
    save('sa2_roleOrder_'+orgId,next);
  };

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

  // Shift swaps are written incrementally by employees in their own
  // sessions, so there's nothing here to debounce-sync — just poll (no
  // realtime subscription yet) so newly-claimed swaps show up without a
  // manual refresh.
  useEffect(()=>{
    let alive=true;
    const loadSwaps=()=>fetchShiftSwaps(orgId).then(v=>{if(alive)setSwaps(v);}).catch(err=>console.error('Load swaps failed:',err));
    loadSwaps();
    const iv=setInterval(loadSwaps,45000);
    return ()=>{alive=false;clearInterval(iv);};
  },[orgId]);

  // Sent messages that got a new reply the manager hasn't seen yet — same
  // polling pattern as swaps/time off, feeds into pendingItems below so it
  // shows up in the manager's own bell even without an employees row.
  useEffect(()=>{
    let alive=true;
    const loadReplies=()=>fetchUnseenMessageReplies(orgId).then(v=>{if(alive)setUnseenMessageReplies(v);}).catch(err=>console.error('Load message replies failed:',err));
    loadReplies();
    const iv=setInterval(loadReplies,45000); // fallback in case the realtime subscription below ever drops
    return ()=>{alive=false;clearInterval(iv);};
  },[orgId]);
  // Realtime companion to the poll above — a reply flipping manager_unread
  // to true (or a manager clearing it by opening the thread) shows up
  // immediately. Requires `messages` to be in the supabase_realtime
  // publication (see the direct-messages migration follow-up note).
  useEffect(()=>{
    if(!orgId) return;
    const channel=supabase.channel(`messages-mgr-${orgId}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'messages',filter:`org_id=eq.${orgId}`},()=>{
        fetchUnseenMessageReplies(orgId).then(setUnseenMessageReplies).catch(err=>console.error('Load message replies failed:',err));
      })
      .subscribe();
    return ()=>{ supabase.removeChannel(channel); };
  },[orgId]);

  // Time off can now also be filed directly by an employee (their own
  // time-off/vacation request form), not just entered here — so, like
  // shift swaps above, poll it instead of loading once, so a newly
  // submitted 'Pending' request reaches this attention bell without a
  // manual refresh. Uses setTORaw directly (not setTimeOff) so polling
  // never re-triggers the debounced whole-array sync back to Supabase.
  useEffect(()=>{
    let alive=true;
    const iv=setInterval(()=>{ fetchTimeOff(orgId).then(v=>{if(alive)setTORaw(v);}).catch(err=>console.error('Poll time off failed:',err)); },45000);
    return ()=>{alive=false;clearInterval(iv);};
  },[orgId]);

  // Schedules can now also change from OUTSIDE this session — an employee
  // clocking in/out via the Kiosk, or another manager's tab — not just from
  // edits made right here. Same pattern as time off above: poll and write
  // straight to setSchedsRaw (never setSchedules), so this can't re-trigger
  // the debounced whole-object sync back to Supabase. Without this, a
  // manager who opened the Schedule tab before someone clocked in would
  // never see it until they reloaded the whole page.
  useEffect(()=>{
    let alive=true;
    const iv=setInterval(()=>{ fetchSchedules(orgId).then(v=>{if(alive)setSchedsRaw(v);}).catch(err=>console.error('Poll schedules failed:',err)); },45000);
    return ()=>{alive=false;clearInterval(iv);};
  },[orgId]);

  // Manager-facing email notifications for the three "needs your attention"
  // events (new pending time-off request, newly-claimed swap, new unseen
  // reply) — piggybacks on the polling/state above rather than adding a
  // fourth data source. Refs (not state) track which ids have already been
  // emailed about, so a later 45s poll re-fetching an item that's still
  // pending doesn't re-send the same email every cycle. The very first
  // load's already-pending items are recorded as seen without emailing —
  // only things that show up *after* this session started should ping the
  // manager; otherwise every login would re-email the whole backlog.
  // Requires myEmail (the manager's own login email, independent of whether
  // they have an employees row) and respects nothing else — there's no
  // per-manager opt-out toggle yet, unlike the employee-facing one.
  const seenTOIds=useRef(null);
  useEffect(()=>{
    if(!myEmail) return;
    const pending=timeOff.filter(to=>to.status==='Pending');
    if(seenTOIds.current===null){ seenTOIds.current=new Set(pending.map(to=>to.id)); return; }
    pending.forEach(to=>{
      if(seenTOIds.current.has(to.id)) return;
      seenTOIds.current.add(to.id);
      const emp=employees.find(e=>e.id===to.empId);
      const range=fmtLong(to.startDate)+(to.endDate!==to.startDate?' – '+fmtLong(to.endDate):'');
      const text=t('notif.mgrTimeOffRequest',{name:emp?.name||'?',type:to.type,range});
      sendNotificationEmail({to:myEmail,subject:text,body:text});
    });
  },[timeOff,employees,myEmail]);

  const seenSwapIds=useRef(null);
  useEffect(()=>{
    if(!myEmail) return;
    const pending=swaps.filter(sw=>sw.status==='claimed');
    if(seenSwapIds.current===null){ seenSwapIds.current=new Set(pending.map(sw=>sw.id)); return; }
    pending.forEach(sw=>{
      if(seenSwapIds.current.has(sw.id)) return;
      seenSwapIds.current.add(sw.id);
      const claimant=employees.find(e=>e.id===sw.claimedByEmpId);
      const text=t('notif.mgrSwapClaimed',{name:claimant?.name||'?',day:t('day.'+sw.day)});
      sendNotificationEmail({to:myEmail,subject:text,body:text});
    });
  },[swaps,employees,myEmail]);

  const seenReplyIds=useRef(null);
  useEffect(()=>{
    if(!myEmail) return;
    if(seenReplyIds.current===null){ seenReplyIds.current=new Set(unseenMessageReplies.map(m=>m.id)); return; }
    unseenMessageReplies.forEach(m=>{
      if(seenReplyIds.current.has(m.id)) return;
      seenReplyIds.current.add(m.id);
      const recipient=employees.find(e=>e.id===m.recipientEmpId);
      const text=t('msg.repliedNotif',{name:recipient?.name||'?'});
      sendNotificationEmail({to:myEmail,subject:text,body:text});
    });
  },[unseenMessageReplies,employees,myEmail]);

  // Templates are only ever written from this same Dashboard, so a single
  // load on mount/org-change is enough — no polling needed.
  useEffect(()=>{
    let alive=true;
    fetchTemplates(orgId).then(v=>{if(alive)setTemplates(v);}).catch(err=>console.error('Load templates failed:',err));
    return ()=>{alive=false;};
  },[orgId]);

  // Daily revenue — like templates, only ever entered here (Costs), so a
  // single load on mount/org-change is enough.
  useEffect(()=>{
    let alive=true;
    fetchDailyRevenue(orgId).then(v=>{if(alive)setRevenue(v);}).catch(err=>console.error('Load revenue failed:',err));
    return ()=>{alive=false;};
  },[orgId]);

  // Role colours are shared org-wide (unlike order) — load whatever's
  // saved. An empty result means this org has never saved a role set yet
  // (brand new), so keep the built-in defaults; otherwise the saved set is
  // authoritative as-is — it already reflects any roles the manager has
  // added or removed, so it must NOT be merged back on top of the defaults
  // (that would resurrect a deliberately-deleted default role like Kitchen).
  useEffect(()=>{
    let alive=true;
    fetchRoleStyles(orgId).then(v=>{
      if(!alive) return;
      if(Object.keys(v).length) {
        setRoleStylesRaw(v);
      } else {
        // Nothing saved yet for this org (brand new, or pre-dates this
        // feature) — push the current (default) colours up now so
        // employee sessions have something real to read instead of
        // silently falling back to an approximated colour forever.
        saveRoleStyles(orgId, roleStyles).catch(err=>console.error('Initial role colour push failed:',err));
      }
    }).catch(err=>console.error('Load role colours failed:',err));
    return ()=>{alive=false;};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[orgId]);

  // A manager/owner might ALSO be on the schedule roster (e.g. a working
  // owner) — used only for the profile page's "my display name/avatar"
  // section, same self-match EmployeeView does for its own session.
  useEffect(()=>{
    let alive=true;
    supabase.auth.getUser().then(({data})=>{ if(alive) setMyEmail((data?.user?.email||'').toLowerCase()); });
    return ()=>{alive=false;};
  },[]);

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
  const dRoleStyles=useCallback(mkDebounce(v=>saveRoleStyles(orgId,v),'roleStyles'),[orgId]);

  const setEmployees=v=>{const val=typeof v==='function'?v(employees):v;setEmpRaw(val);dEmp(val);};
  const setBlocks   =v=>{const val=typeof v==='function'?v(blocks):v;setBlocksRaw(val);dBlk(val);};
  const setSchedules=v=>{const val=typeof v==='function'?v(schedules):v;setSchedsRaw(val);dSched(val);};
  const setTimeOff  =v=>{const val=typeof v==='function'?v(timeOff):v;setTORaw(val);dTO(val);};
  const setRoleStyles=v=>{const val=typeof v==='function'?v(roleStyles):v;setRoleStylesRaw(val);dRoleStyles(val);};

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

  const myId=employees.find(e=>myEmail&&e.email&&e.email.toLowerCase()===myEmail)?.id||null;
  const me=employees.find(e=>e.id===myId);
  const saveMyName=(newName)=>updateEmp(myId,'name',newName);
  const saveMyColor=(palIdx)=>updateEmp(myId,'palIdx',palIdx);
  const saveMyPhone=(phone)=>updateEmp(myId,'phone',phone);
  const saveMyAvailability=(availability)=>updateEmp(myId,'availability',availability);
  const saveMyEmailNotifications=(emailNotifications)=>updateEmp(myId,'emailNotifications',emailNotifications);

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
      const warnings=noMgr.map(({day,block})=>'! '+t('sched.noMgr',{day:`${t('day.'+day)} ${fmt(wd[DAYS.indexOf(day)])}`,block}));
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
        const warnings=noMgr.map(({day,block})=>'! '+t('sched.noMgr',{day:`${t('day.'+day)} ${fmt(wd[DAYS.indexOf(day)])}`,block}));
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
        const warnings=noMgr.map(({day,block})=>'! '+t('sched.noMgr',{day:`${t('day.'+day)} ${fmt(wd[DAYS.indexOf(day)])}`,block}));
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

  // Notify every employee who has a shift this week that the schedule is
  // live. Fire-and-forget: a failed notification insert shouldn't block
  // confirming the schedule itself (it's just retried implicitly next time
  // this employee's bell polls anyway if we ever add retry — for now it's
  // logged and otherwise ignored).
  // Creates the in-app notification row (source of truth, always happens)
  // and, whenever the recipient has an email on file, fires an email
  // companion reusing the exact same translated text. Shared by every
  // manager-side notification site below instead of repeating the
  // lookup+send pair at each call.
  const notify=(empId,messageKey,messageVars={})=>{
    createNotification(orgId,empId,{type:messageKey.replace('notif.',''),messageKey,messageVars}).catch(err=>console.error('Notify failed:',err));
    const target=employees.find(e=>e.id===empId);
    // emailNotifications defaults to true for anyone who hasn't touched the
    // toggle yet (opt-out, not opt-in) — only skip when it's explicitly false.
    if(target?.email && target.emailNotifications!==false){ const text=t(messageKey,messageVars); sendNotificationEmail({to:target.email,subject:text,body:text}); }
  };

  // Direct messages — opens ComposeMessageModal, optionally pre-selecting
  // one employee (the per-card "Message" quick action in Employees) rather
  // than defaulting to "everyone" every time.
  const openCompose=(presetEmpIds)=>setComposeModal({presetEmpIds:presetEmpIds||[]});
  // Opens Kiosk mode (see KioskView.jsx) in a new tab, so this manager tab
  // stays on the normal Dashboard. On a shared on-site device, a manager
  // instead just visits this same URL with ?kiosk=1 directly and signs in —
  // this button is really only for trying it out or re-launching it from
  // the same device you're already managing from.
  const openKiosk=()=>{ const url=new URL(window.location.href); url.searchParams.set('kiosk','1'); window.open(url.toString(), '_blank'); };
  const senderLabel=me?.name||orgName||'Management';
  const submitCompose=({recipientEmpIds,subject,body,allowReplies})=>{
    setComposeBusy(true);
    sendMessage(orgId,recipientEmpIds,{senderLabel,subject,body,allowReplies})
      .then(()=>setComposeModal(null))
      .catch(err=>alert(err.message||'Failed to send'))
      .finally(()=>setComposeBusy(false));
  };

  const notifySchedulePublished=()=>{
    if(!schedule)return;
    const empIds=new Set();
    DAYS.forEach(day=>blocks.forEach(b=>(schedule[day]?.[b.id]||[]).forEach(a=>empIds.add(a.empId))));
    const week=`${fmt(weekDates[0])} – ${fmt(weekDates[6])}`;
    empIds.forEach(empId=>notify(empId,'notif.schedulePublished',{week}));
  };
  const confirmSchedule   =()=>{setSchedules(p=>({...p,[wKey]:{...p[wKey],confirmed:true}}));notifySchedulePublished();};
  const unconfirmSchedule =()=>setSchedules(p=>({...p,[wKey]:{...p[wKey],confirmed:false}}));
  const deleteSchedule    =()=>{setSchedules(p=>{const n={...p};delete n[wKey];return n;});setSelected(null);};
  const deleteMonth       =()=>{const offs=getMonthOffsets(displayMonth);setSchedules(p=>{const n={...p};offs.forEach(off=>delete n[weekKey(off)]);return n;});};

  // Opens a standalone, unstyled-by-the-app HTML page in a new tab and
  // triggers the browser's print dialog on it — a clean printout (e.g. for
  // a break-room board) is much easier to get right in its own document
  // than by fighting the live app's layout/print CSS.
  const printSchedule = () => {
    if (!schedule) return;
    const empById = new Map(employees.map(e=>[e.id,e]));
    const rangeLabel = `${fmt(weekDates[0])} – ${fmt(weekDates[6])}`;
    const dayHeaders = DAYS.map((day,i)=>`<th>${escapeHtml(t('day.'+day))}<br><span class="date">${escapeHtml(fmt(weekDates[i]))}</span></th>`).join('');
    const rows = blocks.map(b=>{
      const cells = DAYS.map(day=>{
        const assigned = schedule[day]?.[b.id] || [];
        if (!assigned.length) return '<td class="empty">—</td>';
        const shifts = assigned.map(a=>{
          const name = empById.get(a.empId)?.name || a.name || '?';
          return `<div class="shift"><span class="name">${escapeHtml(name)}</span><span class="role">${escapeHtml(a.role)}</span></div>`;
        }).join('');
        return `<td>${shifts}</td>`;
      }).join('');
      return `<tr><th class="blockName">${escapeHtml(b.name)}<br><span class="time">${escapeHtml(b.start)}–${escapeHtml(b.end)}</span></th>${cells}</tr>`;
    }).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(orgName)} — ${escapeHtml(rangeLabel)}</title><style>
      body{font-family:Arial,Helvetica,sans-serif;color:#211b15;padding:24px;}
      h1{font-size:18px;margin:0 0 2px;}
      .sub{font-size:12px;color:#6b625a;margin-bottom:18px;}
      table{width:100%;border-collapse:collapse;}
      th,td{border:1px solid #d8d1c8;padding:6px 8px;font-size:11px;vertical-align:top;text-align:left;}
      thead th{background:#f4efe8;text-align:center;}
      th.blockName{background:#f4efe8;white-space:nowrap;}
      .time,.date{font-weight:400;color:#6b625a;font-size:10px;}
      td.empty{text-align:center;color:#b3aa9f;}
      .shift{margin-bottom:4px;}
      .name{display:block;font-weight:600;}
      .role{display:block;font-size:9px;color:#6b625a;}
      @media print{ body{padding:0;} }
    </style></head><body>
      <h1>${escapeHtml(orgName)}</h1>
      <div class="sub">${escapeHtml(rangeLabel)}</div>
      <table><thead><tr><th></th>${dayHeaders}</tr></thead><tbody>${rows}</tbody></table>
      <script>window.onload=()=>window.print();<\/script>
    </body></html>`;
    const blob = new Blob([html], { type:'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(()=>URL.revokeObjectURL(url), 30000);
  };

  // Only ever called while a move is already armed (via the edit modal's
  // "Move" button) — clicking a chip with nothing armed opens the edit
  // modal instead (see the EmpChip onClick in the Week/Day table).
  const handleSlotClick=(day,blockId,idx)=>{
    if(!schedule||!selected)return;closePicker();
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

  // Editing an existing assignment in place — separate from the move/swap
  // click on the chip itself, so opening the editor never triggers a swap.
  const openEditSlot=(day,blockId,idx)=>{
    const entry=schedule?.[day]?.[blockId]?.[idx];
    const block=blocks.find(b=>b.id===blockId);
    if(!entry||!block)return;
    setEditingSlot({day,blockId,idx});
    setEditTimes({start:entry.start||block.start,end:entry.end||block.end});
    setEditRole(entry.role);
    setEditActual({
      mode:entry.noShow?'noshow':(entry.actualStart||entry.actualEnd)?'adjusted':'scheduled',
      start:entry.actualStart||entry.start||block.start,
      end:entry.actualEnd||entry.end||block.end,
    });
    setEditNotes({inNote:entry.clockInNote||'',outNote:entry.clockNote||''});
    document.body.style.overflow='hidden';
  };
  const closeEditSlot=()=>{ document.body.style.overflow=''; setEditingSlot(null); };
  const saveEditSlot=()=>{
    if(!editingSlot||!schedule)return;
    const{day,blockId,idx}=editingSlot;
    const block=blocks.find(b=>b.id===blockId);
    if(!block)return;
    const ns=JSON.parse(JSON.stringify(schedule));
    const entry=ns[day]?.[blockId]?.[idx];if(!entry)return;
    entry.role=editRole;
    if(editTimes.start===block.start&&editTimes.end===block.end){delete entry.start;delete entry.end;}
    else{entry.start=editTimes.start;entry.end=editTimes.end;}
    if(editActual.mode==='noshow'){ entry.noShow=true; delete entry.actualStart; delete entry.actualEnd; delete entry.clockInNote; delete entry.clockNote; }
    else if(editActual.mode==='adjusted'){
      delete entry.noShow; entry.actualStart=editActual.start; entry.actualEnd=editActual.end;
      // Manager-editable copies of whatever the punch clock/kiosk recorded —
      // trimmed-empty clears the note entirely rather than storing ''.
      if(editNotes.inNote.trim()) entry.clockInNote=editNotes.inNote.trim(); else delete entry.clockInNote;
      if(editNotes.outNote.trim()) entry.clockNote=editNotes.outNote.trim(); else delete entry.clockNote;
    }
    else { delete entry.noShow; delete entry.actualStart; delete entry.actualEnd; delete entry.clockInNote; delete entry.clockNote; }
    setSchedules(p=>({...p,[wKey]:{...p[wKey],schedule:ns,confirmed:false}}));
    closeEditSlot();
  };
  const removeEditSlot=()=>{
    if(!editingSlot)return;
    removeFromSlot(editingSlot.day,editingSlot.blockId,editingSlot.idx);
    closeEditSlot();
  };
  const moveEditSlot=()=>{
    if(!editingSlot||!schedule)return;
    const{day,blockId,idx}=editingSlot;
    const entry=schedule[day]?.[blockId]?.[idx];
    if(!entry)return;
    setSelected({...entry,day,blockId,idx});
    closeEditSlot();
  };

  // Pull one person off a shift outright — e.g. they've called in sick.
  // No confirmation: it's a single click to remove, a single click to re-add.
  function removeFromSlot(day,blockId,idx){
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

  // assignmentHours (assignments can carry an optional per-person start/end
  // override, set by dragging their bar in the Gantt view) now lives in
  // lib/schedule.js, shared with EmployeeView.jsx instead of being redefined
  // identically in both places.

  // "Hours worked" — actual hours where recorded (post-shift corrections,
  // no-shows), scheduled hours everywhere else (i.e. every future/unedited
  // shift, since actualAssignmentHours falls back to the scheduled time).
  const empHoursMap=employees.reduce((acc,e)=>{
    if(!schedule){acc[e.id]=0;return acc;}
    let h=0;DAYS.forEach(day=>blocks.forEach(b=>{const a=(schedule[day]?.[b.id]||[]).find(a=>a.empId===e.id);if(a)h+=actualAssignmentHours(a,b);}));
    acc[e.id]=h;return acc;
  },{});
  const empHours=id=>empHoursMap[id]||0;

  // Parallel map counting how many of those hours came from a clocked/
  // corrected shift rather than a bare schedule estimate — same "is this
  // figure trustworthy as an actual, or just the plan" flag used in Costs.
  const empCorrectedMap=employees.reduce((acc,e)=>{
    if(!schedule){acc[e.id]=0;return acc;}
    let c=0;DAYS.forEach(day=>blocks.forEach(b=>{const a=(schedule[day]?.[b.id]||[]).find(a=>a.empId===e.id);if(a&&(a.noShow||a.actualStart||a.actualEnd))c++;}));
    acc[e.id]=c;return acc;
  },{});

  // Month-to-date hours for whichever employee row the logged-in manager is
  // themselves matched to (owner-operators who also work shifts) — same
  // calculation EmployeeView.jsx uses for its own "Hours worked" card, so
  // the Profile tab shows the same thing regardless of which side you're
  // on. Walks every loaded week rather than just the one currently open in
  // the Schedule tab, since "this month" shouldn't depend on what the
  // manager happens to be looking at.
  const myMonthHours = myId ? (() => {
    let total = 0;
    const now = new Date();
    const startISO = dateToISO(new Date(now.getFullYear(), now.getMonth(), 1));
    const endISO = todayISO();
    Object.entries(schedules).forEach(([wk, entry]) => {
      const sched = entry?.schedule;
      if (!sched) return;
      const monday = weekKeyToMonday(wk);
      DAYS.forEach((day, i) => {
        const d = new Date(monday); d.setDate(monday.getDate() + i);
        const iso = dateToISO(d);
        if (iso < startISO || iso > endISO) return;
        blocks.forEach(b => {
          const a = (sched[day]?.[b.id] || []).find(x => x.empId === myId);
          if (a) total += actualAssignmentHours(a, b);
        });
      });
    });
    return total;
  })() : 0;

  // Same month-to-date walk, counting clocked/corrected shifts instead of
  // summing hours — feeds the "N corrected" hint on the Profile tab's
  // hours-worked card, same as empCorrectedMap does for the week view.
  const myMonthCorrected = myId ? (() => {
    let count = 0;
    const now = new Date();
    const startISO = dateToISO(new Date(now.getFullYear(), now.getMonth(), 1));
    const endISO = todayISO();
    Object.entries(schedules).forEach(([wk, entry]) => {
      const sched = entry?.schedule;
      if (!sched) return;
      const monday = weekKeyToMonday(wk);
      DAYS.forEach((day, i) => {
        const d = new Date(monday); d.setDate(monday.getDate() + i);
        const iso = dateToISO(d);
        if (iso < startISO || iso > endISO) return;
        blocks.forEach(b => {
          const a = (sched[day]?.[b.id] || []).find(x => x.empId === myId);
          if (a && (a.noShow || a.actualStart || a.actualEnd)) count++;
        });
      });
    });
    return count;
  })() : 0;

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
    const state={day,blockId,empId,edge,rect,rangeStart,totalMin,live:{start:origStart,end:origEnd},moved:false};
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
      if(start!==st.live.start||end!==st.live.end)st.moved=true;
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
      if(st&&st.moved){
        applyGanttResize(st.day,st.blockId,st.empId,st.live.start,st.live.end);
        ganttJustDraggedRef.current=true;
        setTimeout(()=>{ganttJustDraggedRef.current=false;},0);
      }
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
  // Cloning an employee deliberately drops email — two roster rows sharing
  // one login email would make "which one am I" ambiguous in EmployeeView.
  const duplicateEmp=emp=>setEmployees(p=>[...p,{...JSON.parse(JSON.stringify(emp)),id:crypto.randomUUID(),name:emp.name+' (copy)',email:'',palIdx:p.length%EMP_PALETTE.length}]);
  const removeEmp   =id=>{setEmployees(p=>p.filter(e=>e.id!==id));if(expandedEmp===id)setExpandedEmp(null);};
  const addEmployee =()=>{
    if(!newEmp.name.trim())return;
    setEmployees(p=>[...p,{...newEmp,id:crypto.randomUUID(),palIdx:p.length%EMP_PALETTE.length,availability:Object.fromEntries(DAYS.map(d=>[d,null]))}]);
    setNewEmp({name:'',email:'',roles:['Manager'],priority:100,contractType:'hourly',contractPeriod:'week',wage:0,maxHours:40,targetHours:40});setShowAddEmp(false);
  };

  const addTO         =()=>{if(!newTO.empId)return;setTimeOff(p=>[...p,{...newTO,id:crypto.randomUUID()}]);setNewTO({empId:'',startDate:todayISO(),endDate:todayISO(),type:'Holiday',note:'',status:'Pending'});setShowAddTO(false);};
  // Approving/rejecting a time-off request previously left the employee to
  // discover the outcome by re-opening the app themselves — there was no
  // notification of any kind. Now fires both the in-app row and (when they
  // have an email on file) the email companion via the shared notify()
  // helper above.
  const updateTOStatus=(id,status)=>{
    setTimeOff(p=>p.map(t=>t.id===id?{...t,status}:t));
    if(status==='Approved'||status==='Rejected'){
      const to=timeOff.find(t=>t.id===id);
      if(!to) return;
      const range=fmtLong(to.startDate)+(to.endDate!==to.startDate?' – '+fmtLong(to.endDate):'');
      notify(to.empId, status==='Approved'?'notif.timeOffApproved':'notif.timeOffRejected', {type:to.type,range});
    }
  };
  const removeTO      =id=>setTimeOff(p=>p.filter(t=>t.id!==id));

  const reloadSwaps=()=>fetchShiftSwaps(orgId).then(setSwaps).catch(err=>console.error('Load swaps failed:',err));
  const pendingSwaps=swaps.filter(sw=>sw.status==='claimed');

  // Move the assignment on the real schedule from whoever offered the shift
  // to whoever claimed it, then mark the swap approved and let both sides
  // know. The swap may reference a week other than the one currently being
  // viewed, so it's looked up by weekKey rather than assumed to be `schedule`.
  const approveSwap=(sw)=>{
    const weekEntry=schedules[sw.weekKey];
    const list=weekEntry?.schedule?.[sw.day]?.[sw.blockId];
    const idx=list?list.findIndex(a=>a.empId===sw.fromEmpId&&a.role===sw.role):-1;
    const claimant=employees.find(e=>e.id===sw.claimedByEmpId);
    if(idx==null||idx<0||!claimant){alert(t('swap.approveFailed'));return;}
    const ns=JSON.parse(JSON.stringify(schedules));
    const entry=ns[sw.weekKey].schedule[sw.day][sw.blockId][idx];
    ns[sw.weekKey].schedule[sw.day][sw.blockId][idx]={...entry,empId:claimant.id,name:claimant.name};
    setSchedules(ns);
    updateShiftSwap(sw.id,{status:'approved'}).catch(err=>console.error(err));
    const day=t('day.'+sw.day);
    notify(sw.fromEmpId,'notif.swapApproved',{day});
    notify(sw.claimedByEmpId,'notif.swapApproved',{day});
    reloadSwaps();
  };

  const declineSwapManager=(sw)=>{
    updateShiftSwap(sw.id,{status:'declined'}).catch(err=>console.error(err));
    const day=t('day.'+sw.day);
    notify(sw.fromEmpId,'notif.swapDeclined',{day});
    if(sw.claimedByEmpId) notify(sw.claimedByEmpId,'notif.swapDeclined',{day});
    reloadSwaps();
  };

  const saveCurrentAsTemplate=(name)=>{
    saveTemplate(orgId,name,blocks).then(tpl=>setTemplates(p=>[tpl,...p])).catch(err=>{console.error(err);alert(t('save.failedGeneric'));});
  };
  const applyTemplateBlocks=(tpl)=>{
    if(!confirm(t('tmpl.applyConfirm',{name:tpl.name})))return;
    setBlocks(tpl.blocks);
  };
  const deleteTemplateById=(id)=>{
    deleteTemplate(id).then(()=>setTemplates(p=>p.filter(x=>x.id!==id))).catch(err=>{console.error(err);alert(t('save.failedGeneric'));});
  };

  const hasWages=employees.some(e=>e.wage>0);
  // Costs tab has its own week selector, independent of whatever week the
  // Schedule tab is currently showing.
  const costsWeekDates=getWeekDates(costsWeekOffset);
  const costsWKey=weekKey(costsWeekOffset);
  const costsSchedule=schedules[costsWKey]?.schedule||null;
  // Costs is specifically about real money spent, so it uses actual hours
  // (falls back to scheduled for anything not yet corrected) rather than
  // the plain scheduled-hours assignmentHours used for planning/coverage.
  // Alongside the hours total, also count how many of the assignments it's
  // built from have actually been touched by the punch clock/kiosk or a
  // manager's correction (noShow, or an actualStart/actualEnd recorded) —
  // so the Costs tab can flag "this figure includes N corrected shift(s)"
  // instead of a plain hours number that looks purely scheduled either way.
  const hoursForSchedule=(ws,empId)=>{
    if(!ws) return {hours:0,corrected:0};
    let h=0,corrected=0;
    DAYS.forEach(day=>blocks.forEach(b=>{
      const a=(ws[day]?.[b.id]||[]).find(a=>a.empId===empId);
      if(a){ h+=actualAssignmentHours(a,b); if(a.noShow||a.actualStart||a.actualEnd) corrected++; }
    }));
    return {hours:h,corrected};
  };
  const costData=employees.map(e=>{const{hours,corrected}=hoursForSchedule(costsSchedule,e.id);return{emp:e,hours,corrected,costUnits:hasWages?calcWageCost(e,hours):parseFloat((hours*(e.priority||100)/100).toFixed(2))};});
  const totalCostUnits=costData.reduce((s,d)=>s+d.costUnits,0);
  const maxCostUnits=Math.max(...costData.map(d=>d.costUnits),0.01);
  const monthCostData=employees.map(e=>{let h=0,corrected=0;getMonthOffsets(displayMonth).forEach(off=>{const ws=schedules[weekKey(off)]?.schedule;if(!ws)return;DAYS.forEach(day=>blocks.forEach(b=>{const a=(ws[day]?.[b.id]||[]).find(a=>a.empId===e.id);if(a){h+=actualAssignmentHours(a,b);if(a.noShow||a.actualStart||a.actualEnd)corrected++;}}));});return{emp:e,hours:h,corrected,costUnits:hasWages?calcWageCost(e,h):parseFloat((h*(e.priority||100)/100).toFixed(2))};});
  const totalMonthCostUnits=monthCostData.reduce((s,d)=>s+d.costUnits,0);
  const maxMonthCostUnits=Math.max(...monthCostData.map(d=>d.costUnits),0.01);
  const mkRoleCosts=data=>allRoles.reduce((acc,r)=>{acc[r]=parseFloat(data.filter(d=>(d.emp.roles||[]).includes(r)).reduce((s,d)=>s+d.costUnits,0).toFixed(2));return acc;},{});
  const weekRoleCosts=mkRoleCosts(costData),monthRoleCosts=mkRoleCosts(monthCostData);
  const toMoney=u=>{if(hasWages){return `kr ${Math.round(u).toLocaleString('da-DK')}`;}const val=u*hourlyRate.amount;return `${hourlyRate.currency} ${Math.round(val).toLocaleString('da-DK')}`;};
  // Same conversion toMoney does (costUnits -> a real money figure), but
  // returning the raw number instead of a formatted string — needed to do
  // math (labor cost % of revenue) rather than just display it.
  const toMoneyRaw=u=>hasWages?u:u*hourlyRate.amount;

  // Per-day labor cost for the Costs tab's own selected week — every
  // assignment scheduled that day, summed the same way costData sums a
  // whole week per employee. Feeds the revenue-vs-labor-cost comparison
  // below (each day's actual sales vs what staffing that day cost).
  const dailyCostUnits=day=>{ let h=0; blocks.forEach(b=>{ (costsSchedule?.[day]?.[b.id]||[]).forEach(a=>{ const emp=employees.find(e=>e.id===a.empId); if(!emp) return; const hrs=actualAssignmentHours(a,b); h+=hasWages?calcWageCost(emp,hrs):parseFloat((hrs*(emp.priority||100)/100).toFixed(2)); }); }); return h; };
  const dailyLaborCostByDate=Object.fromEntries(DAYS.map((day,i)=>[dateToISO(costsWeekDates[i]),toMoneyRaw(dailyCostUnits(day))]));

  // Revenue is entered by hand (no POS integration) — one number per
  // calendar day, kept in the `revenue` map ({isoDate:amount}) and persisted
  // immediately on blur. Optimistic: the input reflects the typed value
  // right away, the Supabase write happens in the background.
  const saveRevenueForDate=(iso,amount)=>{
    setRevenue(p=>({...p,[iso]:amount}));
    saveDailyRevenue(orgId,iso,amount).catch(err=>console.error('Save revenue failed:',err));
  };
  // Whole calendar month's revenue, independent of which weeks actually got
  // scheduled/generated — "how much did we make this month" shouldn't
  // silently exclude days that just don't have a published schedule yet.
  const monthRevenueTotal=(()=>{ const{y,m}=displayMonth; const days=new Date(y,m+1,0).getDate(); let total=0; for(let d=1;d<=days;d++){ total+=revenue[dateToISO(new Date(y,m,d))]||0; } return total; })();

  const totalStats=()=>{if(!schedule)return null;let f=0,m=0;DAYS.forEach(day=>blocks.forEach(b=>{const a=schedule[day]?.[b.id]||[],r=getBlockRoles(b,day);f+=a.length;allRoles.forEach(role=>{const need=r[role]||0,got=a.filter(x=>x.role===role).length;if(got<need)m+=(need-got);});}));return{filled:f,missing:m};};
  const stats=totalStats();
  const filteredTO=timeOff.filter(to=>{if(toFilter==='pending')return to.status==='Pending';if(toFilter==='approved')return to.status==='Approved';if(toFilter==='this-week')return wkISOs.some(iso=>to.startDate<=iso&&to.endDate>=iso);return true;}).sort((a,b)=>a.startDate.localeCompare(b.startDate));
  const attentionCount=pendingCount+pendingSwaps.length;
  // Feeds the header notification bell's "needs your attention" section —
  // same underlying data as the attentionCount badge above, just formatted
  // into readable rows. Both resolve in the Time Off tab, so clicking either
  // kind of row just jumps there rather than trying to deep-link to the
  // exact request.
  const pendingItems=[
    ...timeOff.filter(to=>to.status==='Pending').map(to=>{
      const emp=employees.find(e=>e.id===to.empId);
      return{ id:'to-'+to.id, label:`${emp?.name||'?'} · ${to.type} · ${fmtLong(to.startDate)}${to.endDate!==to.startDate?' – '+fmtLong(to.endDate):''}`, onClick:()=>setView('timeoff') };
    }),
    ...pendingSwaps.map(sw=>{
      const from=employees.find(e=>e.id===sw.fromEmpId),claimant=employees.find(e=>e.id===sw.claimedByEmpId);
      return{ id:'sw-'+sw.id, label:`${from?.name||'?'} ${t('swap.to',{name:claimant?.name||'?'})} · ${sw.role} · ${t('day.'+sw.day)}`, onClick:()=>setView('timeoff') };
    }),
    ...unseenMessageReplies.map(m=>{
      const recipient=employees.find(e=>e.id===m.recipientEmpId);
      return{ id:'msgreply-'+m.id, label:t('msg.repliedNotif',{name:recipient?.name||'?'}), onClick:()=>setOpenManagerThread(m) };
    }),
  ];
  // Time Off / Coverage / Costs are grouped behind a single "Admin" dropdown
  // in the desktop nav (see adminNavItems below) rather than each getting
  // their own top-level tab — Schedule/Employees/Profile are the tabs
  // someone reaches for constantly, the other three are periodic
  // admin/reporting tasks. The mobile menu keeps them as a flat list (with a
  // small section label) since everything there is already behind the
  // hamburger, so a second layer of nesting would just add taps.
  const navItems=[{k:'schedule',l:t('nav.schedule')},{k:'employees',l:t('nav.employees')},{k:'profile',l:t('nav.profile')}];
  const adminNavItems=[{k:'timeoff',l:attentionCount?`${t('nav.timeoff')} · ${attentionCount}`:t('nav.timeoff')},{k:'coverage',l:t('nav.coverage')},{k:'costs',l:t('nav.costs')}];
  const mobileNavItems=[{k:'schedule',l:t('nav.schedule')},{k:'employees',l:t('nav.employees')},...adminNavItems,{k:'profile',l:t('nav.profile')}];
  const notes=weekData?.notes||'',warnings=weekData?.warnings||[];

  const s=styles;

  return (<>
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
          {[navItems[0],navItems[1]].map(({k,l})=>{const active=view===k;return(<button key={k} onClick={()=>setView(k)} style={{fontFamily:'inherit',padding:'0 16px',height:56,background:'none',border:'none',cursor:'pointer',fontSize:13,fontWeight:active?500:400,color:active?T.text:T.text2,position:'relative',transition:'color 0.15s',whiteSpace:'nowrap'}}>{l}{active&&<div style={{position:'absolute',bottom:0,left:16,right:16,height:2,background:T.accent,borderRadius:'2px 2px 0 0'}}/>}</button>);})}
          <div ref={adminMenuRef} style={{position:'relative',height:56,display:'flex',alignItems:'center'}}>
            {(()=>{const adminActive=adminNavItems.some(i=>i.k===view);return(
              <button onClick={()=>setAdminMenuOpen(p=>!p)} style={{fontFamily:'inherit',padding:'0 16px',height:56,background:'none',border:'none',cursor:'pointer',fontSize:13,fontWeight:adminActive?500:400,color:adminActive?T.text:T.text2,position:'relative',transition:'color 0.15s',whiteSpace:'nowrap',display:'flex',alignItems:'center',gap:4}}>
                {t('nav.admin')}<span style={{fontSize:9,transform:adminMenuOpen?'rotate(180deg)':'none',transition:'transform 0.15s'}}>▾</span>
                {adminActive&&<div style={{position:'absolute',bottom:0,left:16,right:16,height:2,background:T.accent,borderRadius:'2px 2px 0 0'}}/>}
              </button>
            );})()}
            {adminMenuOpen && (
              <div style={{position:'absolute',top:'calc(100% - 6px)',left:8,zIndex:200,background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,boxShadow:'0 20px 50px -14px rgba(0,0,0,0.4)',padding:6,minWidth:180}}>
                {adminNavItems.map(({k,l})=>{const active=view===k;return(
                  <button key={k} onClick={()=>{setView(k);setAdminMenuOpen(false);}} style={{display:'block',width:'100%',textAlign:'left',fontFamily:'inherit',padding:'9px 12px',borderRadius:8,background:active?T.surfaceWarm:'transparent',border:'none',cursor:'pointer',fontSize:13,fontWeight:active?600:400,color:active?T.text:T.text2}}>{l}</button>
                );})}
              </div>
            )}
          </div>
          {(()=>{const {k,l}=navItems[2];const active=view===k;return(<button key={k} onClick={()=>setView(k)} style={{fontFamily:'inherit',padding:'0 16px',height:56,background:'none',border:'none',cursor:'pointer',fontSize:13,fontWeight:active?500:400,color:active?T.text:T.text2,position:'relative',transition:'color 0.15s',whiteSpace:'nowrap'}}>{l}{active&&<div style={{position:'absolute',bottom:0,left:16,right:16,height:2,background:T.accent,borderRadius:'2px 2px 0 0'}}/>}</button>);})()}
        </div>
        <span style={{fontSize:11,fontWeight:600,padding:'3px 10px',borderRadius:999,marginRight:8,background:MEMBERSHIP_ROLE_COLORS[role]?.bg||MEMBERSHIP_ROLE_COLORS.employee.bg,color:MEMBERSHIP_ROLE_COLORS[role]?.text||MEMBERSHIP_ROLE_COLORS.employee.text,border:`1px solid ${MEMBERSHIP_ROLE_COLORS[role]?.border||MEMBERSHIP_ROLE_COLORS.employee.border}`}}>{t('team.role'+(role.charAt(0).toUpperCase()+role.slice(1)))}</span>
        <select value={lang} onChange={e=>setLang(e.target.value)} style={{fontFamily:'inherit',fontSize:12,color:T.text2,background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:'6px 8px',marginRight:8,cursor:'pointer',outline:'none'}}>{LANGUAGES.map(L=><option key={L.code} value={L.code}>{L.label}</option>)}</select>
        <span style={{marginRight:8}}><NotificationBell empId={myId} pendingItems={pendingItems} t={t} lang={lang} onNavigate={link=>{setView('schedule');if(link?.weekOffset!=null)setWeekOffset(link.weekOffset);}}/></span>
        <button onClick={toggleTheme} style={{width:34,height:34,marginRight:8,borderRadius:8,border:`1px solid ${T.border}`,background:T.surface,color:T.text2,cursor:'pointer',fontSize:15,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{isDark()?'☀':'☾'}</button>
        <Btn onClick={()=>calMode==='month'?generateMonth():generate()} disabled={generating} variant="primary">{generating?t('common.generating'):t('common.generate')}</Btn>
        {isOwner&&<span style={{marginLeft:8,display:'inline-block'}}><Btn onClick={seedTestDataAndGenerateMonth} disabled={generating} variant="secondary">Test: full month</Btn></span>}
        </>)}
        {isMobile&&(
          <button onClick={()=>setMobileMenuOpen(p=>!p)} aria-label="Menu" style={{width:36,height:36,marginLeft:8,borderRadius:8,border:`1px solid ${T.border}`,background:mobileMenuOpen?T.surfaceWarm:T.surface,color:T.text,cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{mobileMenuOpen?'✕':'☰'}</button>
        )}
      </div>

      {isMobile&&mobileMenuOpen&&(
        <div style={{position:'fixed',top:56,left:0,right:0,background:T.surface,borderBottom:`1px solid ${T.border}`,boxShadow:'0 12px 30px -12px rgba(33,27,21,0.35)',zIndex:99,padding:'8px 16px 16px',display:'flex',flexDirection:'column',gap:4,maxHeight:'calc(100vh - 56px)',overflowY:'auto'}}>
          {mobileNavItems.map(({k,l})=>{const active=view===k;return(<button key={k} onClick={()=>{setView(k);setMobileMenuOpen(false);}} style={{fontFamily:'inherit',textAlign:'left',padding:'11px 12px',borderRadius:8,background:active?T.surfaceWarm:'transparent',border:'none',cursor:'pointer',fontSize:14,fontWeight:active?600:400,color:active?T.text:T.text2}}>{l}</button>);})}
          <div style={{display:'flex',gap:8,marginTop:8,alignItems:'center'}}>
            <select value={lang} onChange={e=>setLang(e.target.value)} style={{flex:1,fontFamily:'inherit',fontSize:13,color:T.text2,background:T.surfaceWarm,border:`1px solid ${T.border}`,borderRadius:8,padding:'8px 10px',cursor:'pointer',outline:'none'}}>{LANGUAGES.map(L=><option key={L.code} value={L.code}>{L.label}</option>)}</select>
            <NotificationBell empId={myId} pendingItems={pendingItems} t={t} lang={lang} onNavigate={link=>{setMobileMenuOpen(false);setView('schedule');if(link?.weekOffset!=null)setWeekOffset(link.weekOffset);}}/>
            <button onClick={toggleTheme} style={{width:38,height:38,borderRadius:8,border:`1px solid ${T.border}`,background:T.surfaceWarm,color:T.text2,cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{isDark()?'☀':'☾'}</button>
          </div>
          <div style={{marginTop:8}}><Btn onClick={()=>{setMobileMenuOpen(false);calMode==='month'?generateMonth():generate();}} disabled={generating} variant="primary">{generating?t('common.generating'):t('common.generate')}</Btn></div>
          {isOwner&&<div style={{marginTop:6}}><Btn onClick={()=>{setMobileMenuOpen(false);seedTestDataAndGenerateMonth();}} disabled={generating} variant="secondary">Test: full month</Btn></div>}
        </div>
      )}

      {saveError?(
        <div style={{position:'fixed',bottom:20,left:isMobile?14:'auto',right:20,maxWidth:isMobile?'calc(100% - 28px)':360,zIndex:200,background:T.surface,border:`1px solid ${T.danger}55`,borderRadius:12,padding:'12px 14px',display:'flex',alignItems:'flex-start',gap:10,boxShadow:'0 12px 30px -10px rgba(33,27,21,0.35)'}}>
          <span style={{fontSize:13,fontWeight:700,color:T.danger}}>!</span>
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

      <div style={{maxWidth:1600,margin:'0 auto',padding:isMobile?'20px 14px':'24px 32px'}}>

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
          const rows=blocks.map(block=>{
            const already=(shiftModalSchedule[dayName]?.[block.id]||[]).some(a=>a.empId===shiftModalEmp.id);
            return(<div key={block.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:8,opacity:already?0.55:1}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:500,color:T.text}}>{block.name} <span style={{fontSize:11,color:T.text3,fontWeight:400}}>{block.start}–{block.end}</span></div>
                <div style={{marginTop:3}}><RoleBadge role={role} rs={rs}/></div>
              </div>
              <Btn small variant={already?'ghost':'secondary'} disabled={already} onClick={()=>addShiftForEmployee(dayName,block.id,role,shiftModalEmp,block.start,block.end)}>{already?t('emp.alreadyOnShift'):t('emp.addShiftBtn')}</Btn>
            </div>);
          });
          const homeBlock=blocks[0];
          if(homeBlock){
            const already=(shiftModalSchedule[dayName]?.[homeBlock.id]||[]).some(a=>a.empId===shiftModalEmp.id);
            const times=shiftModalTimes.custom||{start:homeBlock.start,end:homeBlock.end};
            const setTime=(field,val)=>setShiftModalTimes(p=>({...p,custom:{...(p.custom||{start:homeBlock.start,end:homeBlock.end}),[field]:val}}));
            rows.push(<div key="custom" style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:8,opacity:already?0.55:1}}>
              <div style={{flex:1,minWidth:0,display:'flex',alignItems:'center',gap:6}}>
                <span style={{fontSize:13,fontWeight:500,color:T.text}}>{t('emp.customTime')}</span>
                <TimePicker small value={times.start} onChange={v=>setTime('start',v)}/>
                <span style={{fontSize:11,color:T.text3}}>–</span>
                <TimePicker small value={times.end} onChange={v=>setTime('end',v)}/>
              </div>
              <Btn small variant={already?'ghost':'secondary'} disabled={already} onClick={()=>addShiftForEmployee(dayName,homeBlock.id,role,shiftModalEmp,times.start,times.end)}>{already?t('emp.alreadyOnShift'):t('emp.addShiftBtn')}</Btn>
            </div>);
          }
          return rows;
        })()}
        {!shiftModalDaySel&&<div style={{fontSize:12,color:T.text3,padding:'10px 8px',fontStyle:'italic'}}>{t('emp.pickADay')}</div>}
      </div>
      <div style={{borderTop:`1px solid ${T.border}`,padding:12,flexShrink:0}}><Btn variant="ghost" onClick={closeShiftModal}>{t('common.done')}</Btn></div>
    </div>
  </div>
,document.body)}

{editingSlot&&schedule&&(()=>{
  const{day,blockId,idx}=editingSlot;
  const entry=schedule[day]?.[blockId]?.[idx];
  const block=blocks.find(b=>b.id===blockId);
  if(!entry||!block)return null;
  const emp=employees.find(e=>e.id===entry.empId);
  const empRoles=(emp?.roles||[]).length?emp.roles:allRoles;
  const customized=editTimes.start!==block.start||editTimes.end!==block.end;
  return createPortal(
    <div onClick={closeEditSlot} style={{position:'fixed',inset:0,zIndex:300,background:'rgba(20,16,13,0.5)',display:'flex',alignItems:'center',justifyContent:'center',padding:20,fontFamily:"'Hanken Grotesk',sans-serif"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,width:'min(380px,100%)',boxShadow:'0 24px 60px -16px rgba(0,0,0,0.5)'}}>
        <div style={{padding:'16px 18px 12px'}}>
          <div style={{fontSize:11,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>{t('week.editShift')}</div>
          <div style={{fontSize:15,fontWeight:600,color:T.text}}>{emp?.name||entry.name}</div>
          <div style={{fontSize:12,color:T.text3,marginTop:2}}>{block.name} · {t('day.'+day)}</div>
        </div>
        {/* Flag a shift the employee added themselves via the kiosk (no
            manager ever scheduled it) — informational only; any clock-in/out
            note is edited below, alongside the actual times it belongs to. */}
        {entry.selfAdded&&(
          <div style={{padding:'0 18px 12px'}}>
            <div style={{fontSize:11,color:T.accentText}}>{t('emp.selfAddedNotice')}</div>
          </div>
        )}
        {empRoles.length>1&&<div style={{padding:'0 18px 12px',display:'flex',gap:4,flexWrap:'wrap'}}>
          {empRoles.map(r=>{const rs=roleStyles[r]||DEFAULT_ROLE_STYLES.Other,active=editRole===r;return(<button key={r} onClick={()=>setEditRole(r)} style={{display:'inline-flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:999,fontSize:11,fontWeight:500,background:active?(isDark()?rs.dot+'22':rs.bg):'transparent',color:active?(isDark()?rs.dot:rs.text):T.text3,border:`1px solid ${active?(isDark()?rs.dot+'55':rs.border):T.border}`,cursor:'pointer',fontFamily:'inherit'}}><span style={{width:5,height:5,borderRadius:'50%',background:active?rs.dot:T.text3}}/>{r}</button>);})}
        </div>}
        <div style={{padding:'0 18px 16px',display:'flex',alignItems:'center',gap:6}}>
          <span style={{fontSize:11,color:T.text3}}>{t('emp.customTime')}</span>
          <TimePicker small value={editTimes.start} onChange={v=>setEditTimes(p=>({...p,start:v}))}/>
          <span style={{fontSize:11,color:T.text3}}>–</span>
          <TimePicker small value={editTimes.end} onChange={v=>setEditTimes(p=>({...p,end:v}))}/>
          {customized&&<button onClick={()=>setEditTimes({start:block.start,end:block.end})} style={{fontSize:10,color:T.accent,background:'none',border:'none',cursor:'pointer',textDecoration:'underline',fontFamily:'inherit'}}>{t('common.reset')}</button>}
        </div>
        {/* Only shown for a shift that's already happened (today or
            earlier) — a future shift has nothing to record yet, and
            actualAssignmentHours already falls back to the scheduled time
            whenever this is left alone. */}
        {dateToISO(weekDates[DAYS.indexOf(day)])<=todayISO() && (
          <div style={{padding:'0 18px 16px',borderTop:`1px solid ${T.border}`,paddingTop:14}}>
            <div style={{fontSize:11,color:T.text3,marginBottom:8}}>{t('emp.actualHours')}</div>
            <div style={{display:'flex',gap:4,marginBottom:editActual.mode==='adjusted'?10:0,flexWrap:'wrap'}}>
              {[['scheduled',t('emp.actualAsScheduled')],['adjusted',t('emp.actualAdjust')],['noshow',t('emp.actualNoShow')]].map(([mode,label])=>{
                const active=editActual.mode===mode,isDanger=mode==='noshow';
                return (
                  <button key={mode} onClick={()=>setEditActual(p=>({mode,start:p.start||editTimes.start,end:p.end||editTimes.end}))} style={{padding:'4px 10px',borderRadius:999,fontSize:11,fontWeight:500,cursor:'pointer',fontFamily:'inherit',background:active?(isDanger?T.dangerLight:T.accentLight):'transparent',color:active?(isDanger?T.danger:T.accent):T.text3,border:`1px solid ${active?(isDanger?T.danger+'55':T.accent+'55'):T.border}`}}>{label}</button>
                );
              })}
            </div>
            {editActual.mode==='adjusted'&&(<>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10}}>
                <TimePicker small value={editActual.start} onChange={v=>setEditActual(p=>({...p,start:v}))}/>
                <span style={{fontSize:11,color:T.text3}}>–</span>
                <TimePicker small value={editActual.end} onChange={v=>setEditActual(p=>({...p,end:v}))}/>
              </div>
              {/* Editable copies of whatever the punch clock/kiosk recorded —
                  a manager can correct or clear either note here, not just
                  view them; empty clears it on save (see saveEditSlot). */}
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                <div>
                  <div style={{fontSize:10,color:T.text3,marginBottom:3}}>{t('clock.inNoteLabel')}</div>
                  <input value={editNotes.inNote} onChange={e=>setEditNotes(p=>({...p,inNote:e.target.value}))} placeholder={t('clock.notePlaceholder')} style={s.input}/>
                </div>
                <div>
                  <div style={{fontSize:10,color:T.text3,marginBottom:3}}>{t('clock.outNoteLabel')}</div>
                  <input value={editNotes.outNote} onChange={e=>setEditNotes(p=>({...p,outNote:e.target.value}))} placeholder={t('clock.notePlaceholder')} style={s.input}/>
                </div>
              </div>
            </>)}
          </div>
        )}
        <div style={{borderTop:`1px solid ${T.border}`,padding:12,display:'flex',flexWrap:'wrap',gap:6}}>
          <Btn small onClick={saveEditSlot}>{t('common.save')}</Btn>
          <Btn small variant="secondary" onClick={moveEditSlot}>{t('week.move')}</Btn>
          <Btn small variant="danger" onClick={removeEditSlot}>{t('common.remove')}</Btn>
          <span style={{flex:1}}/>
          <Btn small variant="ghost" onClick={closeEditSlot}>{t('common.cancel')}</Btn>
        </div>
      </div>
    </div>
  ,document.body);
})()}

{/* SCHEDULE */}
{view==='schedule'&&(<div>
  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:20,flexWrap:'wrap',position:'sticky',top:56,zIndex:20,background:T.bg,backgroundImage:isDark()?'radial-gradient(circle at 12% 6%, rgba(217,122,74,0.07), transparent 38%), radial-gradient(circle at 88% 94%, rgba(95,174,122,0.06), transparent 42%)':'radial-gradient(circle at 12% 6%, rgba(191,90,44,0.045), transparent 38%), radial-gradient(circle at 88% 94%, rgba(61,122,82,0.04), transparent 42%)',backgroundAttachment:'fixed',paddingTop:8,marginTop:-8,paddingBottom:8}}>
    <div style={{display:'flex',alignItems:'center',gap:4,background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:3}}>
      <button onClick={()=>{if(calMode==='month'){setDisplayMonth(p=>p.m===0?{y:p.y-1,m:11}:{y:p.y,m:p.m-1});}else if(calMode==='week'&&dayFilter){shiftDay(-1);}else{setWeekOffset(w=>w-1);}}} style={{padding:'4px 10px',borderRadius:6,background:'none',border:'none',cursor:'pointer',color:T.text2,fontFamily:'inherit',fontSize:13}}>‹</button>
      <WeekPicker
        value={calMode==='month'?new Date(displayMonth.y,displayMonth.m,1):weekDates[0]}
        highlightStart={calMode==='month'?null:(calMode==='week'&&dayFilter?weekDates[DAYS.indexOf(dayFilter)]:weekDates[0])}
        highlightEnd={calMode==='month'?null:(calMode==='week'&&dayFilter?weekDates[DAYS.indexOf(dayFilter)]:weekDates[6])}
        onPick={d=>{
          if(calMode==='month'){ setDisplayMonth({y:d.getFullYear(),m:d.getMonth()}); return; }
          setWeekOffset(weekOffsetFromDate(d));
          if(calMode==='week'&&dayFilter){ const dow=d.getDay(); setDayFilter(DAYS[dow===0?6:dow-1]); }
        }}
        trigger={<span style={{fontSize:13,fontWeight:500,minWidth:150,textAlign:'center',color:T.text,padding:'0 4px',display:'inline-block'}}>{calMode==='month'?new Date(displayMonth.y,displayMonth.m,1).toLocaleDateString('en-GB',{month:'long',year:'numeric'}):calMode==='week'&&dayFilter?`${t('day.'+dayFilter)} ${fmt(weekDates[DAYS.indexOf(dayFilter)])}`:`${fmt(weekDates[0])} – ${fmt(weekDates[6])}`}</span>}
      />
      <button onClick={()=>{if(calMode==='month'){setDisplayMonth(p=>p.m===11?{y:p.y+1,m:0}:{y:p.y,m:p.m+1});}else if(calMode==='week'&&dayFilter){shiftDay(1);}else{setWeekOffset(w=>w+1);}}} style={{padding:'4px 10px',borderRadius:6,background:'none',border:'none',cursor:'pointer',color:T.text2,fontFamily:'inherit',fontSize:13}}>›</button>
    </div>
    <button onClick={()=>{setWeekOffset(0);const n=new Date();setDisplayMonth({y:n.getFullYear(),m:n.getMonth()});if(calMode==='week'&&dayFilter){const jsDay=n.getDay();setDayFilter(DAYS[jsDay===0?6:jsDay-1]);}}} style={{padding:'5px 12px',borderRadius:8,background:T.surface,border:`1px solid ${T.border}`,cursor:'pointer',fontSize:12,color:T.text2,fontFamily:'inherit'}}>{t('common.today')}</button>
    <div style={{display:'flex',background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:3,gap:2}}>
      {[['week',t('sched.week')],['month',t('sched.month')],['grid',t('sched.team')]].map(([k,l])=><button key={k} onClick={()=>{setDayFilter(null);setCalMode(k);}} style={{padding:'4px 12px',borderRadius:6,background:calMode===k?T.bg:'transparent',border:calMode===k?`1px solid ${T.border}`:'1px solid transparent',cursor:'pointer',fontSize:12,fontWeight:calMode===k?500:400,color:calMode===k?T.text:T.text2,fontFamily:'inherit'}}>{l}</button>)}
    </div>
    {calMode==='week'&&dayFilter&&(<button onClick={()=>setDayFilter(null)} style={{display:'flex',alignItems:'center',gap:6,padding:'4px 10px',borderRadius:999,background:T.accentLight,border:`1px solid ${T.accent}44`,color:T.accent,fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'inherit'}}>{t('week.showingDay',{day:t('day.'+dayFilter)})} ✕</button>)}
    {calMode==='week'&&dayFilter&&(()=>{const offDate=weekDates[DAYS.indexOf(dayFilter)],off=employees.filter(e=>isOnTimeOff(e.id,offDate,timeOff));if(!off.length)return null;return(
      <span title={off.map(e=>e.name).join(', ')} style={{display:'flex',alignItems:'center',gap:6,padding:'4px 10px',borderRadius:999,background:T.warningLight,border:`1px solid ${T.warning}44`,color:T.warning,fontSize:12,fontWeight:500}}>{t('week.offToday',{n:off.length})}</span>
    );})()}
    {calMode==='week'&&schedule&&(<div style={{marginLeft:'auto',display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
      <span style={{fontSize:12,color:T.text2}}>{stats?.filled||0} slots</span>
      {stats?.missing>0&&<span style={{fontSize:12,color:T.danger,fontWeight:500,background:T.dangerLight,padding:'2px 10px',borderRadius:999,border:`1px solid ${T.danger}33`}}>{stats.missing} missing</span>}
      {stats?.missing===0&&<span style={{fontSize:12,color:T.success,fontWeight:500,background:T.successLight,padding:'2px 10px',borderRadius:999,border:`1px solid ${T.success}33`}}>{t('sched.fullCoverage')} ✓</span>}
      <div style={{width:1,height:16,background:T.border}}/>
      {confirmed?<span style={{fontSize:12,color:T.success,fontWeight:500,background:T.successLight,padding:'2px 10px',borderRadius:999,border:`1px solid ${T.success}33`}}>✓ {t('sched.confirmed')}</span>:<span style={{fontSize:12,color:T.text3,background:T.surfaceWarm,padding:'2px 10px',borderRadius:999,border:`1px solid ${T.border}`}}>{t('sched.draft')}</span>}
      {confirmed?<Btn small variant="ghost" onClick={unconfirmSchedule}>{t('sched.unconfirm')}</Btn>:<Btn small variant="success" onClick={confirmSchedule}>{t('sched.confirm')}</Btn>}
      <Btn small variant="ghost" onClick={printSchedule}>{t('sched.print')}</Btn>
      <Btn small variant="danger" onClick={deleteSchedule}>{t('common.delete')}</Btn>
    </div>)}
  </div>
  {offThisWeek.length>0&&calMode!=='month'&&(<div style={{background:T.warningLight,border:`1px solid ${T.warning}33`,borderRadius:10,padding:'10px 14px',marginBottom:16,display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}><span style={{fontSize:12,fontWeight:500,color:T.warning}}>{t('sched.onLeaveWeek')}</span><div style={{display:'flex',gap:5,flexWrap:'wrap'}}>{offThisWeek.map(e=><EmpChip key={e.id} emp={e}/>)}</div></div>)}
  {selected&&(<div style={{background:T.accentLight,border:`1px solid ${T.accent}44`,borderRadius:10,padding:'10px 14px',marginBottom:16,display:'flex',alignItems:'center',gap:10}}><span style={{fontSize:12,color:T.accentText}}><b>{selected.name}</b>{t('sched.swapHintTail')}</span><button onClick={()=>setSelected(null)} style={{marginLeft:'auto',padding:'4px 10px',borderRadius:6,background:'transparent',border:`1px solid ${T.accent}55`,color:T.accent,cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>{t('common.cancel')}</button></div>)}
  {confirmed&&calMode!=='month'&&(<div style={{background:T.successLight,border:`1px solid ${T.success}44`,borderRadius:10,padding:'10px 16px',marginBottom:16,display:'flex',alignItems:'center',gap:10}}><span style={{fontSize:12,fontWeight:700,color:T.success}}>✓</span><span style={{flex:1,fontSize:12,fontWeight:600,color:T.success}}>{t('sched.confirmedBanner')}.</span><Btn small variant="ghost" onClick={unconfirmSchedule}>{t('sched.unconfirm')}</Btn></div>)}
  {notes&&<div style={{fontSize:12,color:T.text2,background:T.surfaceWarm,border:`1px solid ${T.border}`,borderRadius:10,padding:'10px 14px',marginBottom:16,display:'flex',gap:8}}><span>{notes}</span></div>}
  {warnings.filter(w=>w.startsWith('!')).map((w,i)=><div key={i} style={{fontSize:12,color:T.danger,background:T.dangerLight,border:`1px solid ${T.danger}33`,borderRadius:10,padding:'8px 14px',marginBottom:8}}>{w}</div>)}

{/* MONTH VIEW */}
{calMode==='month'&&(
  <MonthView
    monthOff={monthOff} schedules={schedules} weekOffset={weekOffset} setWeekOffset={setWeekOffset} setCalMode={setCalMode} displayMonth={displayMonth}
    blocks={blocks} allRoles={allRoles} employees={employees} timeOff={timeOff} generate={generate} deleteMonth={deleteMonth}
    s={s} t={t}
  />
)}

{/* GRID VIEW — Planday-style: employees as rows, days as columns */}
{calMode==='grid'&&(
  <TeamView
    schedule={schedule} employees={employees} blocks={blocks} roleStyles={roleStyles} weekDates={weekDates} weekOffset={weekOffset} timeOff={timeOff} allRoles={allRoles}
    gridGroupBy={gridGroupBy} setGridGroupBy={setGridGroupBy} gridTight={gridTight} setGridTight={setGridTight} gridSearch={gridSearch} setGridSearch={setGridSearch}
    empHours={empHours} assignmentHours={assignmentHours} actualAssignmentHours={actualAssignmentHours} openEditSlot={openEditSlot} openShiftModalFor={openShiftModalFor}
    generate={generate} generateMonth={generateMonth} offThisWeek={offThisWeek} isMobile={isMobile} reorderRoles={reorderRoles}
    onIsolateDay={day=>{setDayFilter(day);setCalMode('week');}}
    s={s} t={t}
  />
)}

{/* WEEK VIEW */}
{calMode==='week'&&(
  <WeekView
    schedule={schedule} blocks={blocks} employees={employees} offThisWeek={offThisWeek} generate={generate} generateMonth={generateMonth}
    dayFilter={dayFilter} setDayFilter={setDayFilter} selected={selected} setSelected={setSelected} dayGroupBy={dayGroupBy} setDayGroupBy={setDayGroupBy}
    roleStyles={roleStyles} isMobile={isMobile} ganttPreview={ganttPreview} ganttJustDraggedRef={ganttJustDraggedRef} openEditSlot={openEditSlot}
    beginGanttDrag={beginGanttDrag} minToHHMM={minToHHMM} collapsedBlocks={collapsedBlocks} setCollapsedBlocks={setCollapsedBlocks} warnings={warnings}
    weekDates={weekDates} handleSlotClick={handleSlotClick} openPicker={openPicker} pickerRoleFilter={pickerRoleFilter} setPickerRoleFilter={setPickerRoleFilter}
    pickerSortBy={pickerSortBy} setPickerSortBy={setPickerSortBy} pickerSearch={pickerSearch} setPickerSearch={setPickerSearch} candidatesForSlot={candidatesForSlot}
    addToSlot={addToSlot} closePicker={closePicker} empHours={empHours} allRoles={allRoles} handleEmptySlotClick={handleEmptySlotClick} openPickerFor={openPickerFor}
    removeFromSlot={removeFromSlot} gridGroupBy={gridGroupBy} setGridGroupBy={setGridGroupBy}
    s={s} t={t}
  />
)}
</div>)}

{/* EMPLOYEES */}
{view==='employees'&&(
  <EmployeesView
    employees={employees} allRoles={allRoles} roleStyles={roleStyles}
    expandedEmp={expandedEmp} setExpandedEmp={setExpandedEmp}
    updateEmp={updateEmp} updateAvail={updateAvail} toggleDay={toggleDay} applyTemplate={applyTemplate} duplicateEmp={duplicateEmp} removeEmp={removeEmp}
    showAddEmp={showAddEmp} setShowAddEmp={setShowAddEmp} newEmp={newEmp} setNewEmp={setNewEmp} addEmployee={addEmployee}
    onAddShift={openShiftModalFor}
    onOpenCompose={openCompose}
    onOpenKiosk={openKiosk}
    myId={myId}
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
    pendingSwaps={pendingSwaps} blocks={blocks} approveSwap={approveSwap} declineSwapManager={declineSwapManager}
    s={s} t={t}
  />
)}

{/* COVERAGE */}
{view==='coverage'&&(
  <CoverageView
    allRoles={allRoles} roleStyles={roleStyles} setRoleStyles={setRoleStyles}
    editingRole={editingRole} setEditingRole={setEditingRole} confirmDelete={confirmDelete} setConfirmDelete={setConfirmDelete}
    setEmployees={setEmployees} blocks={blocks} setBlocks={setBlocks}
    templates={templates} saveCurrentAsTemplate={saveCurrentAsTemplate} applyTemplateBlocks={applyTemplateBlocks} deleteTemplateById={deleteTemplateById}
    s={s} t={t}
  />
)}

{/* COSTS */}
{view==='costs'&&(
  <CostsView
    costsMode={costsMode} setCostsMode={setCostsMode} costsWeekOffset={costsWeekOffset} setCostsWeekOffset={setCostsWeekOffset} displayMonth={displayMonth} schedules={schedules} schedule={costsSchedule} weekDates={costsWeekDates}
    hourlyRate={hourlyRate} setHourlyRate={setHourlyRate}
    monthCostData={monthCostData} costData={costData} totalMonthCostUnits={totalMonthCostUnits} totalCostUnits={totalCostUnits} maxMonthCostUnits={maxMonthCostUnits} maxCostUnits={maxCostUnits} monthRoleCosts={monthRoleCosts} weekRoleCosts={weekRoleCosts}
    toMoney={toMoney} toMoneyRaw={toMoneyRaw} hasWages={hasWages} employees={employees} timeOff={timeOff} roleStyles={roleStyles} setView={setView} orgName={orgName}
    revenue={revenue} onSaveRevenue={saveRevenueForDate} dailyLaborCostByDate={dailyLaborCostByDate} monthRevenueTotal={monthRevenueTotal}
    s={s} t={t}
  />
)}

{/* PROFILE */}
{view==='profile'&&(
  <ProfileSettings role={role} myEmp={me} myEmail={myEmail} onGoToEmployees={()=>setView('employees')} onSaveName={saveMyName} onSaveColor={saveMyColor} onSavePhone={saveMyPhone} onSaveAvailability={saveMyAvailability} onSaveEmailNotifications={saveMyEmailNotifications} weekHours={empHoursMap[myId]||0} weekCorrected={empCorrectedMap[myId]||0} monthHours={myMonthHours} monthCorrected={myMonthCorrected} s={s} t={t}/>
)}

      </div>
    </div>
    {composeModal && createPortal(
      // Excludes the sender's own employees row (if the manager happens to
      // be linked to one) — messaging yourself isn't a real use case, and
      // it would otherwise show up under "Everyone"/"By role" too.
      <ComposeMessageModal employees={employees.filter(e=>e.id!==myId)} allRoles={allRoles} roleStyles={roleStyles} presetEmpIds={composeModal.presetEmpIds} busy={composeBusy} onCancel={()=>setComposeModal(null)} onSubmit={submitCompose} s={s} t={t}/>,
      document.body
    )}
    {openManagerThread && createPortal(
      <MessageThreadModal message={openManagerThread} viewerIsManager={true} myLabel={senderLabel} counterpartLabel={employees.find(e=>e.id===openManagerThread.recipientEmpId)?.name||''} onClose={()=>setOpenManagerThread(null)} s={s} t={t}/>,
      document.body
    )}
    </>
  );
}

// ─── Outer App — auth gate ────────────────────────────────────────────────────
export default function App(){
  const [theme,setThemeRaw]=useState(()=>load('sa2_theme','light'));
  Object.assign(T,THEMES[theme]||THEMES.light);
  Object.assign(styles,computeStyles());
  const toggleTheme=()=>{const next=theme==='dark'?'light':'dark';setThemeRaw(next);save('sa2_theme',next);};

  // Rendered above every screen below (Auth, RestaurantPicker, loading,
  // Dashboard, EmployeeView alike) rather than inside any one of them, so it
  // shows up no matter where someone is when their connection drops. Only
  // reflects the browser's own connectivity signal — it doesn't mean the
  // Supabase calls themselves are failing (a captive portal or a server
  // outage wouldn't flip this), just that the device itself has no network.
  const [isOffline,setIsOffline]=useState(()=>typeof navigator!=='undefined'&&!navigator.onLine);
  useEffect(()=>{
    const goOnline=()=>setIsOffline(false);
    const goOffline=()=>setIsOffline(true);
    window.addEventListener('online',goOnline);
    window.addEventListener('offline',goOffline);
    return()=>{window.removeEventListener('online',goOnline);window.removeEventListener('offline',goOffline);};
  },[]);
  // App() itself doesn't otherwise track a language (each screen below picks
  // its own independently) — this banner needs one anyway, so it reads the
  // same stored preference they all do.
  const bannerT=makeT(load('sa2_lang',detectLang()));

  const [session,setSession]    =useState(undefined);
  const [orgs,setOrgs]          =useState(undefined);
  const [orgTick,setOrgTick]    =useState(0);
  const [activeOrg,setActiveOrg]=useState(null); // always starts null — user picks on login

  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{
      setSession(data.session);
      // Accept any pending invitations when user logs in. The orgs list is
      // fetched by a separate effect keyed on [session, orgTick] — setSession
      // above fires that fetch immediately, racing ahead of this async call,
      // so without bumping orgTick afterward here too (like the
      // onAuthStateChange branch below already does), a newly-accepted
      // invite would silently never show up: the org list is fetched once
      // too early (before acceptance lands) and nothing ever triggers it to
      // refetch. This is exactly the path taken on a normal page load with
      // an already-established session (e.g. right after signing up/logging
      // in), which is the common case for someone accepting an invite.
      if(data.session) acceptPendingInvitations().then(()=>setOrgTick(t=>t+1)).catch(err=>{console.error(err);alert(err.message||'Failed to accept a pending team invitation. Please refresh and try again.');});
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

  // Kiosk mode is just a URL flag (?kiosk=1) — see KioskView.jsx and the
  // isManager branch below for why that's an adequate gate rather than a
  // second login system.
  const isKiosk = typeof window!=='undefined' && new URLSearchParams(window.location.search).get('kiosk')==='1';

  let content;
  if(session===undefined) content=<LoadingScreen/>;
  else if(!session) content=<Auth/>;
  else if(orgs===undefined) content=<LoadingScreen/>;
  // Show restaurant picker if no active org selected or user has no orgs yet
  else if(!activeOrg||!orgs.find(o=>o.id===activeOrg)){
    content=<RestaurantPicker
      orgs={orgs}
      onSelect={id=>switchOrg(id)}
      onCreated={async id=>{await reloadOrgs();switchOrg(id);}}
      theme={theme}
      toggleTheme={toggleTheme}
    />;
  } else {
    const active=orgs.find(o=>o.id===activeOrg);
    if(!active){
      content=<LoadingScreen/>;
    } else {
      // A missing/unrecognized role must NOT grant manager access — default
      // to least privilege (employee view) rather than silently trusting a
      // blank role, which is what let invited members land in the manager
      // dashboard whenever their membership role failed to come through as
      // expected.
      const isManager=(active.role==='owner'||active.role==='manager');
      const isOwner=(active.role==='owner');
      // Kiosk mode (?kiosk=1) is a separate, shared-device screen for
      // clocking in/out — see KioskView.jsx. It only ever activates for a
      // manager/owner login (that login IS the access gate for reaching
      // kiosk mode at all); a plain employee login ignores the flag and
      // always gets the normal EmployeeView regardless.
      content=!isManager
        ? <EmployeeView orgId={active.id} key={active.id} orgName={active.name} role={active.role||'employee'} theme={theme} toggleTheme={toggleTheme} onBack={()=>setActiveOrg(null)}/>
        : isKiosk
        ? <KioskView orgId={active.id} key={active.id+'-kiosk'} orgName={active.name} theme={theme} toggleTheme={toggleTheme} onExitKiosk={()=>{ const url=new URL(window.location.href); url.searchParams.delete('kiosk'); window.location.href=url.toString(); }}/>
        : <Dashboard orgId={active.id} key={active.id} orgName={active.name} isOwner={isOwner} role={active.role} theme={theme} toggleTheme={toggleTheme} onBack={()=>setActiveOrg(null)}/>;
    }
  }

  return(
    <>
      {isOffline && (
        <div style={{position:'fixed',top:0,left:0,right:0,zIndex:500,background:T.warningLight,color:T.warning,fontSize:12,fontWeight:600,textAlign:'center',padding:'6px 12px',fontFamily:"'Hanken Grotesk',sans-serif"}}>
          {bannerT('offline.banner')}
        </div>
      )}
      {content}
    </>
  );
}
