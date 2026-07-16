import React, { useState, useEffect, useCallback } from 'react';
import { T, styles, THEMES, computeStyles, ROLE_COLOR_PALETTE, DEFAULT_ROLE_STYLES, DEFAULT_BLOCKS, DEFAULT_EMPLOYEES, DAYS, AVAIL_TEMPLATES, EMP_PALETTE, TIMEOFF_TYPES, pal, initials } from './lib/constants';
import { getMondayDate, getWeekDates, weekKey, dateToISO, fmt, fmtLong, toMin, getMonthOffsets, todayISO } from './lib/dates';
import { blockHours, coversBlock, getBlockRoles, isOnTimeOff, buildSchedule, dayCoverage } from './lib/schedule';
import { fetchEmployees, syncEmployees, fetchBlocks, syncBlocks, fetchTimeOff, syncTimeOff, fetchSchedules, syncSchedules } from './lib/data';
import { migrateEmployee } from './lib/storage';
import { supabase } from './lib/supabase';
import { listOrgs, addMember, removeMember, listMembers, createInvitation, listInvitations, deleteInvitation, acceptPendingInvitations } from './lib/org';
import { Avatar, RoleBadge, EmpChip, StatusBadge, Btn, SectionLabel, AddRoleInline } from './components/ui';
import Auth from './components/Auth';
import RestaurantPicker from './components/RestaurantPicker';
import EmployeeView from './components/EmployeeView';
import Onboarding from './components/Onboarding';
import AccountBar from './components/AccountBar';
import { LANGUAGES, makeT, detectLang } from './i18n';

const loadPref = (k, fb) => { try { const v=localStorage.getItem(k); return v?JSON.parse(v):fb; } catch { return fb; } };
const savePref = (k, v) => { try { localStorage.setItem(k,JSON.stringify(v)); } catch {} };

function LoadingScreen() {
  return <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:T.bg,color:T.text3,fontFamily:"'Hanken Grotesk',sans-serif",fontSize:26}}><span style={{fontFamily:'Fraunces, Georgia, serif',opacity:0.5}}>Rorota</span></div>;
}

function isDark() { return T.bg === '#1A1714'; }

function TeamAccess({ orgId, orgName, isOwner=false, s, t }){
  const [members,  setMembers]  = useState(null);
  const [invites,  setInvites]  = useState([]);
  const [email,    setEmail]    = useState('');
  const [busy,     setBusy]     = useState(false);
  const [sentTo,   setSentTo]   = useState(null);
  const [inviteRole, setInviteRole] = useState('employee');
  const [showTemplate, setShowTemplate] = useState(false);
  const [emailSubject, setEmailSubject] = useState(`You're invited to join ${orgName||'our restaurant'} on Rorota`);
  const [emailBody,    setEmailBody]    = useState(`Hi,\n\nYou've been invited to view the staff rota for ${orgName||'our restaurant'} on Rorota.\n\n1. Go to https://rorota.net\n2. Sign up or log in with this email address\n3. You'll automatically get access to the rota.\n\nSee you on the rota!`);

  const reload = () => {
    listMembers(orgId).then(setMembers).catch(()=>setMembers([]));
    listInvitations(orgId).then(setInvites).catch(()=>setInvites([]));
  };
  useEffect(()=>{ reload(); },[orgId]);

  const mailtoLink = (addr) => {
    const sub = encodeURIComponent(`You're invited to ${orgName} on Rorota`);
    const body = encodeURIComponent(`Hi,

You've been invited to view the staff rota for ${orgName} on Rorota.

1. Go to https://rorota.net
2. Sign up or log in with this email: ${addr}
3. You'll automatically get access to the rota.

See you on the rota!`);
    return `mailto:${addr}?subject=${sub}&body=${body}`;
  };

  const invite = async () => {
    if(!email.trim()) return;
    setBusy(true);
    try {
      // 1. Create invitation record in DB
      await createInvitation(orgId, email.trim(), inviteRole);
      // 2. Send email via Edge Function
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        'https://mnenerpzypiflyrizyzr.supabase.co/functions/v1/send-invite',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            to: email.trim(),
            orgName,
            subject: emailSubject,
            body: emailBody,
          }),
        }
      );
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setSentTo(email.trim()); setEmail(''); reload();
    } catch(e){ alert(e.message||t('team.sendFailed')); }
    finally { setBusy(false); }
  };

  if(members===null) return null;
  const pending = invites.filter(i=>!i.used_at);

  return (
    <div style={{...s.card,marginTop:4}}>
      <div style={{fontFamily:"Fraunces, Georgia, serif",fontSize:15,fontWeight:500,marginBottom:4}}>{t('team.title')}</div>
      <div style={{fontSize:12,color:T.text2,marginBottom:16}}>{t('team.desc')}</div>

      {members.length>0&&(<div style={{marginBottom:16}}>
        <div style={{fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:8}}>{t('team.activeMembers')}</div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {members.map(m=>(
            <div key={m.user_id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:8,background:T.surfaceWarm,border:`1px solid ${T.border}`}}>
              <div style={{width:28,height:28,borderRadius:"50%",background:m.role==="manager"?T.accentLight:T.successLight,color:m.role==="manager"?T.accent:T.success,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700}}>{m.role==="manager"?"M":"E"}</div>
              <span style={{fontSize:11,color:T.text2,flex:1}}>{m.email||m.user_id.slice(0,16)+'…'}</span>
              {isOwner?(
                <select value={m.role} onChange={async e=>{await addMember(orgId,m.user_id,e.target.value);reload();}}
                  style={{fontSize:11,padding:"2px 6px",borderRadius:6,border:`1px solid ${T.border}`,background:T.surface,color:T.text,fontFamily:"inherit",cursor:"pointer"}}>
                  <option value="owner">{t('team.roleOwner')}</option>
                  <option value="manager">{t('team.roleManager')}</option>
                  <option value="employee">{t('team.roleEmployee')}</option>
                </select>
              ):(
                <span style={{fontSize:11,fontWeight:500,color:m.role==="owner"?T.danger:m.role==="manager"?T.accent:T.success,background:m.role==="owner"?T.dangerLight:m.role==="manager"?T.accentLight:T.successLight,padding:"2px 8px",borderRadius:999}}>{t('team.role'+(m.role.charAt(0).toUpperCase()+m.role.slice(1)))}</span>
              )}
              {(isOwner||m.role==="employee")&&m.role!=="owner"&&<button onClick={async()=>{await removeMember(orgId,m.user_id);reload();}} style={{padding:"3px 8px",borderRadius:6,background:T.dangerLight,border:`1px solid ${T.danger}33`,color:T.danger,cursor:"pointer",fontSize:11,fontFamily:"inherit"}}>{t('team.remove')}</button>}
            </div>
          ))}
        </div>
      </div>)}

      {pending.length>0&&(<div style={{marginBottom:16}}>
        <div style={{fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:8}}>{t('team.pendingInvites')}</div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {pending.map(inv=>(
            <div key={inv.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:8,background:T.warningLight,border:`1px solid ${T.warning}33`}}>
              <span style={{fontSize:13}}>✉️</span>
              <span style={{fontSize:12,color:T.text,flex:1}}>{inv.email}</span>
              <span style={{fontSize:10,color:T.warning}}>{t('team.awaitingSignup')}</span>
              <button onClick={async()=>{
                try{
                  const{data:{session}}=await supabase.auth.getSession();
                  await fetch('https://mnenerpzypiflyrizyzr.supabase.co/functions/v1/send-invite',{
                    method:'POST',
                    headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`},
                    body:JSON.stringify({to:inv.email,orgName,subject:emailSubject,body:emailBody})
                  });
                  alert(t('team.resendSent',{email:inv.email}));
                }catch(e){alert(e.message||t('team.resendFailed'));}
              }} style={{padding:"3px 10px",borderRadius:6,background:T.accentLight,border:`1px solid ${T.accent}44`,color:T.accent,cursor:"pointer",fontSize:11,fontFamily:"inherit"}}>{t('team.resend')}</button>
              <button onClick={async()=>{try{await deleteInvitation(inv.id);reload();}catch(e){alert(e.message||t('team.deleteFailed'));}}} style={{padding:"3px 8px",borderRadius:6,background:T.dangerLight,border:`1px solid ${T.danger}33`,color:T.danger,cursor:"pointer",fontSize:11,fontFamily:"inherit"}}>✕</button>
            </div>
          ))}
        </div>
      </div>)}

      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <div style={{fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.07em'}}>{t('team.inviteSomeone')}</div>
        <button onClick={()=>setShowTemplate(p=>!p)} style={{fontSize:11,color:T.text2,background:'transparent',border:`1px solid ${T.border}`,borderRadius:6,padding:'3px 8px',cursor:'pointer',fontFamily:'inherit'}}>{showTemplate?t('team.hideTemplate'):t('team.editTemplate')}</button>
      </div>

      {showTemplate&&(<div style={{marginBottom:12,padding:'12px 14px',borderRadius:10,background:T.surfaceWarm,border:`1px solid ${T.border}`,display:'flex',flexDirection:'column',gap:8}}>
        <div>
          <div style={{fontSize:11,color:T.text3,marginBottom:4}}>{t('team.subject')}</div>
          <input value={emailSubject} onChange={e=>setEmailSubject(e.target.value)} style={{...s.input}}/>
        </div>
        <div>
          <div style={{fontSize:11,color:T.text3,marginBottom:4}}>{t('team.messageBody')}</div>
          <textarea value={emailBody} onChange={e=>setEmailBody(e.target.value)} rows={6} style={{...s.input,resize:'vertical',lineHeight:1.5}}/>
        </div>
      </div>)}

      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        <input type="email" placeholder={t('team.emailPlaceholder')} value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&invite()} style={{...s.input,flex:"2 1 200px"}} disabled={busy}/>
        <select value={inviteRole} onChange={e=>setInviteRole(e.target.value)}
          style={{padding:"7px 10px",borderRadius:8,border:`1px solid ${T.border}`,background:T.surface,color:T.text,fontSize:13,fontFamily:"inherit",cursor:"pointer"}}>
          <option value="employee">{t('team.roleEmployee')}</option>
          {isOwner&&<option value="manager">{t('team.roleManager')}</option>}
          {isOwner&&<option value="owner">{t('team.roleOwner')}</option>}
        </select>
        <Btn onClick={invite} disabled={busy||!email.trim()}>{busy?t('team.sending'):t('team.sendInvite')}</Btn>
      </div>

      {sentTo&&(<div style={{marginTop:12,padding:"12px 14px",borderRadius:10,background:T.successLight,border:`1px solid ${T.success}33`}}>
        <div style={{fontSize:13,fontWeight:500,color:T.success,marginBottom:4}}>{t('team.sentTo',{email:sentTo})}</div>
        <div style={{fontSize:12,color:T.success}}>{t('team.sentDesc')}</div>
        <button onClick={()=>setSentTo(null)} style={{marginTop:10,padding:"6px 12px",borderRadius:8,background:"transparent",border:`1px solid ${T.success}55`,color:T.success,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>{t('team.done')}</button>
      </div>)}
    </div>
  );
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

  // debounce helper
  const mkDebounce=(fn,ms=600)=>{let timer;return(...args)=>{clearTimeout(timer);timer=setTimeout(()=>fn(...args).catch(console.error),ms);};};

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

  const dEmp  =useCallback(mkDebounce(v=>syncEmployees(orgId,v)),[orgId]);
  const dBlk  =useCallback(mkDebounce(v=>syncBlocks(orgId,v)),[orgId]);
  const dTO   =useCallback(mkDebounce(v=>syncTimeOff(orgId,v)),[orgId]);
  const dSched=useCallback(mkDebounce(v=>syncSchedules(orgId,v)),[orgId]);

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

  const generate=(forOff=weekOffset)=>{
    setGenerating(true);setSelected(null);
    setTimeout(()=>{
      const wd=getWeekDates(forOff);
      const{schedule:s,total,noMgr}=buildSchedule(employees,blocks,wd,timeOff,allRoles);
      const notes=noMgr.length?t('sched.notesGaps',{total,n:noMgr.length}):t('sched.notesOk',{total});
      const warnings=noMgr.map(({day,block})=>'⚠️ '+t('sched.noMgr',{day:t('day.'+day),block}));
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
        const warnings=noMgr.map(({day,block})=>'⚠️ '+t('sched.noMgr',{day:t('day.'+day),block}));
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
    if(!confirm('This replaces your current employee list with test data (10 staff, several with multiple roles, full-week availability) and fills the whole month with shifts.\n\nContinue?')) return;
    setGenerating(true);setSelected(null);
    setTimeout(()=>{
      const fullWeek=Object.fromEntries(DAYS.map(d=>[d,{from:'08:00',to:'00:00'}]));
      const testEmployees=[
        {id:'t1', name:'Alma Berg',     roles:['Manager','Waiter'],            priority:100, palIdx:0, contractType:'fixed',  contractPeriod:'month', wage:35000, maxHours:60, availability:fullWeek},
        {id:'t2', name:'Bo Frank',      roles:['Manager','Kitchen'],           priority:100, palIdx:1, contractType:'fixed',  contractPeriod:'month', wage:35000, maxHours:60, availability:fullWeek},
        {id:'t3', name:'Cecilie Holm',  roles:['Manager'],                     priority:100, palIdx:2, contractType:'fixed',  contractPeriod:'month', wage:35000, maxHours:60, availability:fullWeek},
        {id:'t4', name:'Daniel Vang',   roles:['Waiter','Bartender'],          priority:80,  palIdx:3, contractType:'hourly', contractPeriod:'week',  wage:165,   maxHours:60, availability:fullWeek},
        {id:'t5', name:'Emilie Skov',   roles:['Waiter','Kitchen'],            priority:80,  palIdx:4, contractType:'hourly', contractPeriod:'week',  wage:165,   maxHours:60, availability:fullWeek},
        {id:'t6', name:'Frederik Lang', roles:['Waiter'],                      priority:80,  palIdx:5, contractType:'hourly', contractPeriod:'week',  wage:165,   maxHours:60, availability:fullWeek},
        {id:'t7', name:'Gitte Krogh',   roles:['Kitchen','Bartender'],         priority:80,  palIdx:6, contractType:'hourly', contractPeriod:'week',  wage:170,   maxHours:60, availability:fullWeek},
        {id:'t8', name:'Henrik Toft',   roles:['Kitchen'],                     priority:80,  palIdx:0, contractType:'hourly', contractPeriod:'week',  wage:170,   maxHours:60, availability:fullWeek},
        {id:'t9', name:'Ida Fog',       roles:['Bartender','Waiter','Kitchen'],priority:80,  palIdx:1, contractType:'hourly', contractPeriod:'week',  wage:168,   maxHours:60, availability:fullWeek},
        {id:'t10',name:'Jacob Ry',      roles:['Bartender'],                   priority:80,  palIdx:2, contractType:'hourly', contractPeriod:'week',  wage:165,   maxHours:60, availability:fullWeek},
      ];
      const updates={};
      getMonthOffsets(displayMonth).forEach(off=>{
        const wd=getWeekDates(off);
        // Jitter priority per week so a different mix of same-tier staff gets
        // picked each week — otherwise buildSchedule is deterministic and every
        // week ends up identical.
        const weekEmployees=testEmployees.map(e=>({...e,priority:e.priority+Math.floor(Math.random()*30)}));
        const{schedule:s,total,noMgr}=buildSchedule(weekEmployees,blocks,wd,timeOff,allRoles);
        const notes=noMgr.length?t('sched.notesGaps',{total,n:noMgr.length}):t('sched.notesOk',{total});
        const warnings=noMgr.map(({day,block})=>'⚠️ '+t('sched.noMgr',{day:t('day.'+day),block}));
        updates[weekKey(off)]={schedule:s,notes,warnings};
      });
      setEmployees(testEmployees);
      setSchedules(p=>({...p,...updates}));
      setCalMode('month');
      setGenerating(false);
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
  const duplicateEmp=emp=>setEmployees(p=>[...p,{...JSON.parse(JSON.stringify(emp)),id:String(Date.now()),name:emp.name+' (copy)',palIdx:p.length%EMP_PALETTE.length}]);
  const removeEmp   =id=>{setEmployees(p=>p.filter(e=>e.id!==id));if(expandedEmp===id)setExpandedEmp(null);};
  const addEmployee =()=>{
    if(!newEmp.name.trim())return;
    setEmployees(p=>[...p,{...newEmp,id:String(Date.now()),palIdx:p.length%EMP_PALETTE.length,availability:Object.fromEntries(DAYS.map(d=>[d,null]))}]);
    setNewEmp({name:'',roles:['Manager'],priority:100,contractType:'hourly',contractPeriod:'week',wage:0,maxHours:40});setShowAddEmp(false);
  };

  const addTO         =()=>{if(!newTO.empId)return;setTimeOff(p=>[...p,{...newTO,id:String(Date.now())}]);setNewTO({empId:'',startDate:todayISO(),endDate:todayISO(),type:'Holiday',note:'',status:'Pending'});setShowAddTO(false);};
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
  const cDot=s=>({full:{bg:'#D4F0E2',border:'#5AAE80',text:'#236040'},partial:{bg:'#FBF0D5',border:'#D4A830',text:'#7A5010'},low:{bg:'#F5E2E2',border:'#D06060',text:'#783030'},empty:{bg:T.bg,border:T.border,text:T.text3}}[s]);
  const filteredTO=timeOff.filter(to=>{if(toFilter==='pending')return to.status==='Pending';if(toFilter==='approved')return to.status==='Approved';if(toFilter==='this-week')return wkISOs.some(iso=>to.startDate<=iso&&to.endDate>=iso);return true;}).sort((a,b)=>a.startDate.localeCompare(b.startDate));
  const navItems=[{k:'schedule',l:t('nav.schedule')},{k:'employees',l:t('nav.employees')},{k:'timeoff',l:pendingCount?`${t('nav.timeoff')} · ${pendingCount}`:t('nav.timeoff')},{k:'coverage',l:t('nav.coverage')},{k:'costs',l:t('nav.costs')}];
  const notes=weekData?.notes||'',warnings=weekData?.warnings||[];

  const s=styles;

  return (
    <div style={{minHeight:'100vh',width:'100vw',background:T.bg,backgroundImage:isDark()?'radial-gradient(circle at 12% 6%, rgba(217,122,74,0.07), transparent 38%), radial-gradient(circle at 88% 94%, rgba(95,174,122,0.06), transparent 42%)':'radial-gradient(circle at 12% 6%, rgba(191,90,44,0.045), transparent 38%), radial-gradient(circle at 88% 94%, rgba(61,122,82,0.04), transparent 42%)',fontFamily:"'Hanken Grotesk',sans-serif",color:T.text,fontSize:13}}>
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

      <div style={{maxWidth:1100,margin:'0 auto',padding:isMobile?'20px 14px':'24px 20px'}}>

{/* SCHEDULE */}
{view==='schedule'&&(<div>
  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:20,flexWrap:'wrap'}}>
    <div style={{display:'flex',alignItems:'center',gap:4,background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:3}}>
      <button onClick={()=>{if(calMode==='month'){setDisplayMonth(p=>p.m===0?{y:p.y-1,m:11}:{y:p.y,m:p.m-1});}else{setWeekOffset(w=>w-1);}}} style={{padding:'4px 10px',borderRadius:6,background:'none',border:'none',cursor:'pointer',color:T.text2,fontFamily:'inherit',fontSize:13}}>‹</button>
      <span style={{fontSize:13,fontWeight:500,minWidth:calMode==='month'?120:150,textAlign:'center',color:T.text,padding:'0 4px'}}>{calMode==='month'?new Date(displayMonth.y,displayMonth.m,1).toLocaleDateString('en-GB',{month:'long',year:'numeric'}):`${fmt(weekDates[0])} – ${fmt(weekDates[6])}`}</span>
      <button onClick={()=>{if(calMode==='month'){setDisplayMonth(p=>p.m===11?{y:p.y+1,m:0}:{y:p.y,m:p.m+1});}else{setWeekOffset(w=>w+1);}}} style={{padding:'4px 10px',borderRadius:6,background:'none',border:'none',cursor:'pointer',color:T.text2,fontFamily:'inherit',fontSize:13}}>›</button>
    </div>
    <button onClick={()=>{setWeekOffset(0);const n=new Date();setDisplayMonth({y:n.getFullYear(),m:n.getMonth()});}} style={{padding:'5px 12px',borderRadius:8,background:T.surface,border:`1px solid ${T.border}`,cursor:'pointer',fontSize:12,color:T.text2,fontFamily:'inherit'}}>{t('common.today')}</button>
    <div style={{display:'flex',background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:3,gap:2}}>
      {[['week',t('sched.week')],['month',t('sched.month')],['grid',t('sched.grid')],['staff',t('sched.staff')]].map(([k,l])=><button key={k} onClick={()=>setCalMode(k)} style={{padding:'4px 12px',borderRadius:6,background:calMode===k?T.bg:'transparent',border:calMode===k?`1px solid ${T.border}`:'1px solid transparent',cursor:'pointer',fontSize:12,fontWeight:calMode===k?500:400,color:calMode===k?T.text:T.text2,fontFamily:'inherit'}}>{l}</button>)}
    </div>
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

{/* STAFF VIEW */}
{calMode==='staff'&&(!schedule?(<div style={{...s.card,textAlign:'center',padding:'52px 32px',position:'relative',overflow:'hidden'}}>
  <div style={{position:'absolute',inset:0,backgroundImage:`radial-gradient(circle, ${T.border} 1px, transparent 1px)`,backgroundSize:'24px 24px',opacity:0.5,pointerEvents:'none'}}/>
  <div style={{position:'relative'}}><div style={{fontSize:40,marginBottom:16,opacity:0.25}}>📋</div><div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:22,marginBottom:8}}>{t('staff.noRota')}</div><div style={{fontSize:13,color:T.text2,marginBottom:24}}>{t('staff.noRotaDesc')}</div><Btn onClick={()=>generate()}>{'✦ '+t('staff.generateWeek')}</Btn></div>
</div>):(<div>
  {/* Sticky controls + day header — stays visible while scrolling the staff list */}
  <div style={{position:'sticky',top:56,zIndex:20,background:T.bg,paddingTop:8,marginTop:-8,marginBottom:16}}>
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12,flexWrap:'wrap',gap:10}}>
    <div><div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:22,fontWeight:500,color:T.text}}>{t('staff.weeklyRota')}</div><div style={{fontSize:13,color:T.text2,marginTop:2}}>{fmt(weekDates[0])} – {fmt(weekDates[6])} · {t('common.staffN',{n:employees.length})}</div></div>
    <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
      {allRoles.filter(r=>employees.some(e=>(e.roles||[]).includes(r))).map(r=><RoleBadge key={r} role={r} rs={roleStyles[r]}/>)}
      <div style={{width:1,height:16,background:T.border}}/>
      {confirmed?<span style={{fontSize:12,color:T.success,fontWeight:500,background:T.successLight,padding:'2px 10px',borderRadius:999,border:`1px solid ${T.success}33`}}>✓ {t('sched.confirmed')}</span>:<span style={{fontSize:12,color:T.text3,background:T.surfaceWarm,padding:'2px 10px',borderRadius:999,border:`1px solid ${T.border}`}}>{t('sched.draft')}</span>}
      {!confirmed&&<Btn small onClick={confirmSchedule}>{t('sched.confirm')}</Btn>}
      <Btn small variant="danger" onClick={deleteSchedule}>{t('common.delete')}</Btn>
    </div>
  </div>
  <div style={{...s.cardFlush,padding:0}}>
    <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',background:T.surfaceWarm}}>
      {DAYS.map((day,di)=>{const date=weekDates[di],isToday=dateToISO(date)===dateToISO(new Date());return(
        <div key={day} style={{padding:'8px 10px',borderRight:di<6?`1px solid ${T.border}`:'none',background:isToday?T.accentLight:'transparent'}}>
          <div style={{fontSize:11,fontWeight:600,color:isToday?T.accent:T.text2,textTransform:'uppercase',letterSpacing:'0.05em'}}>{t('day.'+day)}<span style={{fontWeight:400,marginLeft:4,textTransform:'none'}}>{date.getDate()}</span></div>
        </div>
      );})}
    </div>
  </div>
  </div>
  <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:16}}>
    {employees.map(emp=>{const h=empHours(emp.id),p=pal(emp);return(
      <div key={emp.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,overflow:'hidden'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',background:`linear-gradient(to right, ${isDark()?p.dot+'18':p.bg}, ${T.surface})`,borderBottom:`1px solid ${T.border}`}}>
          <Avatar emp={emp} size={36}/>
          <div style={{flex:1}}><div style={{fontSize:14,fontWeight:600,color:T.text}}>{emp.name}</div><div style={{display:'flex',gap:3,flexWrap:'wrap',marginTop:2}}>{(emp.roles||[]).map(r=><RoleBadge key={r} role={r} rs={roleStyles[r]}/>)}</div></div>
          <div style={{textAlign:'right'}}><div style={{fontSize:13,fontWeight:600,color:h>emp.maxHours?T.danger:h===0?T.text3:T.text}}>{h}h</div><div style={{fontSize:10,color:T.text3}}>{t('staff.ofMax',{n:emp.maxHours})}</div></div>
          <div style={{width:60,height:5,borderRadius:999,background:T.border,overflow:'hidden'}}><div style={{height:'100%',width:`${Math.min(100,(h/emp.maxHours)*100)}%`,borderRadius:999,background:h>emp.maxHours?T.danger:h/emp.maxHours>0.8?T.warning:T.success}}/></div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)'}}>
          {DAYS.map((day,di)=>{const date=weekDates[di],onTO=isOnTimeOff(emp.id,date,timeOff),ab=blocks.find(b=>(schedule[day]?.[b.id]||[]).some(a=>a.empId===emp.id));return(
            <div key={day} style={{padding:'10px 10px',borderRight:di<6?`1px solid ${T.border}`:'none',background:di>=5?T.surfaceWarm:'transparent',minHeight:56,display:'flex',flexDirection:'column',justifyContent:'center',gap:3}}>
              {onTO?<span style={{fontSize:11,color:T.warning,fontWeight:500}}>{'🌴 '+t('staff.leave')}</span>:ab?<div><div style={{fontSize:11,fontWeight:500,color:T.text}}>{ab.name}</div><div style={{fontSize:10,color:T.text3}}>{ab.start}–{ab.end}</div></div>:<span style={{fontSize:12,color:T.border}}>—</span>}
            </div>);})}
        </div>
      </div>);})}
  </div>
  <div style={{marginTop:16,padding:'12px 16px',background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,display:'flex',gap:20,flexWrap:'wrap',alignItems:'center'}}>
    <span style={{fontSize:11,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em'}}>{t('staff.weekSummary')}</span>
    <span style={{fontSize:12,color:T.text2}}><b style={{color:T.text}}>{employees.reduce((acc,e)=>acc+empHours(e.id),0)}h</b>{t('staff.totalHours')}</span>
    <span style={{fontSize:12,color:T.text2}}><b style={{color:T.text}}>{employees.filter(e=>empHours(e.id)>0).length}</b>{t('staff.staffWorking',{n:employees.length})}</span>
    {offThisWeek.length>0&&<span style={{fontSize:12,color:T.warning}}><b>{offThisWeek.length}</b>{t('staff.onLeaveCount')}</span>}
  </div>
</div>))}

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
    <div style={{position:'sticky',top:56,zIndex:20,background:T.bg,paddingTop:8,marginTop:-8}}>
      <div style={{display:'flex',gap:8,marginBottom:12,alignItems:'center',flexWrap:'wrap'}}>
        <div style={{display:'flex',alignItems:'center',gap:2,background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:3}}>
          <button onClick={()=>setWeekOffset(w=>w-1)} style={{padding:'3px 8px',borderRadius:6,background:'none',border:'none',cursor:'pointer',color:T.text2,fontFamily:'inherit',fontSize:13}}>‹</button>
          <span style={{fontSize:12,fontWeight:500,minWidth:100,textAlign:'center',color:T.text}}>{fmt(weekDates[0])} – {fmt(weekDates[6])}</span>
          <button onClick={()=>setWeekOffset(w=>w+1)} style={{padding:'3px 8px',borderRadius:6,background:'none',border:'none',cursor:'pointer',color:T.text2,fontFamily:'inherit',fontSize:13}}>›</button>
        </div>
        <button onClick={()=>setWeekOffset(0)} style={{padding:'5px 10px',borderRadius:8,background:T.surface,border:`1px solid ${T.border}`,cursor:'pointer',fontSize:12,color:T.text2,fontFamily:'inherit'}}>{t('common.today')}</button>
        <div style={{width:1,height:18,background:T.border}}/>
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
            return(<div key={day} style={{padding:gridTight?'10px 8px':'14px 12px',textAlign:'center',borderRight:i<6?`1px solid ${T.border}`:'none',background:isToday?T.accentLight:'transparent'}}>
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
              {!gridTight&&<div style={{width:36,height:36,borderRadius:'50%',background:p.bg,color:p.text,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,flexShrink:0,border:`2px solid ${p.dot}33`}}>{initials(emp.name)}</div>}
              <div style={{minWidth:0}}>
                <div style={{fontSize:gridTight?12:14,fontWeight:600,color:T.text,lineHeight:1.2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{gridTight?emp.name.split(' ')[0]:emp.name}</div>
                {!gridTight&&<div style={{fontSize:11,color:T.text3,marginTop:2}}>{emp.name.split(' ').slice(1).join(' ')}</div>}
                {!gridTight&&<div style={{display:'flex',gap:3,marginTop:3,flexWrap:'wrap'}}>{(emp.roles||[]).slice(0,2).map(r=>{const rs=roleStyles[r]||{dot:'#9C9088',bg:'#F2F1EF',text:'#5C5248',border:'#C8C4BE'};return<span key={r} style={{fontSize:9,fontWeight:600,color:isDark()?rs.dot:rs.text,background:isDark()?rs.dot+'22':rs.bg,border:`1px solid ${isDark()?rs.dot+'55':rs.border}`,padding:'1px 5px',borderRadius:999}}>{r}</span>;})}</div>}
              </div>
            </div>
            {/* Day cells */}
            {DAYS.map((day,di)=>{
              const date=weekDates[di];
              const onTO=isOnTimeOff(emp.id,date,timeOff);
              const assignedBlocks=blocks.filter(b=>(schedule[day]?.[b.id]||[]).some(a=>a.empId===emp.id));
              const isToday=dateToISO(date)===dateToISO(new Date());
              return(<div key={day} style={{padding:gridTight?'6px 5px':'8px 7px',borderRight:di<6?`1px solid ${T.border}`:'none',display:'flex',flexDirection:'column',gap:4,justifyContent:'center',minHeight:rowH,background:isToday?(isDark()?T.accent+'11':T.accentLight+'66'):'transparent'}}>
                {onTO?(
                  <div style={{padding:gridTight?'4px 7px':'7px 9px',borderRadius:7,background:T.warningLight,border:`1px solid ${T.warning}44`,textAlign:'center'}}>
                    <div style={{fontSize:gridTight?11:13}}>🌴</div>
                    {!gridTight&&<div style={{fontSize:10,fontWeight:500,color:T.warning,marginTop:1}}>Leave</div>}
                  </div>
                ):assignedBlocks.length>0?assignedBlocks.map(b=>{
                  const bh=blockHours(b);
                  const shiftEntry=(schedule[day]?.[b.id]||[]).find(a=>a.empId===emp.id);
                  const shiftRole=shiftEntry?.role;
                  const rrs=shiftRole?(roleStyles[shiftRole]||{dot:'#9C9088',bg:'#F2F1EF',text:'#5C5248',border:'#C8C4BE'}):null;
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
</div>):(<div style={{display:'flex',flexDirection:'column',gap:16}}>
  {blocks.map(block=>(
    <div key={block.id} style={s.cardFlush}>
      <div style={{padding:'12px 20px',borderBottom:`1px solid ${T.border}`,background:T.surfaceWarm,display:'flex',alignItems:'center',gap:12}}>
        <div style={{flex:1}}><span style={{fontFamily:'Fraunces, Georgia, serif',fontSize:15,fontWeight:500}}>{block.name}</span><span style={{fontSize:12,color:T.text3,marginLeft:10}}>{block.start} – {block.end} · {blockHours(block).toFixed(1)}h</span></div>
        <span style={{fontSize:10,color:T.success,background:T.successLight,border:`1px solid ${T.success}33`,padding:'2px 8px',borderRadius:999,fontWeight:500}}>{t('week.managerEnforced')}</span>
      </div>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',minWidth:580}}>
          <thead><tr>
            <th style={{width:90,textAlign:'left',padding:'10px 20px',fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em',background:T.surfaceWarm,borderBottom:`1px solid ${T.border}`}}>{t('week.role')}</th>
            {DAYS.map((day,i)=><th key={day} style={{textAlign:'left',padding:'10px 10px',fontSize:11,fontWeight:500,color:T.text,background:T.surfaceWarm,borderBottom:`1px solid ${T.border}`}}>{t('day.'+day)}<div style={{fontSize:10,fontWeight:400,color:T.text3}}>{fmt(weekDates[i])}</div></th>)}
          </tr></thead>
          <tbody>
            {allRoles.map(role=>{
              const anyDay=DAYS.some(day=>{const r=getBlockRoles(block,day)[role]||0,g=(schedule[day]?.[block.id]||[]).filter(a=>a.role===role).length;return r>0||g>0;});
              if(!anyDay)return null;
              const rs=roleStyles[role]||DEFAULT_ROLE_STYLES.Other;
              return(<tr key={role} style={{borderBottom:`1px solid ${T.border}`}}>
                <td style={{padding:'10px 20px',verticalAlign:'top',background:T.surface}}><RoleBadge role={role} rs={rs}/></td>
                {DAYS.map(day=>{
                  const allA=schedule[day]?.[block.id]||[],assigned=allA.filter(a=>a.role===role),req=getBlockRoles(block,day)[role]||0,gap=Math.max(0,req-assigned.length),isTarget=selected&&selected.role===role&&selected.day!==day;
                  return(<td key={day} style={{padding:'8px 10px',verticalAlign:'top',borderLeft:`1px solid ${T.border}`,background:T.surface}}>
                    <div style={{display:'flex',flexDirection:'column',gap:3}}>
                      {assigned.map((a,idx)=>{const emp=employees.find(e=>e.id===a.empId),realIdx=allA.findIndex(x=>x.empId===a.empId),isSel=selected?.empId===a.empId&&selected?.day===day&&selected?.blockId===block.id;return<EmpChip key={idx} emp={emp||{name:a.name,palIdx:0}} selected={isSel} onClick={()=>handleSlotClick(day,block.id,a,realIdx)}/>;})}
                      {gap>0&&(<div style={{position:'relative'}}>
                        <button onClick={()=>{if(selected&&isTarget){handleEmptySlotClick(day,block.id,role);return;}if(!selected)setOpenPicker(p=>p&&p.day===day&&p.blockId===block.id&&p.role===role?null:{day,blockId:block.id,role});}} style={{display:'inline-flex',alignItems:'center',gap:3,padding:'2px 7px',borderRadius:999,fontSize:10,fontWeight:500,background:isTarget?T.successLight:T.dangerLight,color:isTarget?T.success:T.danger,border:`1px dashed ${isTarget?T.success:T.danger}55`,cursor:'pointer',fontFamily:'inherit'}}>{isTarget?t('week.moveHere'):t('week.shortCount',{n:gap})}</button>
                        {!selected&&openPicker?.day===day&&openPicker?.blockId===block.id&&openPicker?.role===role&&(()=>{const eligible=eligibleForSlot(day,block.id,role);return(<div style={{position:'absolute',top:'100%',left:0,marginTop:4,background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,boxShadow:'0 4px 16px rgba(28,24,21,0.12)',zIndex:200,minWidth:180,maxWidth:240,padding:8}}>
                          <div style={{fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em',padding:'2px 4px 6px'}}>{t('week.addRoleDay',{role,day:t('day.'+day)})}</div>
                          {eligible.length===0?<div style={{fontSize:11,color:T.text3,padding:'6px 4px',fontStyle:'italic'}}>{t('week.noneAvailable')}</div>:eligible.map(emp=>{const p=pal(emp);return(<button key={emp.id} onClick={()=>addToSlot(day,block.id,role,emp)} style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'6px 8px',borderRadius:7,background:'transparent',border:'none',cursor:'pointer',fontFamily:'inherit',textAlign:'left'}} onMouseEnter={e=>e.currentTarget.style.background=T.surfaceWarm} onMouseLeave={e=>e.currentTarget.style.background='transparent'}><div style={{width:24,height:24,borderRadius:'50%',background:p.bg,color:p.text,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700}}>{initials(emp.name)}</div><div><div style={{fontSize:12,fontWeight:500,color:T.text}}>{emp.name}</div><div style={{fontSize:10,color:T.text3}}>{empHours(emp.id)}h / {emp.maxHours}h</div></div></button>);})}
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
      </div>
    </div>
  ))}
  <div style={s.card}>
    <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:15,fontWeight:500,marginBottom:14}}>{t('week.weeklyHours')}</div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:10}}>
      {employees.map(emp=>{const h=empHours(emp.id),pct=Math.min(100,(h/emp.maxHours)*100),over=h>emp.maxHours;return(<div key={emp.id} style={{padding:'10px 12px',borderRadius:10,border:`1px solid ${over?T.danger+'55':T.border}`,background:over?T.dangerLight:T.surfaceWarm}}>
        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}><Avatar emp={emp} size={24}/><span style={{fontSize:12,fontWeight:500}}>{emp.name.split(' ')[0]}</span></div>
        <div style={{fontSize:13,fontWeight:500,color:over?T.danger:T.text,marginBottom:4}}>{h}h <span style={{fontSize:11,color:T.text3,fontWeight:400}}>/ {emp.maxHours}h</span></div>
        <div style={{height:3,borderRadius:999,background:T.border,overflow:'hidden'}}><div style={{height:'100%',width:`${pct}%`,borderRadius:999,background:over?T.danger:pct>80?T.warning:T.success}}/></div>
      </div>);})}
    </div>
  </div>
</div>))}
</div>)}

{/* EMPLOYEES */}
{view==='employees'&&(<div style={{display:'flex',flexDirection:'column',gap:10}}>
  {employees.map(emp=>(<div key={emp.id} style={s.card}>
    <div style={{display:'flex',alignItems:'center',gap:12}}>
      <Avatar emp={emp} size={40}/>
      <div style={{flex:1}}>
        <div style={{fontSize:14,fontWeight:500,display:'flex',alignItems:'center',gap:8,marginBottom:3,flexWrap:'wrap'}}>{emp.name}{(emp.roles||[]).map(r=><RoleBadge key={r} role={r} rs={roleStyles[r]}/>)}</div>
        <div style={{fontSize:12,color:T.text2}}>{(emp.contractType||'hourly')==='hourly'?`${emp.wage||'—'} kr/h`:`${(emp.wage||0).toLocaleString('da-DK')} kr/mo`} · max {emp.maxHours}h/{(emp.contractPeriod||'week')==='month'?'month':'week'}</div>
      </div>
      <div style={{display:'flex',gap:6}}>
        <Btn onClick={()=>duplicateEmp(emp)} variant="ghost" small>{'⧉ '+t('emp.clone')}</Btn>
        <Btn onClick={()=>setExpandedEmp(expandedEmp===emp.id?null:emp.id)} variant={expandedEmp===emp.id?'secondary':'ghost'} small>{expandedEmp===emp.id?t('common.close'):t('common.edit')}</Btn>
        <Btn onClick={()=>removeEmp(emp.id)} variant="danger" small>✕</Btn>
      </div>
    </div>
    {expandedEmp===emp.id&&(<div style={{marginTop:18,paddingTop:18,borderTop:`1px solid ${T.border}`}}>
      <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
        <div style={{flex:'2 1 120px'}}><SectionLabel>{t('emp.name')}</SectionLabel><input value={emp.name} onChange={e=>updateEmp(emp.id,'name',e.target.value)} style={s.input}/></div>
      </div>
      <div style={{marginBottom:12}}>
        <SectionLabel>{t('emp.roles')}</SectionLabel>
        <div style={{display:'flex',gap:5,flexWrap:'wrap',marginTop:4}}>
          {allRoles.map(r=>{const active=(emp.roles||[]).includes(r),rs=roleStyles[r]||DEFAULT_ROLE_STYLES.Other;return<button key={r} onClick={()=>{const cur=emp.roles||[];const next=active?cur.filter(x=>x!==r):[...cur,r];if(next.length>0)updateEmp(emp.id,'roles',next);}} style={{display:'inline-flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:999,fontSize:11,fontWeight:500,background:active?rs.bg:'transparent',color:active?rs.text:T.text3,border:`1px solid ${active?rs.border:T.border}`,cursor:'pointer',fontFamily:'inherit'}}><span style={{width:5,height:5,borderRadius:'50%',background:active?rs.dot:T.text3}}/>{r}</button>;})}
        </div>
      </div>
      <div style={{background:T.surfaceWarm,border:`1px solid ${T.border}`,borderRadius:10,padding:'12px 14px',marginBottom:12}}>
        <SectionLabel>{t('emp.contract')}</SectionLabel>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:6,alignItems:'flex-start'}}>
          <div style={{flex:'1 1 140px'}}><div style={{fontSize:11,color:T.text3,marginBottom:4}}>{t('emp.paidBy')}</div><div style={{display:'flex',gap:3}}>{[['hourly',t('emp.hourly')],['fixed',t('emp.fixedSalary')]].map(([k,l])=><button key={k} onClick={()=>updateEmp(emp.id,'contractType',k)} style={{flex:1,padding:'5px 8px',borderRadius:7,fontSize:11,fontWeight:(emp.contractType||'hourly')===k?600:400,background:(emp.contractType||'hourly')===k?T.surface:'transparent',border:`1px solid ${T.border}`,cursor:'pointer',fontFamily:'inherit',color:(emp.contractType||'hourly')===k?T.text:T.text2}}>{l}</button>)}</div></div>
          <div style={{flex:'1 1 130px'}}><div style={{fontSize:11,color:T.text3,marginBottom:4}}>{t('emp.period')}</div><div style={{display:'flex',gap:3}}>{[['week',t('emp.perWeek')],['month',t('emp.perMonth')]].map(([k,l])=><button key={k} onClick={()=>updateEmp(emp.id,'contractPeriod',k)} style={{flex:1,padding:'5px 8px',borderRadius:7,fontSize:11,fontWeight:(emp.contractPeriod||'week')===k?600:400,background:(emp.contractPeriod||'week')===k?T.surface:'transparent',border:`1px solid ${T.border}`,cursor:'pointer',fontFamily:'inherit',color:(emp.contractPeriod||'week')===k?T.text:T.text2}}>{l}</button>)}</div></div>
          <div style={{flex:'1 1 110px'}}><div style={{fontSize:11,color:T.text3,marginBottom:4}}>{(emp.contractType||'hourly')==='hourly'?t('emp.hourlyRate'):t('emp.monthlySalary')}</div><div style={{display:'flex',alignItems:'center',gap:5}}><input type="number" min="0" step="1" value={emp.wage||0} onChange={e=>updateEmp(emp.id,'wage',Number(e.target.value))} style={{...s.input,flex:1}}/><span style={{fontSize:11,color:T.text3,flexShrink:0}}>{(emp.contractType||'hourly')==='hourly'?'kr/h':'kr/mo'}</span></div></div>
          <div style={{flex:'1 1 90px'}}><div style={{fontSize:11,color:T.text3,marginBottom:4}}>{(emp.contractPeriod||'week')==='month'?t('emp.maxHMonth'):t('emp.maxHWeek')}</div><input type="number" min="4" max="250" value={emp.maxHours} onChange={e=>updateEmp(emp.id,'maxHours',Number(e.target.value))} style={s.input}/></div>
          <div style={{flex:'1 1 80px'}}><div style={{fontSize:11,color:T.text3,marginBottom:4}}>{t('emp.priority')} %</div><input type="number" min="10" max="200" step="5" value={emp.priority||100} onChange={e=>updateEmp(emp.id,'priority',Number(e.target.value))} style={s.input}/><div style={{fontSize:9,color:T.text3,marginTop:3}}>{t('emp.lowerFirst')}</div></div>
        </div>
      </div>
      <div style={{marginBottom:10}}><SectionLabel>{t('emp.quickTemplates')}</SectionLabel><div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:4}}>{Object.keys(AVAIL_TEMPLATES).map(tpl=><button key={tpl} onClick={()=>applyTemplate(emp.id,tpl)} style={{padding:'4px 10px',borderRadius:6,fontSize:11,cursor:'pointer',background:T.surfaceWarm,border:`1px solid ${T.border}`,color:T.text2,fontFamily:'inherit'}}>{tpl}</button>)}</div></div>
      <SectionLabel>{t('emp.weeklyAvail')}</SectionLabel>
      <div style={{display:'flex',flexDirection:'column',gap:6,marginTop:6}}>
        {DAYS.map(day=>{const avail=emp.availability[day],p=pal(emp);return(<div key={day} style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
          <button onClick={()=>toggleDay(emp.id,day)} style={{width:46,padding:'4px 0',borderRadius:6,fontSize:11,fontWeight:500,cursor:'pointer',background:avail?p.bg:'transparent',color:avail?p.text:T.text3,border:`1px solid ${avail?p.dot+'55':T.border}`,textAlign:'center',fontFamily:'inherit'}}>{t('day.'+day)}</button>
          {avail?(<><span style={{fontSize:11,color:T.text3}}>{t('common.fromCap')}</span><input type="time" value={avail.from} onChange={e=>updateAvail(emp.id,day,'from',e.target.value)} style={{...s.input,width:'auto',padding:'4px 8px',fontSize:12}}/><span style={{fontSize:11,color:T.text3}}>{t('common.toLower')}</span><input type="time" value={avail.to} onChange={e=>updateAvail(emp.id,day,'to',e.target.value)} style={{...s.input,width:'auto',padding:'4px 8px',fontSize:12}}/><span style={{fontSize:11,color:T.text3}}>{(()=>{const sv=toMin(avail.from);let ev=toMin(avail.to);if(ev<=sv)ev+=1440;return`${((ev-sv)/60).toFixed(1)}h`;})()}</span></>):<span style={{fontSize:11,color:T.text3}}>{t('emp.notAvailable')}</span>}
        </div>);})}
      </div>
    </div>)}
  </div>))}
  {showAddEmp&&(<div style={s.card}>
    <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:15,fontWeight:500,marginBottom:14}}>{t('emp.newEmployee')}</div>
    <div style={{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap'}}>
      <input placeholder={t('emp.fullName')} value={newEmp.name} onChange={e=>setNewEmp(p=>({...p,name:e.target.value}))} style={{...s.input,flex:'2 1 130px'}} autoFocus/>
      <div style={{flex:'2 1 200px'}}><div style={{fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>{t('emp.roles')}</div><div style={{display:'flex',gap:4,flexWrap:'wrap'}}>{allRoles.map(r=>{const active=(newEmp.roles||[]).includes(r),rs=roleStyles[r]||DEFAULT_ROLE_STYLES.Other;return<button key={r} onClick={()=>{const cur=newEmp.roles||[];const next=active?cur.filter(x=>x!==r):[...cur,r];if(next.length>0)setNewEmp(p=>({...p,roles:next}));}} style={{display:'inline-flex',alignItems:'center',gap:4,padding:'4px 9px',borderRadius:999,fontSize:11,fontWeight:500,background:active?rs.bg:'transparent',color:active?rs.text:T.text3,border:`1px solid ${active?rs.border:T.border}`,cursor:'pointer',fontFamily:'inherit'}}><span style={{width:5,height:5,borderRadius:'50%',background:active?rs.dot:T.text3}}/>{r}</button>;})}
      </div></div>
    </div>
    <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap',alignItems:'flex-start'}}>
      <div style={{flex:'1 1 120px'}}><div style={{fontSize:11,color:T.text3,marginBottom:3}}>{t('emp.paidBy')}</div><div style={{display:'flex',gap:3}}>{[['hourly',t('emp.hourly')],['fixed',t('emp.fixed')]].map(([k,l])=><button key={k} onClick={()=>setNewEmp(p=>({...p,contractType:k}))} style={{flex:1,padding:'5px 6px',borderRadius:7,fontSize:11,fontWeight:(newEmp.contractType||'hourly')===k?600:400,background:(newEmp.contractType||'hourly')===k?T.bg:'transparent',border:`1px solid ${T.border}`,cursor:'pointer',fontFamily:'inherit',color:(newEmp.contractType||'hourly')===k?T.text:T.text2}}>{l}</button>)}</div></div>
      <div style={{flex:'1 1 120px'}}><div style={{fontSize:11,color:T.text3,marginBottom:3}}>{t('emp.period')}</div><div style={{display:'flex',gap:3}}>{[['week',t('emp.week')],['month',t('emp.month')]].map(([k,l])=><button key={k} onClick={()=>setNewEmp(p=>({...p,contractPeriod:k}))} style={{flex:1,padding:'5px 6px',borderRadius:7,fontSize:11,fontWeight:(newEmp.contractPeriod||'week')===k?600:400,background:(newEmp.contractPeriod||'week')===k?T.bg:'transparent',border:`1px solid ${T.border}`,cursor:'pointer',fontFamily:'inherit',color:(newEmp.contractPeriod||'week')===k?T.text:T.text2}}>{l}</button>)}</div></div>
      <div style={{flex:'1 1 100px'}}><div style={{fontSize:11,color:T.text3,marginBottom:3}}>{(newEmp.contractType||'hourly')==='hourly'?t('emp.hourlyRate'):t('emp.monthlySalary')}</div><div style={{display:'flex',gap:4,alignItems:'center'}}><input type="number" min="0" step="1" value={newEmp.wage||0} onChange={e=>setNewEmp(p=>({...p,wage:Number(e.target.value)}))} style={{...s.input,flex:1}}/><span style={{fontSize:11,color:T.text3,flexShrink:0}}>{(newEmp.contractType||'hourly')==='hourly'?'kr/h':'kr/mo'}</span></div></div>
      <div style={{flex:'1 1 70px'}}><div style={{fontSize:11,color:T.text3,marginBottom:3}}>{(newEmp.contractPeriod||'week')==='month'?t('emp.maxHMo'):t('emp.maxHWk')}</div><input type="number" min="4" max="250" value={newEmp.maxHours} onChange={e=>setNewEmp(p=>({...p,maxHours:Number(e.target.value)}))} style={s.input}/></div>
      <div style={{flex:'1 1 70px'}}><div style={{fontSize:11,color:T.text3,marginBottom:3}}>{t('emp.priority')} %</div><input type="number" min="10" max="200" step="5" value={newEmp.priority||100} onChange={e=>setNewEmp(p=>({...p,priority:Number(e.target.value)}))} style={s.input}/></div>
    </div>
    <div style={{display:'flex',gap:8}}><Btn onClick={addEmployee}>{t('emp.addEmployee')}</Btn><Btn onClick={()=>setShowAddEmp(false)} variant="ghost">{t('common.cancel')}</Btn></div>
  </div>)}
  {!showAddEmp&&<Btn onClick={()=>setShowAddEmp(true)} variant="secondary">{t('emp.addEmployeeBtn')}</Btn>}
</div>)}

{view==='employees'&&<TeamAccess orgId={orgId} orgName={orgName} isOwner={isOwner} s={s} t={t}/>}

{/* TIME OFF */}
{view==='timeoff'&&(<div style={{display:'flex',flexDirection:'column',gap:12}}>
  {offThisWeek.length>0&&(<div style={{background:T.warningLight,border:`1px solid ${T.warning}33`,borderRadius:10,padding:'12px 16px'}}>
    <div style={{fontSize:12,fontWeight:600,color:T.warning,marginBottom:8}}>🌴 {t('sched.onLeaveWeek')} ({fmt(weekDates[0])} – {fmt(weekDates[6])})</div>
    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{offThisWeek.map(e=><EmpChip key={e.id} emp={e}/>)}</div>
  </div>)}
  <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
    <div style={{display:'flex',background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:3,gap:2}}>
      {[['all',t('to.all')],['pending',t('to.pending')],['approved',t('to.approved')],['this-week',t('to.thisWeek')]].map(([k,l])=><button key={k} onClick={()=>setToFilter(k)} style={{padding:'4px 10px',borderRadius:6,background:toFilter===k?T.bg:'transparent',border:toFilter===k?`1px solid ${T.border}`:'1px solid transparent',cursor:'pointer',fontSize:12,fontWeight:toFilter===k?500:400,color:toFilter===k?T.text:T.text2,fontFamily:'inherit'}}>{l}</button>)}
    </div>
    <div style={{marginLeft:'auto'}}><Btn onClick={()=>setShowAddTO(true)}>{t('to.addRequest')}</Btn></div>
  </div>
  {showAddTO&&(<div style={s.card}>
    <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:15,fontWeight:500,marginBottom:14}}>{t('to.newRequest')}</div>
    <div style={{display:'flex',gap:10,marginBottom:12,flexWrap:'wrap'}}>
      <div style={{flex:'2 1 140px'}}><SectionLabel>{t('to.employee')}</SectionLabel><select value={newTO.empId} onChange={e=>setNewTO(p=>({...p,empId:e.target.value}))} style={s.select}><option value="">{t('to.selectEllipsis')}</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
      <div style={{flex:'1 1 120px'}}><SectionLabel>{t('common.fromCap')}</SectionLabel><input type="date" value={newTO.startDate} onChange={e=>setNewTO(p=>({...p,startDate:e.target.value}))} style={s.input}/></div>
      <div style={{flex:'1 1 120px'}}><SectionLabel>{t('common.toCap')}</SectionLabel><input type="date" value={newTO.endDate} onChange={e=>setNewTO(p=>({...p,endDate:e.target.value}))} style={s.input}/></div>
      <div style={{flex:'1 1 100px'}}><SectionLabel>{t('to.type')}</SectionLabel><select value={newTO.type} onChange={e=>setNewTO(p=>({...p,type:e.target.value}))} style={s.select}>{TIMEOFF_TYPES.map(tt=><option key={tt} value={tt}>{tt}</option>)}</select></div>
      <div style={{flex:'2 1 140px'}}><SectionLabel>{t('to.note')}</SectionLabel><input placeholder={t('to.optional')} value={newTO.note} onChange={e=>setNewTO(p=>({...p,note:e.target.value}))} style={s.input}/></div>
      <div style={{flex:'1 1 100px'}}><SectionLabel>{t('to.status')}</SectionLabel><select value={newTO.status} onChange={e=>setNewTO(p=>({...p,status:e.target.value}))} style={s.select}><option>Pending</option><option>Approved</option></select></div>
    </div>
    <div style={{display:'flex',gap:8}}><Btn onClick={addTO}>{t('to.saveRequest')}</Btn><Btn onClick={()=>setShowAddTO(false)} variant="ghost">{t('common.cancel')}</Btn></div>
  </div>)}
  {filteredTO.length===0?(<div style={{...s.card,textAlign:'center',padding:'44px 32px',position:'relative',overflow:'hidden'}}>
    <div style={{position:'absolute',inset:0,backgroundImage:`radial-gradient(circle, ${T.border} 1px, transparent 1px)`,backgroundSize:'24px 24px',opacity:0.4,pointerEvents:'none'}}/>
    <div style={{position:'relative'}}><div style={{fontSize:36,marginBottom:12,opacity:0.25}}>🌴</div><div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:18,color:T.text,marginBottom:6}}>{toFilter!=='all'?t('to.noneFilter',{filter:t('to.'+(toFilter==='this-week'?'thisWeek':toFilter)).toLowerCase()}):t('to.noneYet')}</div>{toFilter==='all'&&<Btn onClick={()=>setShowAddTO(true)}>{t('to.addFirst')}</Btn>}</div>
  </div>):filteredTO.map(to=>{
    const emp=employees.find(e=>e.id===to.empId),days=Math.round((new Date(to.endDate)-new Date(to.startDate))/(24*3600*1000))+1,borderColor={Approved:T.success,Pending:T.warning,Rejected:T.danger}[to.status]||T.border;
    return(<div key={to.id} style={{...s.card,borderLeft:`3px solid ${borderColor}`,padding:'14px 18px',display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
      {emp&&<Avatar emp={emp} size={38}/>}
      <div style={{flex:1,minWidth:140}}>
        <div style={{fontSize:13,fontWeight:500,marginBottom:3}}>{emp?.name||t('to.unknown')}</div>
        <div style={{fontSize:12,color:T.text2}}>{fmtLong(to.startDate)} – {fmtLong(to.endDate)} · <b>{days}</b> {t.n('to.dayUnit',days)}</div>
        <div style={{display:'flex',gap:6,marginTop:4,alignItems:'center'}}>
          <span style={{fontSize:11,color:T.text3,background:T.bg,padding:'1px 7px',borderRadius:999,border:`1px solid ${T.border}`}}>{to.type}</span>
          {to.note&&<span style={{fontSize:11,color:T.text3,fontStyle:'italic'}}>"{to.note}"</span>}
        </div>
      </div>
      <StatusBadge status={to.status}/>
      <div style={{display:'flex',gap:6}}>
        {to.status!=='Approved'&&<Btn onClick={()=>updateTOStatus(to.id,'Approved')} variant="success" small>{t('to.approve')}</Btn>}
        {to.status!=='Rejected'&&<Btn onClick={()=>updateTOStatus(to.id,'Rejected')} variant="danger" small>{t('to.reject')}</Btn>}
        {to.status==='Rejected'&&<Btn onClick={()=>updateTOStatus(to.id,'Pending')} variant="ghost" small>{t('to.reset')}</Btn>}
        <Btn onClick={()=>removeTO(to.id)} variant="ghost" small>✕</Btn>
      </div>
    </div>);
  })}
</div>)}

{/* COVERAGE */}
{view==='coverage'&&(<div style={{display:'flex',flexDirection:'column',gap:12}}>
  <div style={s.card}>
    <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:15,fontWeight:500,marginBottom:4}}>{t('cov.roles')}</div>
    <div style={{fontSize:12,color:T.text2,marginBottom:14}}>{t('cov.rolesDesc')}</div>
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
      {allRoles.map(role=>{
        const rs=roleStyles[role]||{dot:'#9C9088',bg:'#F2F1EF',text:'#5C5248',border:'#C8C4BE'},isProtected=role==='Manager',isEditing=editingRole?.name===role,isDeleting=confirmDelete===role;
        if(isEditing)return(<div key={role} style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',padding:'10px 12px',borderRadius:10,background:T.surfaceWarm,border:`1px solid ${T.border}`}}>
          <input autoFocus value={editingRole.newName} onChange={e=>setEditingRole(p=>({...p,newName:e.target.value}))} style={{...s.input,width:130,flex:'0 0 auto'}}/>
          <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>{ROLE_COLOR_PALETTE.map((p,i)=><button key={i} onClick={()=>setEditingRole(p=>({...p,colorIdx:i}))} style={{width:20,height:20,borderRadius:'50%',background:p.dot,border:editingRole.colorIdx===i?`2px solid ${T.text}`:'2px solid transparent',cursor:'pointer',padding:0}}/>)}</div>
          <div style={{display:'flex',gap:6,marginLeft:'auto'}}>
            <Btn small onClick={()=>{const{name,newName,colorIdx}=editingRole;if(!newName.trim())return;const ns=ROLE_COLOR_PALETTE[colorIdx];if(newName!==name){setRoleStyles(p=>{const n={...p};delete n[name];return{...n,[newName]:ns};});setEmployees(p=>p.map(e=>({...e,roles:(e.roles||[]).map(r=>r===name?newName:r)})));setBlocks(p=>p.map(b=>{const nr={...b.roles};const val=nr[name]||0;delete nr[name];return{...b,roles:{...nr,[newName]:val}};}));}else{setRoleStyles(p=>({...p,[name]:ns}));}setEditingRole(null);}}>{t('common.save')}</Btn>
            <Btn small variant="ghost" onClick={()=>setEditingRole(null)}>{t('common.cancel')}</Btn>
          </div>
        </div>);
        if(isDeleting)return(<div key={role} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:10,background:T.dangerLight,border:`1px solid ${T.danger}33`}}>
          <span style={{fontSize:12,color:T.danger,flex:1}}>{t('cov.removeRolePre')}<b>{role}</b>{t('cov.removeRolePost')}</span>
          <Btn small variant="danger" onClick={()=>{setRoleStyles(p=>{const n={...p};delete n[role];return n;});setEmployees(p=>p.map(e=>({...e,roles:(e.roles||[]).filter(r=>r!==role)})));setBlocks(p=>p.map(b=>{const nr={...b.roles};delete nr[role];return{...b,roles:nr};}));setConfirmDelete(null);}}>{t('cov.yesRemove')}</Btn>
          <Btn small variant="ghost" onClick={()=>setConfirmDelete(null)}>{t('common.cancel')}</Btn>
        </div>);
        return(<div key={role} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',borderRadius:10,background:T.surfaceWarm,border:`1px solid ${T.border}`}}>
          <div style={{width:10,height:10,borderRadius:'50%',background:rs.dot,flexShrink:0}}/>
          <span style={{fontSize:13,fontWeight:500,color:T.text,flex:1}}>{role}</span>
          {isProtected&&<span style={{fontSize:11,color:T.text3,fontStyle:'italic'}}>{t('cov.protected')}</span>}
          {!isProtected&&<div style={{display:'flex',gap:4}}><Btn small variant="ghost" onClick={()=>{const ci=ROLE_COLOR_PALETTE.findIndex(p=>p.dot===rs.dot);setEditingRole({name:role,newName:role,colorIdx:ci>=0?ci:0});}}>{t('common.edit')}</Btn><Btn small variant="danger" onClick={()=>setConfirmDelete(role)}>{t('common.remove')}</Btn></div>}
          {isProtected&&<Btn small variant="ghost" onClick={()=>{const ci=ROLE_COLOR_PALETTE.findIndex(p=>p.dot===rs.dot);setEditingRole({name:role,newName:role,colorIdx:ci>=0?ci:0});}}>{t('cov.editColour')}</Btn>}
        </div>);
      })}
      <AddRoleInline t={t} onAdd={name=>{if(!name.trim()||roleStyles[name])return;const idx=Object.keys(roleStyles).length%ROLE_COLOR_PALETTE.length;setRoleStyles(p=>({...p,[name]:ROLE_COLOR_PALETTE[idx]}));}}/>
    </div>
  </div>
  <div style={{fontSize:13,color:T.text2,background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:'12px 16px'}}>{t('cov.blocksDesc')}</div>
  {blocks.map(block=>{
    const overrides=block.overrides||{},daysWithOverride=DAYS.filter(d=>overrides[d]);
    const updDefRole=(role,val)=>setBlocks(p=>p.map(b=>b.id===block.id?{...b,roles:{...b.roles,[role]:Math.max(0,Number(val))}}:b));
    const updOvRole=(day,role,val)=>setBlocks(p=>p.map(b=>{if(b.id!==block.id)return b;const ov={...b.overrides||{}};ov[day]={...(ov[day]||{...b.roles}),[role]:Math.max(0,Number(val))};return{...b,overrides:ov};}));
    const addDayOv=day=>setBlocks(p=>p.map(b=>{if(b.id!==block.id)return b;const ov={...b.overrides||{}};ov[day]={...b.roles};return{...b,overrides:ov};}));
    const remDayOv=day=>setBlocks(p=>p.map(b=>{if(b.id!==block.id)return b;const ov={...b.overrides||{}};delete ov[day];return{...b,overrides:Object.keys(ov).length?ov:undefined};}));
    return(<div key={block.id} style={s.card}>
      <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap',alignItems:'flex-end'}}>
        <div style={{flex:'2 1 100px'}}><SectionLabel>{t('cov.blockName')}</SectionLabel><input value={block.name} onChange={e=>setBlocks(p=>p.map(b=>b.id===block.id?{...b,name:e.target.value}:b))} style={s.input}/></div>
        <div style={{flex:'1 1 80px'}}><SectionLabel>{t('cov.start')}</SectionLabel><input type="time" value={block.start} onChange={e=>setBlocks(p=>p.map(b=>b.id===block.id?{...b,start:e.target.value}:b))} style={s.input}/></div>
        <div style={{flex:'1 1 80px'}}><SectionLabel>{t('cov.end')}</SectionLabel><input type="time" value={block.end} onChange={e=>setBlocks(p=>p.map(b=>b.id===block.id?{...b,end:e.target.value}:b))} style={s.input}/></div>
        <div style={{flex:'0 0 auto'}}><SectionLabel>{t('cov.duration')}</SectionLabel><div style={{fontSize:13,color:T.text2,padding:'7px 0'}}>{blockHours(block).toFixed(1)}h</div></div>
        <Btn onClick={()=>setBlocks(p=>p.filter(b=>b.id!==block.id))} variant="danger" small>{t('common.remove')}</Btn>
      </div>
      <SectionLabel>{t('cov.defaultStaffing')}</SectionLabel>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:6,marginBottom:16}}>
        {allRoles.map(role=>{const rs=roleStyles[role]||DEFAULT_ROLE_STYLES.Other;return(<div key={role} style={{display:'flex',alignItems:'center',gap:6,background:isDark()?rs.dot+'30':rs.bg,border:`1px solid ${isDark()?rs.dot+'80':rs.border}`,borderRadius:8,padding:'6px 10px'}}>
          <span style={{fontSize:11,fontWeight:500,color:isDark()?rs.dot:rs.text}}>{role}</span>
          <input type="number" min="0" max="99" value={block.roles[role]||0} onChange={e=>updDefRole(role,e.target.value)} style={{width:36,textAlign:'center',padding:'3px 4px',fontSize:12,borderRadius:5,border:`1px solid ${rs.border}`,background:isDark()?'rgba(255,255,255,0.08)':'rgba(255,255,255,0.6)',color:isDark()?rs.dot:rs.text,fontFamily:'inherit'}}/>
        </div>);})}
      </div>
      <SectionLabel>{t('cov.dayOverrides')}</SectionLabel>
      <div style={{marginTop:6,display:'flex',flexDirection:'column',gap:8}}>
        {daysWithOverride.map(day=>{const dr=overrides[day];return(<div key={day} style={{background:T.surfaceWarm,border:`1px solid ${T.border}`,borderRadius:10,padding:'10px 12px'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}><span style={{fontSize:12,fontWeight:600,color:T.text,width:36}}>{t('day.'+day)}</span><span style={{fontSize:11,color:T.text3,flex:1}}>{t('cov.customStaffing',{day:t('day.'+day)})}</span><Btn small variant="ghost" onClick={()=>remDayOv(day)}>{t('cov.removeX')}</Btn></div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{allRoles.map(role=>{const rs=roleStyles[role]||DEFAULT_ROLE_STYLES.Other,isChanged=(dr[role]||0)!==(block.roles[role]||0);return(<div key={role} style={{display:'flex',alignItems:'center',gap:6,background:isDark()?rs.dot+'30':rs.bg,border:`1.5px solid ${isChanged?rs.dot:isDark()?rs.dot+'80':rs.border}`,borderRadius:8,padding:'6px 10px'}}><span style={{fontSize:11,fontWeight:500,color:isDark()?rs.dot:rs.text}}>{role}</span><input type="number" min="0" max="99" value={dr[role]||0} onChange={e=>updOvRole(day,role,e.target.value)} style={{width:36,textAlign:'center',padding:'3px 4px',fontSize:12,borderRadius:5,border:`1px solid ${rs.border}`,background:isDark()?'rgba(255,255,255,0.08)':'rgba(255,255,255,0.6)',color:isDark()?rs.dot:rs.text,fontFamily:'inherit'}}/>{isChanged&&<span style={{fontSize:9,color:rs.dot,fontWeight:600}}>↑</span>}</div>);})}
          </div>
        </div>);})}
        <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}><span style={{fontSize:11,color:T.text3}}>{t('cov.addOverrideFor')}</span>
          {DAYS.filter(d=>!overrides[d]).map(day=><button key={day} onClick={()=>addDayOv(day)} style={{padding:'3px 10px',borderRadius:999,fontSize:11,fontWeight:500,cursor:'pointer',background:'transparent',border:`1px dashed ${T.border}`,color:T.text2,fontFamily:'inherit'}} onMouseEnter={e=>{e.target.style.borderColor=T.accent;e.target.style.color=T.accent;}} onMouseLeave={e=>{e.target.style.borderColor=T.border;e.target.style.color=T.text2;}}>{'+ '+t('day.'+day)}</button>)}
          {DAYS.every(d=>overrides[d])&&<span style={{fontSize:11,color:T.text3,fontStyle:'italic'}}>{t('cov.allDaysCustom')}</span>}
        </div>
      </div>
    </div>);
  })}
  <div><Btn onClick={()=>setBlocks(p=>[...p,{id:`b${Date.now()}`,name:'New Block',start:'09:00',end:'17:00',roles:Object.fromEntries(allRoles.map(r=>[r,0]))}])} variant="secondary">{t('cov.addBlock')}</Btn></div>
</div>)}

{/* COSTS */}
{view==='costs'&&(<div style={{display:'flex',flexDirection:'column',gap:16}}>
  <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
    <div style={{display:'flex',background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:3,gap:2}}>
      {[['week',t('cost.thisWeek')],['month',t('cost.thisMonth')]].map(([k,l])=><button key={k} onClick={()=>setCostsMode(k)} style={{padding:'4px 14px',borderRadius:6,background:costsMode===k?T.bg:'transparent',border:costsMode===k?`1px solid ${T.border}`:'1px solid transparent',cursor:'pointer',fontSize:12,fontWeight:costsMode===k?500:400,color:costsMode===k?T.text:T.text2,fontFamily:'inherit'}}>{l}</button>)}
    </div>
    {costsMode==='month'&&<span style={{fontSize:12,color:T.text2}}>{new Date(displayMonth.y,displayMonth.m,1).toLocaleDateString('en-GB',{month:'long',year:'numeric'})} — {t('cost.weeksGenerated',{a:getMonthOffsets(displayMonth).filter(off=>schedules[weekKey(off)]).length,b:getMonthOffsets(displayMonth).length})}</span>}
    {costsMode==='week'&&schedule&&<span style={{fontSize:12,color:T.text2}}>{fmt(weekDates[0])} – {fmt(weekDates[6])}</span>}
    <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6,background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:'4px 10px'}}>
      <span style={{fontSize:11,color:T.text3}}>{t('cost.baseRate')}</span>
      <input type="number" min="1" step="1" value={hourlyRate.amount} onChange={e=>setHourlyRate(p=>({...p,amount:Math.max(1,Number(e.target.value))}))} style={{width:60,padding:'2px 6px',borderRadius:5,border:`1px solid ${T.border}`,fontSize:12,fontFamily:'inherit',textAlign:'right',background:T.surfaceWarm}}/>
      <input value={hourlyRate.currency} onChange={e=>setHourlyRate(p=>({...p,currency:e.target.value.slice(0,5)}))} style={{width:36,padding:'2px 4px',borderRadius:5,border:`1px solid ${T.border}`,fontSize:12,fontFamily:'inherit',background:T.surfaceWarm}}/>
      <span style={{fontSize:11,color:T.text3}}>/h</span>
    </div>
  </div>
  {((costsMode!=='month'&&!schedule)||(costsMode==='month'&&!getMonthOffsets(displayMonth).some(off=>schedules[weekKey(off)])))?(<div style={{...s.card,textAlign:'center',padding:'52px 32px',position:'relative',overflow:'hidden'}}>
    <div style={{position:'absolute',inset:0,backgroundImage:`radial-gradient(circle, ${T.border} 1px, transparent 1px)`,backgroundSize:'24px 24px',opacity:0.5,pointerEvents:'none'}}/>
    <div style={{position:'relative'}}><div style={{fontSize:36,marginBottom:12,opacity:0.25}}>💷</div><div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:20,marginBottom:8}}>{t('cost.noSchedule')}</div><div style={{fontSize:13,color:T.text2,marginBottom:20}}>{t('cost.noScheduleDesc')}</div><Btn onClick={()=>setView('schedule')}>{t('cost.goToSchedule')}</Btn></div>
  </div>):(()=>{
    const data=costsMode==='month'?monthCostData:costData,totalCost=costsMode==='month'?totalMonthCostUnits:totalCostUnits,maxCost=costsMode==='month'?maxMonthCostUnits:maxCostUnits,roleCosts=costsMode==='month'?monthRoleCosts:weekRoleCosts,maxRC=Math.max(...Object.values(roleCosts),0.01),workingCount=data.filter(d=>d.hours>0).length,totalHours=data.reduce((sv,d)=>sv+d.hours,0);
    return(<>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:12}}>
        {[{label:t('cost.estimatedCost'),value:toMoney(totalCost),sub:t('cost.estimatedCostSub',{rate:hourlyRate.amount,cur:hourlyRate.currency}),color:T.accent},{label:t('cost.totalHours'),value:totalHours+'h',sub:costsMode==='month'?t('cost.thisMonthSub'):t('cost.thisWeekSub'),color:T.text},{label:t('cost.staffScheduled'),value:`${workingCount} ${t('cost.ofN',{n:employees.length})}`,sub:costsMode==='month'?t('cost.staffMonthSub',{n:getMonthOffsets(displayMonth).filter(off=>schedules[weekKey(off)]).length}):t('cost.staffWeekSub'),color:T.success},{label:t('cost.avgCost'),value:workingCount>0?toMoney(totalCost/workingCount):'—',sub:t('cost.avgCostSub'),color:T.text2}].map(({label,value,sub,color})=>(<div key={label} style={{...s.card,padding:'14px 16px'}}><div style={{fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:6}}>{label}</div><div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:22,fontWeight:500,color,marginBottom:2}}>{value}</div><div style={{fontSize:11,color:T.text3}}>{sub}</div></div>))}
      </div>
      <div style={s.card}>
        <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:15,fontWeight:500,marginBottom:4}}>{t('cost.empBreakdown')}</div>
        <div style={{fontSize:12,color:T.text2,marginBottom:16}}>{t('cost.empBreakdownDesc')}</div>
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          {[...data].sort((a,b)=>b.costUnits-a.costUnits).map(({emp,hours,costUnits})=>{const p=pal(emp),pct=maxCost>0?(costUnits/maxCost*100):0,isOff=weekDates.some(d=>isOnTimeOff(emp.id,d,timeOff));return(
            <div key={emp.id} style={{display:'grid',gridTemplateColumns:'160px 48px 52px 1fr 80px',alignItems:'center',gap:10,padding:'8px 0',borderBottom:`1px solid ${T.border}`}}>
              <div style={{display:'flex',alignItems:'center',gap:8,minWidth:0}}><Avatar emp={emp} size={26}/><div style={{minWidth:0}}><div style={{fontSize:12,fontWeight:500,color:T.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{emp.name}</div><div style={{display:'flex',gap:3,flexWrap:'wrap',marginTop:1}}>{(emp.roles||[]).slice(0,2).map(r=><RoleBadge key={r} role={r} rs={roleStyles[r]}/>)}</div></div></div>
              <div style={{textAlign:'center'}}><div style={{fontSize:12,fontWeight:500,color:T.text}}>{emp.priority||100}%</div><div style={{fontSize:10,color:T.text3}}>{t('emp.priority')}</div></div>
              <div style={{textAlign:'center'}}><div style={{fontSize:12,fontWeight:500,color:hours>emp.maxHours?T.danger:T.text}}>{hours}h</div><div style={{fontSize:10,color:T.text3}}>{t('cost.ofN',{n:emp.maxHours})}</div></div>
              <div style={{position:'relative',height:8,background:T.border,borderRadius:999,overflow:'hidden'}}><div style={{position:'absolute',left:0,top:0,height:'100%',width:`${pct}%`,background:hours===0?T.border:p.dot,borderRadius:999}}/></div>
              <div style={{textAlign:'right'}}>{isOff&&costsMode!=='month'?<span style={{fontSize:10,color:T.warning}}>{'🌴 '+t('cost.off')}</span>:<div><div style={{fontSize:12,fontWeight:600,color:hours===0?T.text3:T.text}}>{hours===0?'—':toMoney(costUnits)}</div><div style={{fontSize:10,color:T.text3}}>{hours>0?`idx ${costUnits.toFixed(1)}`:''}</div></div>}</div>
            </div>);})}
        </div>
      </div>
      <div style={s.card}>
        <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:15,fontWeight:500,marginBottom:16}}>{t('cost.costByRole')}</div>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {Object.entries(roleCosts).filter(([,v])=>v>0).sort(([,a],[,b])=>b-a).map(([role,cost])=>{const rs=roleStyles[role]||{dot:'#9C9088'},pct=maxRC>0?(cost/maxRC*100):0,cnt=data.filter(d=>(d.emp.roles||[]).includes(role)&&d.hours>0).length;return(
            <div key={role} style={{display:'grid',gridTemplateColumns:'110px 1fr 80px',alignItems:'center',gap:12}}>
              <RoleBadge role={role} rs={rs}/>
              <div style={{position:'relative',height:10,background:T.border,borderRadius:999,overflow:'hidden'}}><div style={{position:'absolute',left:0,top:0,height:'100%',width:`${pct}%`,background:rs.dot,borderRadius:999}}/></div>
              <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end'}}><span style={{fontSize:13,fontWeight:600,color:T.text}}>{toMoney(cost)}</span><span style={{fontSize:10,color:T.text3}}>{cnt} staff</span></div>
            </div>);})}
          {Object.values(roleCosts).every(v=>v===0)&&<div style={{fontSize:13,color:T.text3,textAlign:'center',padding:'16px 0'}}>{t('cost.noHours')}</div>}
        </div>
      </div>
      <div style={{fontSize:12,color:T.text2,background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:'10px 14px'}}>💡 {t('cost.infoBox')}</div>
    </>);
  })()}
</div>)}

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
      if(data.session) acceptPendingInvitations().catch(console.error);
    });
    const{data:sub}=supabase.auth.onAuthStateChange((_e,s)=>{
      setSession(s);
      if(s) acceptPendingInvitations().then(()=>setOrgTick(t=>t+1)).catch(console.error);
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
