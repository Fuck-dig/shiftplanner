import { useState, useEffect, useRef } from 'react';
import { activeOnly } from '../lib/schedule';
import { T, DAYS, ROLE_COLOR_PALETTE, isDark } from '../lib/constants';
import { weekKey, fmtLong, todayISO, LOCALE } from '../lib/dates';
import { fetchEmployees, fetchBlocks, fetchSchedules, fetchRoleStyles, updateShiftAssignment, verifyKioskPin } from '../lib/data';
import {LANGUAGES, makeT, detectLang} from '../i18n';
import { load, save, migrateEmployee } from '../lib/storage';
import { Avatar, Btn, LoadingScreen } from './ui';
import PunchClockView from './views/PunchClockView';

const INACTIVITY_MS = 20000; // return to the shared employee picker after 20s idle, once someone's punched in/out


// Shared-device punch clock. Reached at ?kiosk=1 — only ever rendered once a
// manager/owner has already signed in through the normal Auth screen (see
// App.jsx), which is the actual security gate: this screen itself has no
// login of its own, just a per-employee PIN used to pick out whose shift is
// being punched on this one shared device. That split (real login to REACH
// kiosk mode, a lightweight PIN to say WHO you are once there) is what
// replaced letting each employee clock in from their own personal session —
// this is the only place a shift can be clocked in/out from now.
export default function KioskView({ orgId, orgName, toggleTheme, onExitKiosk }){
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
  const [pinLocked, setPinLocked]         = useState(0);   // seconds remaining
  // Which check is the newest. Typing "1234" then "12345" fires two, and they
  // can come back out of order; only the latest may act.
  const verifySeq   = useRef(0);
  // Deferred "wrong PIN". See runVerify.
  const wrongTimer  = useRef(null);
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

  // The kiosk is a wall-mounted device people clock in and out on, so the time
  // it is showing IS the time being recorded. Ticking every 10s rather than
  // every second: the display is HH:MM, so a per-second timer would re-render
  // sixty times to change nothing, and 10s bounds the wrongness to under the
  // minute it displays.
  const [now,setNow]=useState(()=>new Date());
  useEffect(()=>{ const iv=setInterval(()=>setNow(new Date()),10000); return ()=>clearInterval(iv); },[]);

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
    clearTimeout(wrongTimer.current); verifySeq.current++;
    setSelectedEmpId(emp.id); setVerified(false); setPinDigits(''); setPinError(false); setPinLocked(0);
  };

  // Signs in the moment the right digits are typed — no OK to press.
  //
  // The browser cannot know how long the stored PIN is (that was the whole
  // point of hashing it), so instead of guessing when the entry is finished it
  // just asks after every digit from the fourth onwards. The lockout survives
  // this because a SUCCESS RESETS the counter: entering a 6-digit PIN checks
  // 4, 5 and 6, two of which are wrong, and the third wipes them. Legitimate
  // entry therefore never accumulates towards a lockout, while five genuinely
  // wrong entries still do.
  const runVerify = async (code) => {
    const seq = ++verifySeq.current;
    try {
      const { ok, lockedSeconds } = await verifyKioskPin(selectedEmpId, code);
      if (seq !== verifySeq.current) return;   // a later keystroke supersedes this
      clearTimeout(wrongTimer.current);
      if (ok) { setPinError(false); setPinDigits(''); setVerified(true); bumpIdleTimer(); return; }
      if (lockedSeconds > 0) { setPinError(true); setPinDigits(''); setPinLocked(lockedSeconds); return; }
      // Wrong SO FAR — but this may simply be the first four digits of a longer
      // PIN. Saying "wrong PIN" here would flash red twice at somebody typing
      // their own correct six-digit code, so the message waits until they have
      // actually stopped typing.
      wrongTimer.current = setTimeout(()=>{ setPinError(true); setPinDigits(''); }, 1200);
    } catch {
      if (seq !== verifySeq.current) return;
      // A failed REQUEST must not read as a wrong PIN — somebody would stand
      // there retyping a code that was correct all along.
      clearTimeout(wrongTimer.current);
      setPinError(true);
      setPinDigits('');
    }
  };

  // Checks after EVERY digit from the fourth, with no delay, because the
  // server no longer charges for an attempt of the wrong length
  // (20260813200000). Sign-in therefore happens exactly on the final digit.
  //
  // Two earlier versions got this wrong, both by having the browser try to
  // infer something only the server knows — how long the PIN is:
  //   v1  check every keystroke, all attempts counted → a wrong 6-digit PIN
  //       burned three of five attempts and could lock you out mid-typing.
  //   v2  check 450ms after typing stops → anyone who paused between the 4th
  //       and 5th digit was still checked early, and still charged.
  // The fix was not a better guess in here; it was to stop guessing.
  const pressDigit = (d) => {
    if (pinLocked > 0) return;
    const next = (pinDigits + d).slice(0, 8);
    setPinDigits(next);
    setPinError(false);
    clearTimeout(wrongTimer.current);
    if (next.length >= 4) runVerify(next);
  };
  const backspace = () => { clearTimeout(wrongTimer.current); verifySeq.current++; setPinDigits(p=>p.slice(0,-1)); };

  // Physical keyboard support for the PIN pad — most "shared kiosk device"
  // setups are a plain laptop/PC rather than a touchscreen, so typing the
  // digits (plus Backspace/Escape) needs to work exactly like tapping the
  // on-screen keypad. Only listens while a PIN entry screen is actually
  // showing (an employee is selected, has a PIN, and hasn't verified yet).
  useEffect(()=>{
    if (!selectedEmpId || verified) return;
    const emp = employees.find(e=>e.id===selectedEmpId);
    if (!emp || !hasPin(emp)) return;
    const onKeyDown = (e) => {
      if (/^[0-9]$/.test(e.key)) pressDigit(e.key);
      else if (e.key==='Backspace') backspace();
      else if (e.key==='Escape') returnToList();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedEmpId, verified, pinDigits, employees, pinLocked]);

  useEffect(()=>{
    if (pinLocked <= 0) return;
    const id = setInterval(()=>setPinLocked(n=>Math.max(0,n-1)), 1000);
    return ()=>clearInterval(id);
  }, [pinLocked]);

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
  const clockIn    = (blockId, note) => applyAssignmentPatch(blockId, { actualStart: nowHM(), clockInNote: note||'' });
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
        {/* Big, and deliberately the most prominent thing in the bar. Someone
            clocking in wants to see the time being recorded without walking up
            to the screen. Tabular figures so the digits don't jitter as they
            change width each minute. */}
        <div style={{display:'flex',alignItems:'baseline',gap:10,marginRight:16}}>
          <span style={{fontFamily:'Fraunces, Georgia, serif',fontSize:30,fontWeight:600,color:T.text,letterSpacing:'-0.01em',lineHeight:1,fontVariantNumeric:'tabular-nums'}}>
            {String(now.getHours()).padStart(2,'0')}:{String(now.getMinutes()).padStart(2,'0')}
          </span>
          <span style={{fontSize:12,color:T.text3,whiteSpace:'nowrap'}}>{now.toLocaleDateString(LOCALE,{weekday:'short',day:'numeric',month:'short'})}</span>
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
              {/* Archived people must not be offered a punch-in tile — they
                  have left, and the kiosk is the one screen anyone walking
                  past can use. */}
              {activeOnly(employees).map(emp=>(
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
              {Array.from({length: 8}).map((_,i)=>(
                <div key={i} style={{width:14,height:14,borderRadius:'50%',border:`1.5px solid ${pinError?T.danger:T.border}`,background:i<pinDigits.length?(pinError?T.danger:T.accent):'transparent'}}/>
              ))}
            </div>
            {pinLocked > 0
              ? <div style={{fontSize:12,color:T.danger,marginBottom:10}}>{t('kiosk.lockedFor',{n:pinLocked})}</div>
              : pinError && <div style={{fontSize:12,color:T.danger,marginBottom:10}}>{t('kiosk.wrongPin')}</div>}
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

// `has_pin` is a plain boolean on the employee row, maintained by the database
// functions. It is the only thing about a PIN the client is told.
function hasPin(emp){ return emp?.hasPin === true; }
