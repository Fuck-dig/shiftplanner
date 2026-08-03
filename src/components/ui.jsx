import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

import { T, pal, initials, isDark, DEFAULT_ROLE_STYLES } from "../lib/constants";
import { dateToISO, LOCALE } from "../lib/dates";


// Full-screen "loading" splash. Was copy-pasted identically into App.jsx,
// EmployeeView.jsx and KioskView.jsx; one definition now.
export function LoadingScreen() {
  return <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:T.bg,color:T.text3,fontFamily:"'Hanken Grotesk',sans-serif",fontSize:26}}><span style={{fontFamily:'Fraunces, Georgia, serif',opacity:0.5}}>Rorota</span></div>;
}

export function Avatar({emp,size=32}){ const p=pal(emp); return <div style={{width:size,height:size,borderRadius:'50%',background:isDark()?p.dot+'25':p.bg,color:isDark()?p.dot:p.text,display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*0.35,fontWeight:600,flexShrink:0,border:`1.5px solid ${p.dot}22`}}>{initials(emp.name)}</div>; }

// Drag-handle affordance drawn from plain dots rather than a unicode glyph —
// glyphs like ⠿ render inconsistently (or invisibly) across fonts/OSes.
export function GripDots({title}){
  return <span title={title} style={{display:'inline-grid',gridTemplateColumns:'repeat(2,3px)',gridAutoRows:'3px',gap:2,cursor:'grab',flexShrink:0}}>
    {Array.from({length:6}).map((_,i)=><span key={i} style={{width:3,height:3,borderRadius:'50%',background:T.text3}}/>)}
  </span>;
}

// maxWidth + ellipsis so a long custom role name shrinks to fit its column
// instead of pushing past it — roles are user-entered free text, so there's no
// length to rely on.
export function RoleBadge({role,rs}){ const s=rs||DEFAULT_ROLE_STYLES.Other; return <span title={role} style={{display:'inline-flex',alignItems:'center',gap:4,padding:'2px 8px',borderRadius:999,fontSize:11,fontWeight:500,background:isDark()?s.dot+'22':s.bg,color:isDark()?s.dot:s.text,border:`1px solid ${isDark()?s.dot+'55':s.border}`,maxWidth:'100%',boxSizing:'border-box'}}><span style={{width:5,height:5,borderRadius:'50%',background:s.dot,flexShrink:0}}/><span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{role}</span></span>; }

// The single way a person is rendered anywhere in a schedule — day cells, the
// isolated-day row, the on-leave strip. This replaced an older pill-shaped
// EmpChip that showed only a first name; having two visual treatments for the
// same thing made identical data look different depending on which view you
// were in, so there's now just this one.
//
// `time` and `status` are optional: pass the scheduled window and, if
// something was actually clocked (or a no-show recorded), a
// {text, tone:'good'|'bad'} to show underneath.
//
// `inline` swaps full-width for auto-width. Horizontal contexts (the on-leave
// strip, the isolated-day row) wrap several people across a line, where a
// 100%-width card would stack them one per row and look broken.
export function EmpCard({emp,selected,onClick,time,status,title,inline}){
  const p=pal(emp);
  const toneColor=status?.tone==='bad'?T.danger:T.success;
  return <button onClick={onClick} title={title} style={{display:inline?'inline-flex':'flex',alignItems:'center',gap:7,width:inline?'auto':'100%',maxWidth:'100%',padding:'6px 8px',borderRadius:9,background:selected?p.dot:(isDark()?p.dot+'1E':p.bg),border:`1px solid ${selected?p.dot:p.dot+'44'}`,cursor:onClick?'pointer':'default',transition:'box-shadow 0.15s,transform 0.15s,background 0.15s',fontFamily:'inherit',textAlign:'left',boxSizing:'border-box'}}
    onMouseEnter={e=>{if(!onClick)return;e.currentTarget.style.boxShadow=`0 0 0 2px ${p.dot}44`;e.currentTarget.style.transform='translateY(-1px)';}}
    onMouseLeave={e=>{e.currentTarget.style.boxShadow='none';e.currentTarget.style.transform='none';}}>
    <span style={{width:22,height:22,borderRadius:'50%',background:selected?'rgba(255,255,255,0.3)':p.dot,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,flexShrink:0}}>{initials(emp.name)}</span>
    <span style={{minWidth:0,flex:1}}>
      <span style={{display:'block',fontSize:12,fontWeight:600,color:selected?'#fff':(isDark()?p.dot:p.text),whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',lineHeight:1.25}}>{emp.name.split(' ')[0]}</span>
      {time&&<span style={{display:'block',fontSize:10,color:selected?'rgba(255,255,255,0.85)':(isDark()?p.dot+'AA':p.text),opacity:selected?1:0.75,whiteSpace:'nowrap',lineHeight:1.3}}>{time}</span>}
      {status&&<span style={{display:'block',fontSize:9,fontWeight:600,color:selected?'#fff':toneColor,whiteSpace:'nowrap',lineHeight:1.3}}>{status.text}</span>}
    </span>
  </button>;
}

// dot reuses T.success/warning/danger directly (not a separate hardcoded
// hex) so the small status dot and border track dark mode the same way the
// badge's own background/text already do via T.successLight etc — they'd
// previously been hardcoded to the light-mode value only, a real (if
// subtle) dark-mode bug rather than a deliberate design choice.
export function StatusBadge({status,label}){ const cfg={Approved:{bg:T.successLight,text:T.success,dot:T.success},Pending:{bg:T.warningLight,text:T.warning,dot:T.warning},Rejected:{bg:T.dangerLight,text:T.danger,dot:T.danger}}[status]||{}; return <span style={{display:'inline-flex',alignItems:'center',gap:4,padding:'2px 8px',borderRadius:999,fontSize:11,fontWeight:500,background:cfg.bg,color:cfg.text,border:`1px solid ${cfg.dot}33`}}><span style={{width:5,height:5,borderRadius:'50%',background:cfg.dot}}/>{label||status}</span>; }

// One row in any list of requests — a swap, an open shift, a claim waiting
// on a manager, a booked day off. They are all the same shape: WHO on the
// left, WHAT and WHEN in the middle, the action on the right.
//
// This exists because the staff Requests page had grown four different row
// shapes and the manager's queue a fifth, so the same swap looked like two
// unrelated things depending on who was logged in. Worse, the older shapes
// printed only a weekday — "Waiter · Thursday" — with no date and no shift
// block, which is not enough to decide whether to accept: you can't tell
// which Thursday, or whether it's the lunch or the dinner.
//
// `accent` marks a row as the kind of thing anyone can take (an open
// shift), as a left EDGE rather than a filled panel — a stack of fully
// tinted rows shouts louder than the content warrants.
export function RequestRow({emp,badge,title,subtitle,accent,children}){
  return (
    <div style={{display:'flex',alignItems:'center',gap:11,flexWrap:'wrap',padding:'10px 12px',borderRadius:10,background:T.surfaceWarm,border:`1px solid ${T.border}`,borderLeft:`3px solid ${accent?T.accent:T.border}`}}>
      {emp
        ? <Avatar emp={emp} size={32}/>
        : <div style={{width:32,height:32,borderRadius:'50%',flexShrink:0,background:T.accent+'22',color:T.accent,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700}}>?</div>}
      <span style={{flex:1,minWidth:150}}>
        <span style={{display:'flex',alignItems:'center',gap:7,flexWrap:'wrap'}}>
          {badge&&<span style={{fontSize:9,fontWeight:600,letterSpacing:'0.04em',textTransform:'uppercase',padding:'2px 7px',borderRadius:999,color:accent?T.accent:T.text2,background:accent?T.accent+'1E':T.bg,border:`1px solid ${accent?T.accent+'44':T.border}`}}>{badge}</span>}
          <span style={{fontSize:12,fontWeight:600,color:T.text}}>{title}</span>
        </span>
        {subtitle&&<span style={{display:'block',fontSize:11,color:T.text3,marginTop:2}}>{subtitle}</span>}
      </span>
      {children}
    </div>
  );
}

export function Btn({children,onClick,disabled,variant='primary',small}){
  const base={fontFamily:'inherit',fontWeight:500,borderRadius:8,cursor:disabled?'wait':'pointer',border:'none',transition:'all 0.15s',fontSize:small?12:13,padding:small?'5px 12px':'7px 16px',opacity:disabled?0.6:1};
  // `warning` is for "proceed even though something's off" actions (e.g.
  // moving someone onto a shift they're not available for) — distinct from
  // `danger`, which is for destructive things like delete.
  const vs={primary:{background:T.accent,color:'#fff'},secondary:{background:T.surfaceWarm,color:T.text,border:`1px solid ${T.border}`},ghost:{background:'transparent',color:T.text2,border:`1px solid ${T.border}`},danger:{background:T.dangerLight,color:T.danger,border:`1px solid ${T.danger}33`},warning:{background:T.warningLight,color:T.warning,border:`1px solid ${T.warning}33`},success:{background:T.successLight,color:T.success,border:`1px solid ${T.success}33`}};
  return <button onClick={onClick} disabled={disabled} style={{...base,...vs[variant]}}>{children}</button>;
}

export function SectionLabel({children}){ return <div style={{fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>{children}</div>; }

// The on/off pill switch used for every settings toggle in the app (email
// notifications, push notifications, "allow replies", etc.) — previously
// hand-copied inline in three different files with identical markup;
// consolidated here so there's one definition to change. `dim` is separate
// from `disabled` because the push toggle wants to grey out only for a
// genuinely blocked state (unsupported/denied), not for the brief `disabled`
// window while a subscribe/unsubscribe request is in flight.
export function Toggle({checked,onChange,disabled,dim,ariaLabel}){
  const isDim = dim!=null ? dim : disabled;
  return (
    <button onClick={onChange} disabled={disabled} aria-label={ariaLabel} aria-pressed={checked} style={{width:40,height:22,borderRadius:999,border:'none',cursor:disabled?'default':'pointer',padding:2,background:checked?T.accent:T.border,position:'relative',flexShrink:0,transition:'background 0.15s',opacity:isDim?0.5:1}}>
      <span style={{display:'block',width:18,height:18,borderRadius:'50%',background:'#fff',transform:checked?'translateX(18px)':'translateX(0)',transition:'transform 0.15s'}}/>
    </button>
  );
}

export function AddRoleInline({onAdd,t}){
  const [editing,setEditing]=useState(false);
  const [val,setVal]=useState('');
  if(!editing) return (
    <button onClick={()=>setEditing(true)} style={{display:'inline-flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:999,background:'transparent',border:`1px dashed ${T.border}`,color:T.text3,cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>{t('cov.addRole')}</button>
  );
  return (
    <div style={{display:'inline-flex',alignItems:'center',gap:4}}>
      <input autoFocus value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter'&&val.trim()){ onAdd(val.trim()); setVal(''); setEditing(false); } if(e.key==='Escape'){ setVal(''); setEditing(false); } }} placeholder={t('cov.roleName')+'…'} style={{padding:'4px 8px',borderRadius:6,border:`1px solid ${T.border}`,background:T.surface,color:T.text,fontSize:12,fontFamily:'inherit',width:110,outline:'none'}}/>
      <button onClick={()=>{ if(val.trim()){ onAdd(val.trim()); setVal(''); setEditing(false); } }} style={{padding:'4px 8px',borderRadius:6,background:T.accent,color:'#fff',border:'none',fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>{t('common.add')}</button>
      <button onClick={()=>{ setVal(''); setEditing(false); }} style={{padding:'4px 8px',borderRadius:6,background:'transparent',border:`1px solid ${T.border}`,color:T.text3,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>✕</button>
    </div>
  );
}

// A themed replacement for <input type="time"> — the native control renders
// its own browser/OS chrome that ignores page CSS (always shows up as a
// plain white popup even in dark mode). This opens a centered, scroll-locked
// modal (the same pattern used elsewhere in the app for pickers, since
// anchored popovers kept getting stranded on scroll) with two scrollable
// hour/minute columns instead.
export function TimePicker({value,onChange,small}){
  const [open,setOpen]=useState(false);
  const hourRef=useRef(null),minRef=useRef(null);
  const [hh,mm]=(value||'00:00').split(':');
  // `text` is genuinely local state (you can type a partial time into the
  // field), but it has to reset whenever the value prop changes from outside.
  // That was an effect, which meant rendering the stale text once and
  // correcting it on a second pass. This is React's documented
  // "adjusting state when a prop changes" pattern: compare against the last
  // prop value during render and correct immediately, no extra pass.
  const incoming=`${hh}:${mm}`;
  const [text,setText]=useState(incoming);
  const [lastValue,setLastValue]=useState(incoming);
  if(lastValue!==incoming){ setLastValue(incoming); setText(incoming); }
  const hours=Array.from({length:24},(_,i)=>String(i).padStart(2,'0'));
  const minutes=['00','05','10','15','20','25','30','35','40','45','50','55'];
  useEffect(()=>{
    if(!open)return;
    document.body.style.overflow='hidden';
    const t=setTimeout(()=>{
      hourRef.current?.querySelector('[data-sel="true"]')?.scrollIntoView({block:'center'});
      minRef.current?.querySelector('[data-sel="true"]')?.scrollIntoView({block:'center'});
    },0);
    return ()=>{ clearTimeout(t); document.body.style.overflow=''; };
  },[open]);
  const col=(items,current,pick,ref)=><div ref={ref} style={{flex:1,overflowY:'auto',padding:'6px 4px'}}>
    {items.map(v=>(<div key={v} data-sel={v===current?'true':undefined} onClick={()=>pick(v)} style={{padding:'7px 0',textAlign:'center',fontSize:15,fontWeight:v===current?700:400,color:v===current?'#fff':T.text,background:v===current?T.accent:'transparent',cursor:'pointer',borderRadius:8,margin:'0 4px'}}>{v}</div>))}
  </div>;
  const commitText=raw=>{
    const m=raw.trim().match(/^(\d{1,2}):?(\d{0,2})$/);
    if(!m){ setText(`${hh}:${mm}`); return; }
    let h=parseInt(m[1],10), mi=m[2]===''?0:parseInt(m[2],10);
    if(isNaN(h)||h<0||h>23||isNaN(mi)||mi<0||mi>59){ setText(`${hh}:${mm}`); return; }
    const nv=`${String(h).padStart(2,'0')}:${String(mi).padStart(2,'0')}`;
    setText(nv);
    if(nv!==`${hh}:${mm}`)onChange(nv);
  };
  return (<>
    <div style={{display:'inline-flex',alignItems:'center',gap:2,borderRadius:8,border:`1px solid ${T.border}`,background:T.surfaceWarm,padding:small?'2px 3px 2px 8px':'3px 4px 3px 10px'}}>
      <input value={text} onChange={e=>setText(e.target.value)} onBlur={e=>commitText(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter'){ commitText(e.target.value); e.target.blur(); } else if(e.key==='Escape'){ setText(`${hh}:${mm}`); e.target.blur(); } }} placeholder="00:00" style={{width:small?36:42,border:'none',background:'transparent',color:T.text,fontSize:small?12:13,fontWeight:500,fontFamily:'inherit',outline:'none',textAlign:'center',padding:small?'2px 0':'3px 0'}}/>
      <button type="button" onClick={()=>setOpen(true)} title="Pick time" style={{border:'none',background:'none',cursor:'pointer',fontSize:small?10:11,opacity:0.55,padding:small?'2px 4px':'3px 6px',color:T.text,lineHeight:1}}>▾</button>
    </div>
    {open&&createPortal(
      <div onClick={()=>setOpen(false)} style={{position:'fixed',inset:0,zIndex:400,background:'rgba(20,16,13,0.5)',display:'flex',alignItems:'center',justifyContent:'center',padding:20,fontFamily:"'Hanken Grotesk',sans-serif"}}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,width:220,maxHeight:'min(60vh,360px)',display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 24px 60px -16px rgba(0,0,0,0.5)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 14px',borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
            <span style={{fontSize:14,fontWeight:600,color:T.text}}>{hh}:{mm}</span>
            <button onClick={()=>setOpen(false)} style={{border:'none',background:'none',cursor:'pointer',color:T.accent,fontSize:13,fontWeight:500,fontFamily:'inherit'}}>Done</button>
          </div>
          <div style={{display:'flex',flex:1,minHeight:0,borderTop:`1px solid ${T.border}`}}>
            {col(hours,hh,v=>onChange(`${v}:${mm}`),hourRef)}
            <div style={{width:1,background:T.border}}/>
            {col(minutes,mm,v=>onChange(`${hh}:${v}`),minRef)}
          </div>
        </div>
      </div>
    ,document.body)}
  </>);
}

// A small calendar popover that opens under any trigger element (typically
// the "20 Jul – 26 Jul" / month-name label in a schedule nav bar) and lets
// the person jump straight to a week (or month) by clicking a day, instead
// of stepping through with the ‹ › arrows one at a time.
// - trigger: the element to render as the clickable label
// - value: a reference Date used to pick which month the popover opens on
// - onPick(date): called with the clicked Date; the caller decides what
//   that means (jump to that date's week, or that date's month, etc.)
// - highlightStart/highlightEnd: optional Dates (inclusive) shading the
//   currently-active week/range so the popup shows context, not just a bare
//   calendar
export function WeekPicker({trigger,value,onPick,highlightStart,highlightEnd}){
  const [open,setOpen]=useState(false);
  const [viewY,setViewY]=useState(()=>value.getFullYear());
  const [viewM,setViewM]=useState(()=>value.getMonth());
  const ref=useRef(null);
  // Opening the picker should always start on the selected date's month. This
  // used to be an effect keyed on `open`, which meant rendering the wrong month
  // first and correcting it immediately after; doing it in the opening click
  // is the same result in one pass.
  const openPicker=()=>{ setViewY(value.getFullYear()); setViewM(value.getMonth()); setOpen(true); };
  useEffect(()=>{
    if(!open)return;
    const onDoc=e=>{ if(ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onEsc=e=>{ if(e.key==='Escape') setOpen(false); };
    document.addEventListener('mousedown',onDoc);
    document.addEventListener('keydown',onEsc);
    return ()=>{ document.removeEventListener('mousedown',onDoc); document.removeEventListener('keydown',onEsc); };
  },[open]);
  const first=new Date(viewY,viewM,1);
  const fd=first.getDay();
  const gridStart=new Date(first); gridStart.setDate(1-(fd===0?6:fd-1));
  const days=Array.from({length:42},(_,i)=>{ const d=new Date(gridStart); d.setDate(gridStart.getDate()+i); return d; });
  const todayISOv=dateToISO(new Date());
  const hStart=highlightStart?dateToISO(highlightStart):null;
  const hEnd=highlightEnd?dateToISO(highlightEnd):null;
  const inRange=d=>{ if(!hStart||!hEnd)return false; const iso=dateToISO(d); return iso>=hStart&&iso<=hEnd; };
  const navBtn={padding:'4px 8px',borderRadius:6,background:'none',border:'none',cursor:'pointer',color:T.text2,fontFamily:'inherit',fontSize:12};
  return (
    <div ref={ref} style={{position:'relative',display:'inline-block'}}>
      <div onClick={()=>open?setOpen(false):openPicker()} style={{cursor:'pointer'}}>{trigger}</div>
      {open && (
        <div style={{position:'absolute',top:'calc(100% + 6px)',left:'50%',transform:'translateX(-50%)',zIndex:500,background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,boxShadow:'0 20px 50px -14px rgba(0,0,0,0.4)',padding:10,width:220}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
            <button onClick={()=>{ if(viewM===0){setViewY(y=>y-1);setViewM(11);} else setViewM(m=>m-1); }} style={navBtn}>‹</button>
            <span style={{fontSize:12,fontWeight:600,color:T.text}}>{first.toLocaleDateString(LOCALE,{month:'long',year:'numeric'})}</span>
            <button onClick={()=>{ if(viewM===11){setViewY(y=>y+1);setViewM(0);} else setViewM(m=>m+1); }} style={navBtn}>›</button>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2}}>
            {['M','T','W','T','F','S','S'].map((d,i)=><div key={i} style={{fontSize:9,color:T.text3,textAlign:'center',fontWeight:600,padding:'2px 0'}}>{d}</div>)}
            {days.map((d,i)=>{
              const otherMonth=d.getMonth()!==viewM;
              const isToday=dateToISO(d)===todayISOv;
              const active=inRange(d);
              return (
                <button key={i} onClick={()=>{ onPick(d); setOpen(false); }} style={{padding:'5px 0',fontSize:11,borderRadius:6,border:isToday?`1px solid ${T.accent}`:'1px solid transparent',background:active?T.accentLight:'transparent',color:otherMonth?T.text3:active?T.accent:T.text,fontWeight:active?600:400,cursor:'pointer',fontFamily:'inherit',opacity:otherMonth?0.4:1}}>
                  {d.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

