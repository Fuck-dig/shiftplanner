import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { T, styles, DAYS, pal, initials, isDark } from '../lib/constants';
import { getWeekDates, weekKey, weekKeyToMonday, fmt, dateToISO, todayISO } from '../lib/dates';
import { blockHours, isOnTimeOff } from '../lib/schedule';
import { fetchEmployees, fetchBlocks, fetchSchedules, fetchTimeOff, fetchShiftSwaps, createShiftSwap, updateShiftSwap, deleteShiftSwap, createNotification, updateEmployeeSelfProfile } from '../lib/data';
import { supabase } from '../lib/supabase';
import { LANGUAGES, makeT, detectLang } from '../i18n';
import { load, save } from '../lib/storage';
import NotificationBell from './NotificationBell';
import ProfileSettings from './ProfileSettings';
import { Btn } from './ui';

const roleColors = { owner:{bg:'#F5E2E2',text:'#963030',border:'#E8BABA'}, manager:{bg:'#F5EAE2',text:'#7A3318',border:'#E8C0A0'}, employee:{bg:'#E5F0E9',text:'#236040',border:'#9FD8B8'} };

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
  const [isMobile,setIsMobile]    = useState(()=>typeof window!=='undefined'&&window.innerWidth<860);
  const [swaps, setSwaps]         = useState([]);       // all shift_swaps for this org, any week/status
  const [swapModal, setSwapModal] = useState(null);      // {day,blockId,blockName,role} while the give-away modal is open
  const [swapBusy, setSwapBusy]   = useState(false);
  const [showProfile, setShowProfile] = useState(false);

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
      ]).then(([emps, blks, to, scheds]) => {
        if (!alive) return;
        setEmployees(emps);
        setBlocks(blks);
        setTimeOff(to);
        setSchedules(scheds);
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

  const assignmentHours = (a,b) => blockHours({start:a.start||b.start,end:a.end||b.end});
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
        {!isMobile&&<span style={{fontSize:11,fontWeight:600,padding:'3px 10px',borderRadius:999,marginRight:8,background:(roleColors[role]||roleColors.employee).bg,color:(roleColors[role]||roleColors.employee).text,border:`1px solid ${(roleColors[role]||roleColors.employee).border}`,flexShrink:0}}>{t('team.role'+(role.charAt(0).toUpperCase()+role.slice(1)))}</span>}
        <select value={lang} onChange={e=>setLang(e.target.value)} style={{fontFamily:'inherit',fontSize:12,color:T.text2,background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:'6px 8px',marginRight:isMobile?0:8,cursor:'pointer',outline:'none',flexShrink:0}}>{LANGUAGES.map(L=><option key={L.code} value={L.code}>{isMobile?L.code.toUpperCase():L.label}</option>)}</select>
        <span style={{marginRight:isMobile?0:10}}><NotificationBell empId={myId} t={t} lang={lang} onNavigate={link=>{if(link?.weekOffset!=null)setWeekOffset(link.weekOffset);}}/></span>
        <button onClick={()=>setShowProfile(true)} title={t('profile.myProfile')} style={{width:34,height:34,marginRight:isMobile?0:10,borderRadius:8,border:`1px solid ${T.border}`,background:T.surface,color:T.text2,cursor:'pointer',fontSize:15,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>👤</button>
        <button onClick={toggleTheme} style={{width:34,height:34,marginRight:isMobile?0:10,borderRadius:8,border:`1px solid ${T.border}`,background:T.surface,color:T.text2,cursor:'pointer',fontSize:15,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{isDark()?'☀':'☾'}</button>
        <button onClick={()=>supabase.auth.signOut()} style={{padding:isMobile?'6px 10px':'6px 14px',borderRadius:8,border:`1px solid ${T.border}`,background:T.surface,color:T.text2,cursor:'pointer',fontSize:12,fontFamily:'inherit',flexShrink:0,whiteSpace:'nowrap'}}>{t('common.logout')}</button>
      </div>

      <div style={{padding:isMobile?'16px 12px':'24px 28px'}}>
        {/* Week nav */}
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:20,flexWrap:'wrap'}}>
          <div style={{display:'flex',alignItems:'center',gap:4,background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:3}}>
            <button onClick={()=>setWeekOffset(w=>w-1)} style={{padding:'4px 12px',borderRadius:6,background:'none',border:'none',cursor:'pointer',color:T.text2,fontFamily:'inherit',fontSize:14}}>‹</button>
            <span style={{fontSize:14,fontWeight:500,minWidth:isMobile?130:160,textAlign:'center',color:T.text,padding:'0 4px'}}>{fmt(weekDates[0])} – {fmt(weekDates[6])}</span>
            <button onClick={()=>setWeekOffset(w=>w+1)} style={{padding:'4px 12px',borderRadius:6,background:'none',border:'none',cursor:'pointer',color:T.text2,fontFamily:'inherit',fontSize:14}}>›</button>
          </div>
          <button onClick={()=>setWeekOffset(0)} style={{padding:'5px 12px',borderRadius:8,background:T.surface,border:`1px solid ${T.border}`,cursor:'pointer',fontSize:12,color:T.text2,fontFamily:'inherit'}}>{t('common.today')}</button>
          {schedules[wKey]?.confirmed && <span style={{fontSize:12,color:T.success,fontWeight:500,background:T.successLight,padding:'2px 10px',borderRadius:999,border:`1px solid ${T.success}33`}}>✓ {t('emp.published')}</span>}
        </div>

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
            {employees.map((emp,ri)=>{
              const p=pal(emp),isMe=emp.id===myId,h=empHoursMap[emp.id]||0;
              return(
                <div key={emp.id} style={{display:'grid',gridTemplateColumns:`${isMobile?130:180}px repeat(7,1fr)`,minWidth:isMobile?550:700,borderBottom:`1px solid ${T.border}`,background:isMe?(isDark()?T.accent+'18':T.accentLight):ri%2===1?T.surfaceWarm:T.surface,transition:'background 0.2s'}}>
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
      </div>
    </div>
    {swapModal && createPortal(<GiveAwayModal modal={swapModal} employees={employees} myId={myId} busy={swapBusy} onCancel={()=>setSwapModal(null)} onSubmit={submitGiveAway} s={s} t={t}/>, document.body)}
    {showProfile && <ProfileSettings role={role} myEmp={me} onSaveName={saveMyName} onSaveColor={saveMyColor} onClose={()=>setShowProfile(false)} s={s} t={t}/>}
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
