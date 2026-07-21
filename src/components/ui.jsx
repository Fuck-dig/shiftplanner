import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

import { T, pal, initials, isDark, DEFAULT_ROLE_STYLES } from "../lib/constants";



export function Avatar({emp,size=32}){ const p=pal(emp); return <div style={{width:size,height:size,borderRadius:'50%',background:isDark()?p.dot+'25':p.bg,color:isDark()?p.dot:p.text,display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*0.35,fontWeight:600,flexShrink:0,border:`1.5px solid ${p.dot}22`}}>{initials(emp.name)}</div>; }

export function RoleBadge({role,rs}){ const s=rs||DEFAULT_ROLE_STYLES.Other; return <span style={{display:'inline-flex',alignItems:'center',gap:4,padding:'2px 8px',borderRadius:999,fontSize:11,fontWeight:500,background:isDark()?s.dot+'22':s.bg,color:isDark()?s.dot:s.text,border:`1px solid ${isDark()?s.dot+'55':s.border}`}}><span style={{width:5,height:5,borderRadius:'50%',background:s.dot,flexShrink:0}}/>{role}</span>; }

export function EmpChip({emp,selected,onClick}){ const p=pal(emp); return <button onClick={onClick} style={{display:'inline-flex',alignItems:'center',gap:4,padding:'2px 8px 2px 4px',borderRadius:999,fontSize:11,fontWeight:500,background:selected?p.dot:(isDark()?p.dot+'22':p.bg),color:selected?'#fff':(isDark()?p.dot:p.text),border:`1px solid ${selected?p.dot:p.dot+'44'}`,cursor:onClick?'pointer':'default',transition:'all 0.15s',whiteSpace:'nowrap'}}><span style={{width:16,height:16,borderRadius:'50%',background:selected?'rgba(255,255,255,0.3)':p.dot,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:700,flexShrink:0}}>{initials(emp.name)}</span>{emp.name.split(' ')[0]}</button>; }

export function StatusBadge({status,label}){ const cfg={Approved:{bg:T.successLight,text:T.success,dot:'#3D7A52'},Pending:{bg:T.warningLight,text:T.warning,dot:'#956B18'},Rejected:{bg:T.dangerLight,text:T.danger,dot:'#963030'}}[status]||{}; return <span style={{display:'inline-flex',alignItems:'center',gap:4,padding:'2px 8px',borderRadius:999,fontSize:11,fontWeight:500,background:cfg.bg,color:cfg.text,border:`1px solid ${cfg.dot}33`}}><span style={{width:5,height:5,borderRadius:'50%',background:cfg.dot}}/>{label||status}</span>; }

export function Btn({children,onClick,disabled,variant='primary',small}){
  const base={fontFamily:'inherit',fontWeight:500,borderRadius:8,cursor:disabled?'wait':'pointer',border:'none',transition:'all 0.15s',fontSize:small?12:13,padding:small?'5px 12px':'7px 16px',opacity:disabled?0.6:1};
  const vs={primary:{background:T.accent,color:'#fff'},secondary:{background:T.surfaceWarm,color:T.text,border:`1px solid ${T.border}`},ghost:{background:'transparent',color:T.text2,border:`1px solid ${T.border}`},danger:{background:T.dangerLight,color:T.danger,border:`1px solid ${T.danger}33`},success:{background:T.successLight,color:T.success,border:`1px solid ${T.success}33`}};
  return <button onClick={onClick} disabled={disabled} style={{...base,...vs[variant]}}>{children}</button>;
}

export function SectionLabel({children}){ return <div style={{fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>{children}</div>; }

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
  const [text,setText]=useState(`${hh}:${mm}`);
  useEffect(()=>{ setText(`${hh}:${mm}`); },[hh,mm]);
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
      <button type="button" onClick={()=>setOpen(true)} title="Pick time" style={{border:'none',background:'none',cursor:'pointer',fontSize:small?12:13,opacity:0.55,padding:small?'2px 4px':'3px 6px',color:T.text,lineHeight:1}}>🕐</button>
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

