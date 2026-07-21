import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { T, styles, DAYS, pal, initials, isDark, ROLE_COLOR_PALETTE, MEMBERSHIP_ROLE_COLORS } from '../lib/constants';
import { getWeekDates, weekKey, weekKeyToMonday, fmt, dateToISO, todayISO, getMonthOffsets, toMin, weekOffsetFromDate, setLocale } from '../lib/dates';
import { assignmentHours, isOnTimeOff } from '../lib/schedule';
import { fetchEmployees, fetchBlocks, fetchSchedules, fetchTimeOff, fetchShiftSwaps, createShiftSwap, updateShiftSwap, deleteShiftSwap, createNotification, updateEmployeeSelfProfile, fetchRoleStyles } from '../lib/data';
import { supabase } from '../lib/supabase';
import { LANGUAGES, makeT, detectLang, LOCALES } from '../i18n';
import { load, save, migrateEmployee } from '../lib/storage';
import { mergeRoleOrder, reorderRoleList } from '../lib/roles';
import NotificationBell from './NotificationBell';
import ProfileSettings from './ProfileSettings';
import MonthView from './views/MonthView';
import { Btn, RoleBadge, GripDots, WeekPicker } from './ui';

function LoadingScreen(){
  return <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:T.bg,color:T.text3,fontFamily:"'Hanken Grotesk',sans-serif",fontSize:26}}><span style={{fontFamily:'Fraunces, Georgia, serif',opacity:0.5}}>Rorota</span></div>;
}

export default function EmployeeView({ orgId, orgName, role='employee', theme, toggleTheme }){
  const [loading, setLoading]     = useState(true);
  const [employees, setEmployees] = useState([]);
  const [blocks, setBlocks]       = useState([]);
  const [schedules, setSchedules] = useState({});
  const [timeOff, setTimeOff]     = useState([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [myId, setMyId]           = useState(null); // current user's employee record id
  const [lang, setLangRaw]        = useState(()=>load('sa2_lang', detectLang()));
  const setLang = v => { setLangRaw(v); save('sa2_lang', v); };
  const t = makeT(lang);
  // Keep date formatting (fmt/fmtLong) following the selected language —
  // was defaulting to en-GB regardless (see App.jsx for the manager-side
  // equivalent of this fix).
  useEffect(()=>{ setLocale(LOCALES[lang]||'en-GB'); },[lang]);
  const [isMobile,setIsMobile]    = useState(()=>typeof window!=='undefined'&&window.innerWidth<860);
  const [swaps, setSwaps]         = useState([]);       // all shift_swaps for this org, any week/status
  const [swapModal, setSwapModal] = useState(null);      // {day,blockId,blockName,role} while the give-away modal is open
  const [swapBusy, setSwapBusy]   = useState(false);
  const [view, setView]           = useState('schedule'); // 'schedule' | 'profile'
  const [calMode, setCalMode]     = useState('team');     // 'team' | 'week' | 'month' — which layout the schedule tab shows
  const [displayMonth, setDisplayMonth] = useState(()=>{const n=new Date();return {y:n.getFullYear(),m:n.getMonth()};});
  const [dayFilter, setDayFilter] = useState(()=>{const jsDay=new Date().getDay();return DAYS[jsDay===0?6:jsDay-1];}); // which day the read-only 'week' tab isolates
  const [gridGroupBy, setGridGroupBy] = useState('name'); // 'name' | 'role' — shared sort/group toggle for the Team and Week tabs
  // Personal, per-browser role display/group order — each person arranges
  // their own Team tab; not shared with the manager or other employees.
  const [roleOrder, setRoleOrder] = useState(()=>load('sa2_roleOrder_'+orgId, []));
  const [collapsedRoles, setCollapsedRoles] = useState(()=>new Set()); // role names currently collapsed in the Team tab's "By role" grouping
  const [dragRole, setDragRole] = useState(null); // drag-and-drop reordering of role groups in the Team tab
  const [dragOverRole, setDragOverRole] = useState(null);
  const [roleStyles, setRoleStyles] = useState({}); // the manager's actual role colours, read-only here — shared org-wide, unlike order above

  const reloadSwaps = () => { if(orgId) fetchShiftSwaps(orgId).then(setSwaps).catch(err=>console.error('Load swaps failed:',err)); };
  useEffect(()=>{
    reloadSwaps();
    const iv=setInterval(reloadSwaps,45000); // no realtime subscription yet — light polling instead
    return ()=>clearInterval(iv);
  },[orgId]);

  useEffect(()=>{
    const onResize=()=>setIsMobile(window.innerWidth<860);
    window.addEventListener('resize',onResize);
    return ()=>window.removeEventListener('resize',onResize);
  },[]);

  useEffect(()=>{
    let alive = true;
    // Get current user's email to match to employee record
    supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      const email = data?.user?.email;
      // Load all data
      Promise.all([
        fetchEmployees(orgId),
        fetchBlocks(orgId),
        fetchTimeOff(orgId),
        fetchSchedules(orgId),
        fetchRoleStyles(orgId).catch(err => { console.error('Load role colours failed:', err); return {}; }),
      ]).then(([emps, blks, to, scheds, rStyles]) => {
        if (!alive) return;
        // Same defaulting App.jsx applies to its own fetch — without it, an
        // employee record missing newer fields (targetHours, contractType,
        // etc.) would show as undefined here even though the manager's own
        // session already sees it defaulted.
        setEmployees(emps.map(migrateEmployee));
        setBlocks(blks);
        setTimeOff(to);
        setSchedules(scheds);
        setRoleStyles(rStyles || {});
        // Try to find the current user's employee record by email
        const me = emps.find(e => e.email && e.email.toLowerCase() === (email||'').toLowerCase());
        if (me) setMyId(me.id);
        setLoading(false);
      }).catch(err => { console.error(err); if(alive) setLoading(false); });
    });
    return () => { alive = false; };
  }, [orgId]);

  // Re-inject global styles when theme changes
  useEffect(()=>{
    const s = document.createElement('style');
    s.textContent = `html,body,#root{width:100%;margin:0;padding:0}*{box-sizing:border-box}body{background:${T.bg};-webkit-font-smoothing:antialiased}input,select{font-family:'Hanken Grotesk',sans-serif!important}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-thumb{background:${T.border};border-radius:3px}`;
    document.head.appendChild(s);
    document.body.style.background = T.bg;
    return () => { try{ document.head.removeChild(s); }catch{} };
  }, [theme]);

  if (loading) return <LoadingScreen/>;

  const weekDates  = getWeekDates(weekOffset);
  const wKey       = weekKey(weekOffset);
  const schedule   = schedules[wKey]?.schedule || null;
  const s          = styles;
  const monthOff   = getMonthOffsets(calMode==='month'?displayMonth:weekOffset);
  // Coverage math (dayCoverage, inside MonthView) needs the universe of role
  // names blocks actually require staffing for — roleStyles itself isn't
  // synced to employees' sessions, so fall back to whatever's configured on
  // blocks (plus any role an employee happens to be tagged with) rather than
  // a manager-only source of truth.
  const discoveredRoles = [...new Set([
    ...blocks.flatMap(b=>[...Object.keys(b.roles||{}), ...Object.values(b.overrides||{}).flatMap(o=>Object.keys(o||{}))]),
    ...employees.flatMap(e=>e.roles||[]),
  ])];
  // Display/group order: the manager's saved order (from Coverage), plus any
  // role that shows up here but isn't in that saved order yet, appended at
  // the end — same self-healing merge Dashboard uses for its own allRoles
  // (mergeRoleOrder, shared via lib/roles.js).
  const allRoles = mergeRoleOrder(roleOrder, discoveredRoles);
  // Team tab row order — mirrors the manager's TeamView grouping: sorted by
  // name, or bucketed by role (an employee with multiple roles appears once
  // per matching role, same as the manager side).
  const gridRows = gridGroupBy==='role'
    ? allRoles.filter(role=>employees.some(e=>(e.roles||[]).includes(role)))
        .flatMap(role=>[...employees].filter(e=>(e.roles||[]).includes(role)).sort((a,b)=>a.name.localeCompare(b.name)).map(emp=>({emp,role})))
    : [...employees].sort((a,b)=>a.name.localeCompare(b.name)).map(emp=>({emp,role:null}));
  const toggleRoleCollapse = (role) => setCollapsedRoles(prev=>{ const next=new Set(prev); if(next.has(role)) next.delete(role); else next.add(role); return next; });
  // roleStyles (the manager's real, Supabase-synced colours) covers most
  // roles, but a role can exist here before it's ever been styled in
  // Coverage (or the fetch simply hasn't resolved yet) — this hash-based
  // stand-in is the fallback for that gap only. Keyed by a hash of the
  // role's own name — NOT its position in allRoles — so dragging roles into
  // a new order doesn't shuffle an unstyled role's stand-in colour too.
  const hashRole = (role) => { let h=0; for(let i=0;i<role.length;i++) h=(h*31+role.charCodeAt(i))>>>0; return h; };
  const roleColorFor = (role) => ROLE_COLOR_PALETTE[hashRole(role)%ROLE_COLOR_PALETTE.length];
  // Drag a role group to reorder it relative to the others — personal to
  // this browser (see roleOrder's init above), not shared with anyone else.
  const reorderRoles = (draggedRole, targetRole) => {
    const next = reorderRoleList(allRoles, draggedRole, targetRole);
    if (next===allRoles) return;
    setRoleOrder(next);
    save('sa2_roleOrder_'+orgId, next);
  };

  const empHoursMap = employees.reduce((acc, e) => {
    if (!schedule) { acc[e.id] = 0; return acc; }
    let h = 0;
    DAYS.forEach(day => blocks.forEach(b => {
      const a=(schedule[day]?.[b.id]||[]).find(a => a.empId === e.id);
      if (a) h += assignmentHours(a,b);
    }));
    acc[e.id] = h; return acc;
  }, {});

  const me = employees.find(e=>e.id===myId);

  const saveMyName = (newName) => {
    updateEmployeeSelfProfile(myId, { name: newName })
      .then(()=>setEmployees(p=>p.map(e=>e.id===myId?{...e,name:newName}:e)))
      .catch(err=>alert(err.message||'Failed to save'));
  };
  const saveMyColor = (palIdx) => {
    updateEmployeeSelfProfile(myId, { palIdx })
      .then(()=>setEmployees(p=>p.map(e=>e.id===myId?{...e,palIdx}:e)))
      .catch(err=>alert(err.message||'Failed to save'));
  };

  const notify = (targetEmpId, messageKey, messageVars) =>
    createNotification(orgId, targetEmpId, { type: messageKey.replace('notif.',''), messageKey, messageVars })
      .catch(err=>console.error('Notify failed:',err));

  const openGiveAway = (day, blockId, blockName, role) => setSwapModal({ day, blockId, blockName, role });

  const submitGiveAway = async ({ toEmpId, note }) => {
    if (!swapModal || !myId) return;
    setSwapBusy(true);
    try{
      await createShiftSwap(orgId, { weekKey: wKey, day: swapModal.day, blockId: swapModal.blockId, role: swapModal.role, fromEmpId: myId, toEmpId: toEmpId||null, note });
      if (toEmpId) notify(toEmpId, 'notif.swapRequestReceived', { name: me?.name||'', role: swapModal.role, day: t('day.'+swapModal.day) });
      setSwapModal(null);
      reloadSwaps();
    }catch(err){ alert(err.message||'Failed to post request'); }
    finally{ setSwapBusy(false); }
  };

  // Covers both "claim an open-to-anyone release" and "accept a direct
  // request" — mechanically identical (I become the claimant, the original
  // requester is notified, a manager still has to approve before the real
  // schedule changes).
  const claimSwap = async (swap) => {
    setSwapBusy(true);
    try{
      await updateShiftSwap(swap.id, { status:'claimed', claimedByEmpId: myId });
      notify(swap.fromEmpId, 'notif.swapClaimed', { name: me?.name||'', role: swap.role, day: t('day.'+swap.day) });
      reloadSwaps();
    }catch(err){ alert(err.message||'Failed'); }
    finally{ setSwapBusy(false); }
  };

  const declineSwap = async (swap) => {
    setSwapBusy(true);
    try{
      await updateShiftSwap(swap.id, { status:'declined' });
      notify(swap.fromEmpId, 'notif.swapDeclined', { day: t('day.'+swap.day) });
      reloadSwaps();
    }catch(err){ alert(err.message||'Failed'); }
    finally{ setSwapBusy(false); }
  };

  const cancelSwap = async (swap) => {
    setSwapBusy(true);
    try{ await deleteShiftSwap(swap.id); reloadSwaps(); }
    catch(err){ alert(err.message||'Failed'); }
    finally{ setSwapBusy(false); }
  };

  // A swap references a week by its key, not the currently-viewed offset —
  // reconstruct the actual calendar date so we can check time-off and show
  // a real date, regardless of which week the viewer currently has open.
  const dateForSwap = (swap) => { const mon=weekKeyToMonday(swap.weekKey); const d=new Date(mon); d.setDate(mon.getDate()+DAYS.indexOf(swap.day)); return d; };

  const myOpenRequests  = myId ? swaps.filter(sw=>sw.fromEmpId===myId && (sw.status==='open'||sw.status==='claimed')) : [];
  const requestsForMe   = myId ? swaps.filter(sw=>sw.toEmpId===myId && sw.status==='open') : [];
  const openToAnyone    = myId && me ? swaps.filter(sw=>{
    if (sw.status!=='open' || sw.toEmpId || sw.fromEmpId===myId) return false;
    if (!(me.roles||[]).includes(sw.role)) return false;
    const d=dateForSwap(sw);
    if (isOnTimeOff(myId,d,timeOff)) return false;
    const sameWeekSched = schedules[sw.weekKey]?.schedule;
    if (sameWeekSched && (sameWeekSched[sw.day]?.[sw.blockId]||[]).some(a=>a.empId===myId)) return false; // already on that block
    return true;
  }) : [];

  return (<>
    <div style={{minHeight:'100vh',width:'100%',background:T.bg,backgroundImage:isDark()?'radial-gradient(circle at 12% 6%, rgba(217,122,74,0.07), transparent 38%), radial-gradient(circle at 88% 94%, rgba(95,174,122,0.06), transparent 42%)':'radial-gradient(circle at 12% 6%, rgba(191,90,44,0.045), transparent 38%), radial-gradient(circle at 88% 94%, rgba(61,122,82,0.04), transparent 42%)',backgroundAttachment:'fixed',fontFamily:"'Hanken Grotesk',sans-serif",color:T.text,fontSize:13}}>
      {/* Nav */}
      <div style={{background:T.surface,borderBottom:`1px solid ${T.border}`,padding:isMobile?'0 12px':'0 24px',display:'flex',alignItems:'center',gap:isMobile?6:0,height:56,position:'sticky',top:0,zIndex:100,boxShadow:'0 2px 14px -8px rgba(33,27,21,0.15)'}}>
        <div style={{display:'flex',alignItems:'baseline',gap:9,flex:1,minWidth:0,overflow:'hidden'}}>
          <span style={{fontFamily:'Fraunces, Georgia, serif',fontSize:isMobile?18:21,fontWeight:600,color:T.text,letterSpacing:'-0.02em',flexShrink:0}}>Rorota</span>
          <span style={{fontSize:11,color:T.text3,fontWeight:500,letterSpacing:'0.03em',textTransform:'uppercase',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{orgName}</span>
        </div>
        {!isMobile&&<span style={{fontSize:11,fontWeight:600,padding:'3px 10px',borderRadius:999,marginRight:8,background:(MEMBERSHIP_ROLE_COLORS[role]||MEMBERSHIP_ROLE_COLORS.employee).bg,color:(MEMBERSHIP_ROLE_COLORS[role]||MEMBERSHIP_ROLE_COLORS.employee).text,border:`1px solid ${(MEMBERSHIP_ROLE_COLORS[role]||MEMBERSHIP_ROLE_COLORS.employee).border}`,flexShrink:0}}>{t('team.role'+(role.charAt(0).toUpperCase()+role.slice(1)))}</span>}
        <div style={{display:'flex',alignItems:'center',gap:2,background:T.surfaceWarm,border:`1px solid ${T.border}`,borderRadius:8,padding:3,marginRight:isMobile?6:10,flexShrink:0}}>
          <button onClick={()=>setView('schedule')} style={{fontFamily:'inherit',padding:isMobile?'5px 8px':'5px 12px',borderRadius:6,border:'none',cursor:'pointer',fontSize:12,fontWeight:view==='schedule'?600:400,background:view==='schedule'?T.surface:'transparent',color:view==='schedule'?T.text:T.text2,whiteSpace:'nowrap'}}>{t('nav.schedule')}</button>
          <button onClick={()=>setView('profile')} style={{fontFamily:'inherit',padding:isMobile?'5px 8px':'5px 12px',borderRadius:6,border:'none',cursor:'pointer',fontSize:12,fontWeight:view==='profile'?600:400,background:view==='profile'?T.surface:'transparent',color:view==='profile'?T.text:T.text2,whiteSpace:'nowrap'}}>{t('nav.profile')}</button>
        </div>
        <select value={lang} onChange={e=>setLang(e.target.value)} style={{fontFamily:'inherit',fontSize:12,color:T.text2,background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:'6px 8px',marginRight:isMobile?0:8,cursor:'pointer',outline:'none',flexShrink:0}}>{LANGUAGES.map(L=><option key={L.code} value={L.code}>{isMobile?L.code.toUpperCase():L.label}</option>)}</select>
        <span style={{marginRight:isMobile?0:10}}><NotificationBell empId={myId} t={t} lang={lang} onNavigate={link=>{setView('schedule');setCalMode('team');if(link?.weekOffset!=null)setWeekOffset(link.weekOffset);}}/></span>
        <button onClick={toggleTheme} style={{width:34,height:34,marginRight:isMobile?0:10,borderRadius:8,border:`1px solid ${T.border}`,background:T.surface,color:T.text2,cursor:'pointer',fontSize:15,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{isDark()?'☀':'☾'}</button>
        <button onClick={()=>supabase.auth.signOut()} style={{padding:isMobile?'6px 10px':'6px 14px',borderRadius:8,border:`1px solid ${T.border}`,background:T.surface,color:T.text2,cursor:'pointer',fontSize:12,fontFamily:'inherit',flexShrink:0,whiteSpace:'nowrap'}}>{t('common.logout')}</button>
      </div>

      <div style={{padding:isMobile?'16px 12px':'24px 28px'}}>
      {view==='profile' ? (
        <ProfileSettings role={role} myEmp={me} onSaveName={saveMyName} onSaveColor={saveMyColor} s={s} t={t}/>
      ) : (<>
        {/* Week/Month nav */}
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:20,flexWrap:'wrap'}}>
          <div style={{display:'flex',alignItems:'center',gap:4,background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:3}}>
            <button onClick={()=>calMode==='month'?setDisplayMonth(p=>p.m===0?{y:p.y-1,m:11}:{y:p.y,m:p.m-1}):setWeekOffset(w=>w-1)} style={{padding:'4px 12px',borderRadius:6,background:'none',border:'none',cursor:'pointer',color:T.text2,fontFamily:'inherit',fontSize:14}}>‹</button>
            <WeekPicker
              value={calMode==='month'?new Date(displayMonth.y,displayMonth.m,1):weekDates[0]}
              highlightStart={calMode==='month'?null:weekDates[0]}
              highlightEnd={calMode==='month'?null:weekDates[6]}
              onPick={d=>{
                if(calMode==='month'){ setDisplayMonth({y:d.getFullYear(),m:d.getMonth()}); return; }
                setWeekOffset(weekOffsetFromDate(d));
              }}
              trigger={<span style={{fontSize:14,fontWeight:500,minWidth:isMobile?130:160,textAlign:'center',color:T.text,padding:'0 4px',display:'inline-block'}}>{calMode==='month'?new Date(displayMonth.y,displayMonth.m,1).toLocaleDateString('en-GB',{month:'long',year:'numeric'}):`${fmt(weekDates[0])} – ${fmt(weekDates[6])}`}</span>}
            />
            <button onClick={()=>calMode==='month'?setDisplayMonth(p=>p.m===11?{y:p.y+1,m:0}:{y:p.y,m:p.m+1}):setWeekOffset(w=>w+1)} style={{padding:'4px 12px',borderRadius:6,background:'none',border:'none',cursor:'pointer',color:T.text2,fontFamily:'inherit',fontSize:14}}>›</button>
          </div>
          <button onClick={()=>{setWeekOffset(0);const n=new Date();setDisplayMonth({y:n.getFullYear(),m:n.getMonth()});}} style={{padding:'5px 12px',borderRadius:8,background:T.surface,border:`1px solid ${T.border}`,cursor:'pointer',fontSize:12,color:T.text2,fontFamily:'inherit'}}>{t('common.today')}</button>
          {calMode!=='month'&&schedules[wKey]?.confirmed && <span style={{fontSize:12,color:T.success,fontWeight:500,background:T.successLight,padding:'2px 10px',borderRadius:999,border:`1px solid ${T.success}33`}}>✓ {t('emp.published')}</span>}
          <div style={{display:'flex',alignItems:'center',gap:2,background:T.surfaceWarm,border:`1px solid ${T.border}`,borderRadius:8,padding:3,marginLeft:'auto'}}>
            {[['team',t('sched.team')],['week',t('sched.week')],['month',t('sched.month')]].map(([k,l])=><button key={k} onClick={()=>setCalMode(k)} style={{fontFamily:'inherit',padding:'4px 12px',borderRadius:6,background:calMode===k?T.bg:'transparent',border:calMode===k?`1px solid ${T.border}`:'1px solid transparent',cursor:'pointer',fontSize:12,fontWeight:calMode===k?500:400,color:calMode===k?T.text:T.text2}}>{l}</button>)}
          </div>
        </div>

        {calMode==='month' ? (
          <MonthView monthOff={monthOff} schedules={schedules} weekOffset={weekOffset} setWeekOffset={setWeekOffset} setCalMode={setCalMode} displayMonth={displayMonth} blocks={blocks} allRoles={allRoles} employees={employees} timeOff={timeOff} generate={()=>{}} deleteMonth={()=>{}} readOnly s={s} t={t}/>
        ) : calMode==='week' ? (
          <DayTimeline schedule={schedule} blocks={blocks} employees={employees} allRoles={allRoles} dayFilter={dayFilter} setDayFilter={setDayFilter} weekDates={weekDates} myId={myId} isMobile={isMobile} gridGroupBy={gridGroupBy} setGridGroupBy={setGridGroupBy} s={s} t={t}/>
        ) : (<>

        {myId && (requestsForMe.length>0 || openToAnyone.length>0 || myOpenRequests.length>0) && (
          <div style={{...s.card,marginBottom:16,display:'flex',flexDirection:'column',gap:14}}>
            {requestsForMe.length>0 && (<div>
              <div style={{fontSize:11,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>{t('swap.requestsForYou')}</div>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {requestsForMe.map(sw=>{const from=employees.find(e=>e.id===sw.fromEmpId);return(
                  <div key={sw.id} style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',padding:'8px 10px',borderRadius:8,background:T.accentLight,border:`1px solid ${T.accent}33`}}>
                    <span style={{fontSize:12,color:T.text,flex:1,minWidth:160}}>{t('swap.by',{name:from?.name||'?'})} · {sw.role} · {t('day.'+sw.day)}</span>
                    <Btn small onClick={()=>claimSwap(sw)} disabled={swapBusy}>{t('swap.accept')}</Btn>
                    <Btn small variant="ghost" onClick={()=>declineSwap(sw)} disabled={swapBusy}>{t('swap.decline')}</Btn>
                  </div>
                );})}
              </div>
            </div>)}
            {openToAnyone.length>0 && (<div>
              <div style={{fontSize:11,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>{t('swap.availableToYou')}</div>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {openToAnyone.map(sw=>{const from=employees.find(e=>e.id===sw.fromEmpId);return(
                  <div key={sw.id} style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',padding:'8px 10px',borderRadius:8,background:T.surfaceWarm,border:`1px solid ${T.border}`}}>
                    <span style={{fontSize:12,color:T.text,flex:1,minWidth:160}}>{t('swap.by',{name:from?.name||'?'})} · {sw.role} · {t('day.'+sw.day)}</span>
                    <Btn small onClick={()=>claimSwap(sw)} disabled={swapBusy}>{t('swap.take')}</Btn>
                  </div>
                );})}
              </div>
            </div>)}
            {myOpenRequests.length>0 && (<div>
              <div style={{fontSize:11,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>{t('swap.myRequests')}</div>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {myOpenRequests.map(sw=>{const to=sw.toEmpId?employees.find(e=>e.id===sw.toEmpId):null,claimant=sw.claimedByEmpId?employees.find(e=>e.id===sw.claimedByEmpId):null;return(
                  <div key={sw.id} style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',padding:'8px 10px',borderRadius:8,background:T.surfaceWarm,border:`1px solid ${T.border}`}}>
                    <span style={{fontSize:12,color:T.text,flex:1,minWidth:160}}>{sw.role} · {t('day.'+sw.day)} · {to?t('swap.requestedTo',{name:to.name}):t('swap.openToAnyone')}</span>
                    <span style={{fontSize:11,color:sw.status==='claimed'?T.success:T.text3}}>{sw.status==='claimed'?t('swap.statusClaimed',{name:claimant?.name||'?'}):t('swap.statusOpen')}</span>
                    {sw.status==='open' && <Btn small variant="danger" onClick={()=>cancelSwap(sw)} disabled={swapBusy}>{t('swap.cancel')}</Btn>}
                  </div>
                );})}
              </div>
            </div>)}
          </div>
        )}

        <div style={{display:'flex',justifyContent:'flex-end',marginBottom:10}}>
          <div style={{display:'flex',background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:3,gap:2}}>
            {[['name',t('grid.byName')],['role',t('grid.byRole')]].map(([k,l])=><button key={k} onClick={()=>setGridGroupBy(k)} style={{padding:'4px 12px',borderRadius:6,background:gridGroupBy===k?T.bg:'transparent',border:gridGroupBy===k?`1px solid ${T.border}`:'1px solid transparent',cursor:'pointer',fontSize:12,fontWeight:gridGroupBy===k?500:400,color:gridGroupBy===k?T.text:T.text2,fontFamily:'inherit'}}>{l}</button>)}
          </div>
        </div>

        {!schedule ? (
          <div style={{...s.card,textAlign:'center',padding:'52px 32px',position:'relative',overflow:'hidden'}}>
            <div style={{position:'absolute',inset:0,backgroundImage:`radial-gradient(circle, ${T.border} 1px, transparent 1px)`,backgroundSize:'24px 24px',opacity:0.5,pointerEvents:'none'}}/>
            <div style={{position:'relative'}}>
              <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:22,fontWeight:500,color:T.text,marginBottom:8}}>{t('emp.noScheduleTitle')}</div>
              <div style={{fontSize:13,color:T.text2}}>{t('emp.noScheduleDesc')}</div>
            </div>
          </div>
        ) : (
          <div style={{...s.cardFlush,overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
            {/* Header */}
            <div style={{display:'grid',gridTemplateColumns:`${isMobile?130:180}px repeat(7,1fr)`,minWidth:isMobile?550:700,borderBottom:`2px solid ${T.border}`,background:T.surfaceWarm}}>
              <div style={{padding:isMobile?'12px 12px':'14px 20px',fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.08em',borderRight:`1px solid ${T.border}`}}>{t('sched.team')}</div>
              {DAYS.map((day,i)=>{
                const date=weekDates[i],isToday=dateToISO(date)===dateToISO(new Date());
                return(<div key={day} style={{padding:isMobile?'12px 6px':'14px 12px',textAlign:'center',borderRight:i<6?`1px solid ${T.border}`:'none'}}>
                  <div style={{fontSize:13,fontWeight:600,color:isToday?T.accent:T.text}}>{t('day.'+day)}</div>
                  <div style={{fontSize:11,color:isToday?T.accent:T.text3,marginTop:1}}>{date.getDate()} {date.toLocaleDateString('en-GB',{month:'short'})}</div>
                </div>);
              })}
            </div>
            {/* Employee rows */}
            {gridRows.map((row,ri)=>{
              const emp=row.emp,p=pal(emp),isMe=emp.id===myId,h=empHoursMap[emp.id]||0;
              const prevRole=ri>0?gridRows[ri-1].role:undefined;
              const showDivider=gridGroupBy==='role'&&row.role!==prevRole;
              const roleCollapsed=gridGroupBy==='role'&&row.role&&collapsedRoles.has(row.role);
              return(
                <div key={`${row.role||'all'}-${emp.id}`}>
                {showDivider&&<div
                  onClick={()=>toggleRoleCollapse(row.role)}
                  draggable
                  onDragStart={()=>setDragRole(row.role)}
                  onDragEnd={()=>{setDragRole(null);setDragOverRole(null);}}
                  onDragOver={e=>{if(dragRole&&dragRole!==row.role){e.preventDefault();if(dragOverRole!==row.role)setDragOverRole(row.role);}}}
                  onDragLeave={()=>{if(dragOverRole===row.role)setDragOverRole(null);}}
                  onDrop={e=>{e.preventDefault();reorderRoles(dragRole,row.role);setDragRole(null);setDragOverRole(null);}}
                  style={{padding:'6px '+(isMobile?'12px':'20px'),background:T.surfaceWarm,borderBottom:`1px solid ${T.border}`,borderTop:dragOverRole===row.role?`2px solid ${T.accent}`:ri>0?`2px solid ${T.border}`:'none',cursor:'grab',userSelect:'none',display:'flex',alignItems:'center',gap:8,opacity:dragRole===row.role?0.5:1,transition:'opacity 0.15s,border-color 0.15s'}}>
                  <GripDots title={t('grid.dragToReorder')}/>
                  <span style={{fontSize:9,color:T.text3,transform:roleCollapsed?'rotate(-90deg)':'none',transition:'transform 0.15s',display:'inline-block'}}>▾</span>
                  <RoleBadge role={row.role} rs={roleStyles[row.role] || roleColorFor(row.role)}/>
                </div>}
                {!roleCollapsed && <div style={{display:'grid',gridTemplateColumns:`${isMobile?130:180}px repeat(7,1fr)`,minWidth:isMobile?550:700,borderBottom:`1px solid ${T.border}`,background:isMe?(isDark()?T.accent+'18':T.accentLight):ri%2===1?T.surfaceWarm:T.surface,transition:'background 0.2s'}}>
                  {/* Name */}
                  <div style={{padding:isMobile?'10px 10px':'12px 16px',borderRight:`1px solid ${T.border}`,display:'flex',alignItems:'center',gap:isMobile?6:10,minHeight:72,position:'relative'}}>
                    {isMe&&<div style={{position:'absolute',left:0,top:0,bottom:0,width:3,background:T.accent,borderRadius:'0 2px 2px 0'}}/>}
                    <div style={{width:36,height:36,borderRadius:'50%',background:isMe?T.accent:(isDark()?p.dot+'25':p.bg),color:isMe?'#fff':(isDark()?p.dot:p.text),display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,flexShrink:0,border:isMe?'none':`2px solid ${p.dot}33`}}>{initials(emp.name)}</div>
                    <div>
                      <div style={{fontSize:13,fontWeight:isMe?700:500,color:isMe?T.accent:T.text}}>{emp.name}{isMe&&<span style={{fontSize:10,marginLeft:5,color:T.accent,fontWeight:400}}>{t('emp.youTag')}</span>}</div>
                      <div style={{fontSize:10,color:T.text3,marginTop:1}}>{t('emp.hoursThisWeek',{h})}</div>
                    </div>
                  </div>
                  {/* Days */}
                  {DAYS.map((day,di)=>{
                    const date=weekDates[di],onTO=isOnTimeOff(emp.id,date,timeOff);
                    const assignedBlocks=blocks.filter(b=>(schedule[day]?.[b.id]||[]).some(a=>a.empId===emp.id));
                    return(<div key={day} style={{padding:'8px 7px',borderRight:di<6?`1px solid ${T.border}`:'none',display:'flex',flexDirection:'column',gap:4,justifyContent:'center',minHeight:72}}>
                      {onTO?(
                        <div style={{padding:'7px 9px',borderRadius:7,background:T.warningLight,border:`1px solid ${T.warning}44`,textAlign:'center'}}>
                          <div style={{fontSize:11,fontWeight:600,color:T.warning}}>{t('staff.leave')}</div>
                        </div>
                      ):assignedBlocks.length>0?assignedBlocks.map(b=>{
                        const shiftEntry=(schedule[day]?.[b.id]||[]).find(a=>a.empId===emp.id);
                        const dispStart=shiftEntry?.start||b.start,dispEnd=shiftEntry?.end||b.end;
                        const pendingSwap=isMe&&swaps.find(sw=>sw.weekKey===wKey&&sw.day===day&&sw.blockId===b.id&&sw.fromEmpId===myId&&(sw.status==='open'||sw.status==='claimed'));
                        return(
                        <div key={b.id} style={{padding:'8px 10px',borderRadius:8,background:isMe?(isDark()?T.accent+'33':T.accentLight):isDark()?p.dot+'25':p.bg,border:`2px solid ${isMe?T.accent:p.dot}55`,position:'relative'}}>
                          <div style={{position:'absolute',top:6,right:6,width:6,height:6,borderRadius:'50%',background:isMe?T.accent:p.dot}}/>
                          <div style={{fontSize:13,fontWeight:700,color:isMe?T.accent:isDark()?p.dot:p.text}}>{b.name}</div>
                          <div style={{fontSize:11,color:isMe?T.accentText:isDark()?p.dot+'CC':p.text,opacity:0.85,marginTop:2}}>{dispStart}–{dispEnd}</div>
                          <div style={{fontSize:10,color:isMe?T.accentText:isDark()?p.dot+'88':p.text,opacity:0.65,marginTop:1}}>{assignmentHours(shiftEntry||{},b).toFixed(1)}h</div>
                          {isMe&&(pendingSwap?(
                            <div style={{fontSize:9,color:T.accentText,marginTop:4,fontStyle:'italic'}}>{pendingSwap.status==='claimed'?t('swap.statusClaimed',{name:employees.find(e=>e.id===pendingSwap.claimedByEmpId)?.name||'?'}):t('swap.statusOpen')}</div>
                          ):(
                            <button onClick={()=>openGiveAway(day,b.id,b.name,shiftEntry.role)} style={{marginTop:5,padding:'3px 8px',borderRadius:6,fontSize:10,fontWeight:500,background:'transparent',border:`1px solid ${T.accent}55`,color:T.accentText,cursor:'pointer',fontFamily:'inherit'}}>{t('swap.giveAway')}</button>
                          ))}
                        </div>
                      );}):(
                        <div style={{height:46,borderRadius:7,border:`1.5px dashed ${T.border}`,display:'flex',alignItems:'center',justifyContent:'center',opacity:0.3}}>
                          <span style={{fontSize:16,color:T.text3}}>—</span>
                        </div>
                      )}
                    </div>);
                  })}
                </div>}
                </div>
              );
            })}
            {/* Footer */}
            <div style={{display:'grid',gridTemplateColumns:`${isMobile?130:180}px repeat(7,1fr)`,minWidth:isMobile?550:700,background:T.surfaceWarm,borderTop:`2px solid ${T.border}`}}>
              <div style={{padding:isMobile?'10px 12px':'10px 20px',fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em',borderRight:`1px solid ${T.border}`,display:'flex',alignItems:'center'}}>{t('grid.totalLabel')}</div>
              {DAYS.map((day,di)=>{
                const count=[...new Set(blocks.flatMap(b=>(schedule[day]?.[b.id]||[]).map(a=>a.empId)))].length;
                const onLeave=employees.filter(e=>isOnTimeOff(e.id,weekDates[di],timeOff)).length;
                return(<div key={day} style={{padding:'10px 12px',textAlign:'center',borderRight:di<6?`1px solid ${T.border}`:'none'}}>
                  <div style={{fontSize:15,fontWeight:700,color:count===0?T.text3:T.text}}>{count}</div>
                  <div style={{fontSize:10,color:T.text3}}>{t('grid.workingLabel')}</div>
                  {onLeave>0&&<div style={{fontSize:10,color:T.warning,marginTop:2}}>{onLeave} {t('staff.leave')}</div>}
                </div>);
              })}
            </div>
          </div>
        )}
        </>)}
      </>)}
      </div>
    </div>
    {swapModal && createPortal(<GiveAwayModal modal={swapModal} employees={employees} myId={myId} busy={swapBusy} onCancel={()=>setSwapModal(null)} onSubmit={submitGiveAway} s={s} t={t}/>, document.body)}
    </>
  );
}

// Small standalone modal for posting a shift-swap request — kept separate
// from the main render since it's a self-contained form with its own local
// state (which target-mode is picked, the note text) that doesn't need to
// live on the parent component.
function GiveAwayModal({ modal, employees, myId, busy, onCancel, onSubmit, s, t }){
  const [mode, setMode]   = useState('anyone'); // 'anyone' | 'specific'
  const [toEmpId, setToEmpId] = useState('');
  const [note, setNote]   = useState('');
  const eligible = employees.filter(e=>e.id!==myId && (e.roles||[]).includes(modal.role));

  return (
    <div onClick={onCancel} style={{position:'fixed',inset:0,zIndex:300,background:'rgba(20,16,13,0.5)',display:'flex',alignItems:'center',justifyContent:'center',padding:20,fontFamily:"'Hanken Grotesk',sans-serif"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,width:'min(400px,100%)',padding:20,boxShadow:'0 24px 60px -16px rgba(0,0,0,0.5)'}}>
        <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:16,fontWeight:500,marginBottom:4}}>{t('swap.giveAway')}</div>
        <div style={{fontSize:12,color:T.text3,marginBottom:14}}>{modal.blockName} · {modal.role} · {t('day.'+modal.day)}</div>
        <div style={{display:'flex',gap:6,marginBottom:12}}>
          {[['anyone',t('swap.anyoneEligible')],['specific',t('swap.specificCoworker')]].map(([k,l])=>(
            <button key={k} onClick={()=>setMode(k)} style={{flex:1,padding:'7px 8px',borderRadius:8,fontSize:12,fontWeight:mode===k?600:400,background:mode===k?T.accentLight:'transparent',border:`1px solid ${mode===k?T.accent:T.border}`,color:mode===k?T.accentText:T.text2,cursor:'pointer',fontFamily:'inherit'}}>{l}</button>
          ))}
        </div>
        {mode==='specific' && (
          <div style={{marginBottom:12}}>
            <div style={{fontSize:11,color:T.text3,marginBottom:4}}>{t('swap.choosePerson')}</div>
            <select value={toEmpId} onChange={e=>setToEmpId(e.target.value)} style={s.select}>
              <option value="">—</option>
              {eligible.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
        )}
        <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder={t('swap.notePlaceholder')} rows={2} style={{...s.input,resize:'vertical',marginBottom:14}}/>
        <div style={{display:'flex',gap:8}}>
          <Btn onClick={()=>onSubmit({ toEmpId: mode==='specific' ? toEmpId : null, note })} disabled={busy || (mode==='specific' && !toEmpId)}>{t('swap.submit')}</Btn>
          <Btn variant="ghost" onClick={onCancel}>{t('common.cancel')}</Btn>
        </div>
      </div>
    </div>
  );
}

// Read-only per-day timeline for the employee 'week' tab — same underlying
// data shape as the manager's WeekView Gantt, but with every edit affordance
// stripped out (no drag handles, no add/remove picker, no click-to-edit):
// staff can look at who's working when on a given day, nothing more.
function DayTimeline({ schedule, blocks, employees, allRoles, dayFilter, setDayFilter, weekDates, myId, isMobile, gridGroupBy, setGridGroupBy, s, t }){
  const dayShiftsRaw = schedule ? blocks.flatMap(b=>{
    return (schedule[dayFilter]?.[b.id]||[]).map(a=>{
      const st=a.start||b.start, en=a.end||b.end;
      const bs=toMin(st); let be=toMin(en); if(be<=bs) be+=1440;
      return { empId:a.empId, name:a.name, role:a.role, start:bs, end:be, startStr:st, endStr:en };
    });
  }) : [];
  const byEmp = new Map();
  dayShiftsRaw.forEach(sg=>{
    if(!byEmp.has(sg.empId)) byEmp.set(sg.empId,{empId:sg.empId,name:sg.name,segs:[]});
    byEmp.get(sg.empId).segs.push(sg);
  });
  const rows = [...byEmp.values()].map(r=>({...r,segs:[...r.segs].sort((a,b)=>a.start-b.start)}))
    .sort((a,b)=> gridGroupBy==='role'
      ? (allRoles.indexOf(a.segs[0]?.role)-allRoles.indexOf(b.segs[0]?.role)) || a.name.localeCompare(b.name)
      : a.name.localeCompare(b.name));

  let timeline=null;
  if(rows.length){
    const allStarts=rows.flatMap(r=>r.segs.map(m=>m.start)), allEnds=rows.flatMap(r=>r.segs.map(m=>m.end));
    const rangeStart=Math.floor(Math.min(...allStarts)/60)*60;
    const rangeEnd=Math.ceil(Math.max(...allEnds)/60)*60;
    const totalMin=Math.max(60,rangeEnd-rangeStart);
    const ticks=[]; for(let m=rangeStart;m<=rangeEnd;m+=60) ticks.push(m);
    const sideW=isMobile?92:130, rowH=isMobile?26:30;
    const fmtTick=m=>String(Math.floor((m%1440)/60)).padStart(2,'0')+':00';
    timeline=(
      <div style={{...s.cardFlush,padding:isMobile?'14px 10px 12px':'16px 18px 14px',overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
        <div style={{position:'relative',height:16,marginLeft:sideW,marginBottom:10,minWidth:isMobile?480-sideW:'auto'}}>
          {ticks.map(m=>(<span key={m} style={{position:'absolute',left:`${(m-rangeStart)/totalMin*100}%`,transform:'translateX(-50%)',fontSize:10,color:T.text3,whiteSpace:'nowrap'}}>{fmtTick(m)}</span>))}
        </div>
        <div style={{display:'flex',gap:8,minWidth:isMobile?480:'auto'}}>
          <div style={{width:sideW,flexShrink:0,display:'flex',flexDirection:'column',gap:8}}>
            {rows.map(row=>{const isMe=row.empId===myId;return(<div key={row.empId} style={{height:rowH,display:'flex',alignItems:'center',fontSize:isMobile?11:12,fontWeight:isMe?700:500,color:isMe?T.accent:T.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{row.name}{isMe&&<span style={{fontSize:9,marginLeft:4,color:T.accent,fontWeight:400}}>{t('emp.youTag')}</span>}</div>);})}
          </div>
          <div style={{position:'relative',flex:1}}>
            {ticks.map(m=>(<div key={m} style={{position:'absolute',left:`${(m-rangeStart)/totalMin*100}%`,top:0,bottom:0,width:1,zIndex:0,pointerEvents:'none',background:m===rangeStart||m===rangeEnd?'transparent':T.border}}/>))}
            <div style={{display:'flex',flexDirection:'column',gap:8,position:'relative'}}>
              {rows.map(row=>{
                const emp=employees.find(e=>e.id===row.empId), p=pal(emp||{palIdx:0}), isMe=row.empId===myId;
                return(<div key={row.empId} style={{position:'relative',height:rowH,background:T.surfaceWarm,borderRadius:6}}>
                  {row.segs.map((seg,si)=>{
                    const leftPct=(seg.start-rangeStart)/totalMin*100, widthPct=(seg.end-seg.start)/totalMin*100;
                    return(<div key={si} style={{position:'absolute',left:`${leftPct}%`,width:`${widthPct}%`,top:0,bottom:0,minWidth:14,zIndex:1,background:isMe?(isDark()?T.accent+'40':T.accentLight):isDark()?p.dot+'30':p.bg,border:`1.5px solid ${isMe?T.accent:p.dot}`,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden'}}>
                      <span style={{fontSize:isMobile?9:10,fontWeight:600,color:isMe?T.accent:(isDark()?p.dot:p.text),whiteSpace:'nowrap',padding:'0 5px'}}>{seg.startStr}–{seg.endStr}</span>
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

  return (<div style={{display:'flex',flexDirection:'column',gap:16}}>
    <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',justifyContent:'space-between'}}>
      <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
        {DAYS.map((day,i)=>{const active=dayFilter===day,isToday=dateToISO(weekDates[i])===dateToISO(new Date());return(
          <button key={day} onClick={()=>setDayFilter(day)} style={{padding:'6px 12px',borderRadius:8,fontSize:12,fontWeight:active?600:400,border:`1px solid ${active?T.accent:isToday?T.accent+'55':T.border}`,background:active?T.accentLight:'transparent',color:active?T.accent:T.text2,cursor:'pointer',fontFamily:'inherit'}}>
            <div>{t('day.'+day)}</div>
            <div style={{fontSize:10,fontWeight:400,opacity:0.75}}>{fmt(weekDates[i])}</div>
          </button>
        );})}
      </div>
      <div style={{display:'flex',background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:3,gap:2}}>
        {[['name',t('grid.byName')],['role',t('grid.byRole')]].map(([k,l])=><button key={k} onClick={()=>setGridGroupBy(k)} style={{padding:'4px 12px',borderRadius:6,background:gridGroupBy===k?T.bg:'transparent',border:gridGroupBy===k?`1px solid ${T.border}`:'1px solid transparent',cursor:'pointer',fontSize:12,fontWeight:gridGroupBy===k?500:400,color:gridGroupBy===k?T.text:T.text2,fontFamily:'inherit'}}>{l}</button>)}
      </div>
    </div>
    {!schedule ? (
      <div style={{...s.card,textAlign:'center',padding:'52px 32px'}}>
        <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:18,fontWeight:500,color:T.text,marginBottom:6}}>{t('emp.noScheduleTitle')}</div>
        <div style={{fontSize:13,color:T.text2}}>{t('emp.noScheduleDesc')}</div>
      </div>
    ) : timeline || (
      <div style={{...s.card,textAlign:'center',padding:'40px 24px'}}>
        <div style={{fontSize:13,color:T.text2}}>{t('emp.noShiftsDay')}</div>
      </div>
    )}
  </div>);
}
