import { useState } from "react";
import { T, styles, DAYS } from "../lib/constants";

export default function TemplateEditor({name,displayName,availability,t,dl,onRename,onToggleDay,onUpdate,onDelete,onClose}){
  const [nameVal,setNameVal]=useState(displayName);
  const [dirty,setDirty]=useState(false);
  const commitName=()=>{ if(!dirty) return; const n=nameVal.trim(); if(n&&n!==name) onRename(name,n); };
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(33,27,21,0.35)',display:'flex',alignItems:'center',justifyContent:'center',padding:16,zIndex:50}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,padding:20,width:'min(560px,100%)',maxHeight:'85vh',overflowY:'auto',boxShadow:'0 20px 50px -20px rgba(33,27,21,0.5)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,gap:12}}>
          <input value={nameVal} onChange={e=>{ setNameVal(e.target.value); setDirty(true); }} onBlur={commitName} onKeyDown={e=>{ if(e.key==='Enter') commitName(); }} style={{...styles.input,fontSize:15,fontWeight:600,flex:1}}/>
          <button onClick={onClose} style={{padding:'6px 12px',borderRadius:8,background:'transparent',border:`1px solid ${T.border}`,color:T.text2,cursor:'pointer',fontSize:13,fontFamily:'inherit'}}>{t('common.done')}</button>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          {DAYS.map(day=>{ const a=availability[day]; return (
            <div key={day} style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
              <button onClick={()=>onToggleDay(name,day)} style={{width:46,padding:'4px 0',borderRadius:6,fontSize:11,fontWeight:500,cursor:'pointer',background:a?T.accentLight:'transparent',color:a?T.accentText:T.text3,border:`1px solid ${a?T.accent+'55':T.border}`,textAlign:'center',fontFamily:'inherit'}}>{dl(day)}</button>
              {a?(<><span style={{fontSize:11,color:T.text3}}>{t('common.fromCap')}</span><input type="time" value={a.from} onChange={e=>onUpdate(name,day,'from',e.target.value)} style={{...styles.input,width:'auto',padding:'4px 8px',fontSize:12}}/><span style={{fontSize:11,color:T.text3}}>{t('common.toLower')}</span><input type="time" value={a.to} onChange={e=>onUpdate(name,day,'to',e.target.value)} style={{...styles.input,width:'auto',padding:'4px 8px',fontSize:12}}/></>):(<span style={{fontSize:11,color:T.text3}}>{t('emp.notAvailable')}</span>)}
            </div>
          ); })}
        </div>
        <div style={{marginTop:18,paddingTop:14,borderTop:`1px solid ${T.border}`,display:'flex'}}>
          <button onClick={onDelete} style={{padding:'6px 14px',borderRadius:8,background:'transparent',border:`1px solid ${T.danger}55`,color:T.danger,cursor:'pointer',fontSize:13,fontFamily:'inherit'}}>{t('tpl.removeTitle')}</button>
        </div>
      </div>
    </div>
  );
}
