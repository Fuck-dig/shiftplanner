import { useState, useEffect, useRef } from 'react';
import { T, DAYS, ROLE_COLOR_PALETTE, isDark } from '../lib/constants';
import { weekKey, fmtLong, todayISO } from '../lib/dates';
import { fetchEmployees, fetchBlocks, fetchSchedules, fetchRoleStyles, updateShiftAssignment } from '../lib/data';
import { LANGUAGES, makeT, detectLang, LOCALES } from '../i18n';
import { load, save, migrateEmployee } from '../lib/storage';
import { Avatar, Btn } from './ui';
import PunchClockView from './views/PunchClockView';

const INACTIVITY_MS = 20000; // return to the shared employee picker after 20s idle, once someone's punched in/out

function LoadingScreen(){
  return <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:T.bg,color:T.text3,fontFamily:"'Hanken Grotesk',sans-serif",fontSize:26}}><span style={{fontFamily:'Fraunces, Georgia, serif',opacity:0.5}}>Rorota</span></div>;
}

// Shared-device punch clock. Reached at ?kiosk=1 — only ever rendered once a
// manager/owner has already signed in through the normal Auth screen (see
// App.jsx), which is the actual security gate: this screen itself has no
// login of its own, just a per-employee PIN used to pick out whose shift is
// being punched on this one shared device. That split (real login to REACH
// kiosk mode, a lightweight PIN to say WHO you are once there) is what
// replaced letting each employee clock in from their own personal session —
// this is the only place a shift can be clocked in/out from now.
export default function KioskView({ orgId, orgName, theme, toggleTheme, onExitKiosk }){
  const [loading, setLoading]     = useState(true);
  const [employees, setEmployees] = useState([]);
  const [blocks, setBlocks]       = useState([]);
  const [schedules, setSchedules] = useState({});
  const [roleStyles, setRoleStyles] = useState({});
  const [lang, setLangRaw]        = useState(()=>load('sa2_lang', detectLang()));
  const setLang = v => { setLangRaw(v); save('sa2_lang', v); };
  const t = makeT(lang);

  const [selectedEmpId, setSelectedEmpId] = useState(null);
  const [verified, setVerified]           = useState(false);
  const [pinDigits, setPinDigits]         = useState('');
  const [pinError, setPinError]           = useState(false);
  const [busy, setBusy]                   = useState(false);
  const idleTimer = useRef(null);

  useEffect(()=>{
    let alive = true;
    Promise.all([
      fetchEmployees(orgId),
      fetchBlocks(orgId),
      fetchSchedules(orgId),
      fetchRoleStyles(orgId).catch(()=>({})),
    ]).then(([emps, blks, scheds, rStyles])=>{
      if (!alive) return;
      setEmployees(emps.map(migrateEmployee));
      setBlocks(blks);
      setSchedules(scheds);
      setRoleStyles(rStyles || {});
      setLoading(false);
    }).catch(err=>{ console.error('Kiosk load failed:', err); if(alive) setLoading(false); });
    return ()=>{ alive=false; };
  }, [orgId]);

  // Light polling — a shared device can sit open all day, and the schedule
  // (or who's in the roster) can change under it in the meantime.
  useEffect(()=>{
    const iv = setInterval(()=>{
      Promise.all([fetchEmployees(orgId), fetchSchedules(orgId)])
        .then(([emps, scheds])=>{ setEmployees(emps.map(migrateEmployee)); setSchedules(scheds); })
        .catch(err=>console.error('Kiosk poll failed:', err));
    }, 60000);
    return ()=>clearInterval(iv);
  }, [orgId]);

  const returnToList = () => {
    setSelectedEmpId(null); setVerified(false); setPinDigits(''); setPinError(false);
    if (idleTimer.current) { clearTimeout(idleTimer.current); idleTimer.current=null; }
  };
  const bumpIdleTimer = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(returnToList, INACTIVITY_MS);
  };
  useEffect(()=>()=>{ if(idleTimer.current) clearTimeout(idleTimer.current); }, []);

  const hashRole = (role) => { let h=0; for(let i=0;i<role.length;i++) h=(h*31+role.charCodeAt(i))>>>0; return h; };
  const roleColorFor = (role) => ROLE_COLOR_PALETTE[hashRole(role)%ROLE_COLOR_PALETTE.length];

  const selectEmployee = (emp) => {
    setSelectedEmpId(emp.id); setVerified(false); setPinDigits(''); setPinError(false);
  };

  const pressDigit = (d) => {
    const emp = employees.find(e=>e.id===selectedEmpId);
    if (!emp) return;
    const next = (pinDigits + d).slice(0, 6);
    setPinDigits(next);
    setPinError(false);
    if (next.length >= (emp.pin||'').length && (emp.pin||'').length > 0) {
      if (next === emp.pin) { setVerified(true); bumpIdleTimer(); }
      else { setPinError(true); setTimeout(()=>setPinDigits(''), 400); }
    }
  };
  const backspace = () => setPinDigits(p=>p.slice(0,-1));

  const todayDayName = (() => { const jsDay=new Date().getDay(); return DAYS[jsDay===0?6:jsDay-1]; })();
  const todayWeekKey = weekKey(0);
  const daySchedule  = schedules[todayWeekKey]?.schedule?.[todayDayName] || {};
  const nowHM = () => { const d=new Date(); return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); };
  const applyAssignmentPatch = (blockId, patch) => {
    if (!selectedEmpId) return;
    setBusy(true);
    updateShiftAssignment(orgId, todayWeekKey, todayDayName, blockId, selectedEmpId, patch)
      .then(nextData => { setSchedules(p=>({...p,[todayWeekKey]:nextData})); bumpIdleTimer(); })
      .catch(err=>alert(err.message||'Failed to save'))
      .finally(()=>setBusy(false));
  };
  const clockIn    = (blockId)       => applyAssignmentPatch(blockId, { actualStart: nowHM() });
  const clockOut   = (blockId, note) => applyAssignmentPatch(blockId, { actualEnd: nowHM(), clockNote: note||'' });
  const addShift   = (blockId, role) => applyAssignmentPatch(blockId, { role, selfAdded: true });

  if (loading) return <LoadingScreen/>;

  const selectedEmp = employees.find(e=>e.id===selectedEmpId);
  const s = {
    card:   { background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, padding:20, boxShadow:'0 1px 2px rgba(33,27,21,0.03), 0 12px 30px -20px rgba(33,27,21,0.25)' },
    input:  { padding:'7px 11px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:13, fontFamily:'inherit', outline:'none', width:'100%', boxSizing:'border-box' },
    select: { padding:'7px 11px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:13, fontFamily:'inherit', outline:'none', width:'100%', boxSizing:'border-box', cursor:'pointer' },
  };

  return (
    <div style={{minHeight:'100vh',width:'100%',background:T.bg,fontFamily:"'Hanken Grotesk',sans-serif",color:T.text,fontSize:13}}>
      <div style={{background:T.surface,borderBottom:`1px solid ${T.border}`,padding:'0 24px',display:'flex',alignItems:'center',height:56,boxShadow:'0 2px 14px -8px rgba(33,27,21,0.15)'}}>
        <div style={{display:'flex',alignItems:'baseline',gap:9,flex:1,minWidth:0}}>
          <span style={{fontFamily:'Fraunces, Georgia, serif',fontSize:21,fontWeight:600,color:T.text,letterSpacing:'-0.02em'}}>Rorota</span>
          <span style={{fontSize:11,color:T.text3,fontWeight:500,letterSpacing:'0.03em',textTransform:'uppercase'}}>{orgName} · {t('kiosk.title')}</span>
        </div>
        <select value={lang} onChange={e=>setLang(e.target.value)} style={{fontFamily:'inherit',fontSize:12,color:T.text2,background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:'6px 8px',marginRight:10,cursor:'pointer',outline:'none'}}>{LANGUAGES.map(L=><option key={L.code} value={L.code}>{L.label}</option>)}</select>
        <button onClick={toggleTheme} style={{width:34,height:34,marginRight:10,borderRadius:8,border:`1px solid ${T.border}`,background:T.surface,color:T.text2,cursor:'pointer',fontSize:15,display:'flex',alignItems:'center',justifyContent:'center'}}>{isDark()?'☀':'☾'}</button>
        <button onClick={onExitKiosk} style={{padding:'6px 14px',borderRadius:8,border:`1px solid ${T.border}`,background:T.surface,color:T.text2,cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>{t('kiosk.exit')}</button>
      </div>

      <div style={{padding:'32px 20px',maxWidth:720,margin:'0 auto'}}>
        {!selectedEmp ? (
          <>
            <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:20,fontWeight:500,color:T.text,marginBottom:4,textAlign:'center'}}>{t('kiosk.selectYourName')}</div>
            <div style={{fontSize:13,color:T.text3,marginBottom:24,textAlign:'center'}}>{fmtLong(todayISO())}</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))',gap:12}}>
              {employees.map(emp=>(
                <button key={emp.id} onClick={()=>selectEmployee(emp)} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8,padding:'16px 8px',borderRadius:12,background:T.surface,border:`1px solid ${T.border}`,cursor:'pointer',fontFamily:'inherit'}}>
                  <Avatar emp={emp} size={44}/>
                  <span style={{fontSize:12,fontWeight:500,color:T.text,textAlign:'center'}}>{emp.name}</span>
                </button>
              ))}
            </div>
          </>
        ) : !hasPin(selectedEmp) ? (
          <div style={{...s.card,textAlign:'center',padding:'36px 24px',maxWidth:360,margin:'0 auto'}}>
            <div style={{fontSize:14,color:T.text2,marginBottom:16}}>{t('kiosk.noPinSet',{name:selectedEmp.name})}</div>
            <Btn variant="ghost" onClick={returnToList}>{t('kiosk.backToList')}</Btn>
          </div>
        ) : !verified ? (
          <div style={{...s.card,maxWidth:320,margin:'0 auto',textAlign:'center'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10,marginBottom:6}}>
              <Avatar emp={selectedEmp} size={36}/>
              <span style={{fontSize:15,fontWeight:600,color:T.text}}>{selectedEmp.name}</span>
            </div>
            <div style={{fontSize:12,color:T.text3,marginBottom:16}}>{t('kiosk.enterPin')}</div>
            <div style={{display:'flex',justifyContent:'center',gap:8,marginBottom:18}}>
              {Array.from({length: Math.max((selectedEmp.pin||'').length,4)}).map((_,i)=>(
                <div key={i} style={{width:14,height:14,borderRadius:'50%',border:`1.5px solid ${pinError?T.danger:T.border}`,background:i<pinDigits.length?(pinError?T.danger:T.accent):'transparent'}}/>
              ))}
            </div>
            {pinError && <div style={{fontSize:12,color:T.danger,marginBottom:10}}>{t('kiosk.wrongPin')}</div>}
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:14}}>
              {['1','2','3','4','5','6','7','8','9'].map(d=>(
                <button key={d} onClick={()=>pressDigit(d)} style={{padding:'14px 0',borderRadius:10,fontSize:17,fontWeight:500,background:T.surfaceWarm,border:`1px solid ${T.border}`,color:T.text,cursor:'pointer',fontFamily:'inherit'}}>{d}</button>
              ))}
              <button onClick={returnToList} style={{padding:'14px 0',borderRadius:10,fontSize:12,background:'transparent',border:`1px solid ${T.border}`,color:T.text3,cursor:'pointer',fontFamily:'inherit'}}>{t('common.cancel')}</button>
              <button onClick={()=>pressDigit('0')} style={{padding:'14px 0',borderRadius:10,fontSize:17,fontWeight:500,background:T.surfaceWarm,border:`1px solid ${T.border}`,color:T.text,cursor:'pointer',fontFamily:'inherit'}}>0</button>
              <button onClick={backspace} style={{padding:'14px 0',borderRadius:10,fontSize:15,background:'transparent',border:`1px solid ${T.border}`,color:T.text3,cursor:'pointer',fontFamily:'inherit'}}>⌫</button>
            </div>
          </div>
        ) : (
          <div onClick={bumpIdleTimer}>
            <PunchClockView me={selectedEmp} myId={selectedEmp.id} blocks={blocks} todayLabel={fmtLong(todayISO())} daySchedule={daySchedule} roleStyles={roleStyles} roleColorFor={roleColorFor} busy={busy} onClockIn={clockIn} onClockOut={clockOut} onAddShift={addShift} s={s} t={t}/>
            <div style={{maxWidth:560,margin:'16px auto 0',textAlign:'center'}}>
              <Btn variant="ghost" onClick={returnToList}>{t('kiosk.backToList')}</Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function hasPin(emp){ return !!(emp && emp.pin && emp.pin.length>0); }
