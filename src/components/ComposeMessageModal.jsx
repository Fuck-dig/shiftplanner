import { useState } from 'react';
import { T } from '../lib/constants';
import { Btn } from './ui';

// Manager-only compose UI for direct messages. Recipients can be everyone,
// everyone with a given role, or a hand-picked set of individuals — all
// three end up as the same flat array of employee ids handed to onSubmit,
// which fans out one row per recipient (see sendMessage in lib/data.js).
export default function ComposeMessageModal({ employees, allRoles, roleStyles, presetEmpIds, busy, onCancel, onSubmit, s, t }){
  const [scope, setScope] = useState(presetEmpIds?.length ? 'specific' : 'everyone'); // 'everyone' | 'role' | 'specific'
  const [role, setRole] = useState(allRoles[0] || '');
  const [pickedIds, setPickedIds] = useState(() => new Set(presetEmpIds || []));
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [allowReplies, setAllowReplies] = useState(false);

  const togglePicked = (id) => setPickedIds(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const recipients = scope === 'everyone' ? employees
    : scope === 'role' ? employees.filter(e => (e.roles||[]).includes(role))
    : employees.filter(e => pickedIds.has(e.id));

  const canSend = recipients.length > 0 && body.trim().length > 0;

  return (
    <div onClick={onCancel} style={{position:'fixed',inset:0,zIndex:300,background:'rgba(20,16,13,0.5)',display:'flex',alignItems:'center',justifyContent:'center',padding:20,fontFamily:"'Hanken Grotesk',sans-serif"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,width:'min(480px,100%)',maxHeight:'min(88vh,680px)',display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 24px 60px -16px rgba(0,0,0,0.5)'}}>
        <div style={{padding:'20px 20px 0'}}>
          <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:16,fontWeight:500,color:T.text,marginBottom:14}}>{t('msg.newMessage')}</div>
        </div>
        <div style={{padding:'0 20px',overflowY:'auto',flex:1}}>
          <div style={{fontSize:11,color:T.text3,marginBottom:6}}>{t('msg.sendTo')}</div>
          <div style={{display:'flex',gap:6,marginBottom:12}}>
            {[['everyone',t('msg.everyone')],['role',t('msg.byRole')],['specific',t('msg.specificPeople')]].map(([k,l])=>(
              <button key={k} onClick={()=>setScope(k)} style={{flex:1,padding:'7px 6px',borderRadius:8,fontSize:12,fontWeight:scope===k?600:400,background:scope===k?T.accentLight:'transparent',border:`1px solid ${scope===k?T.accent:T.border}`,color:scope===k?T.accentText:T.text2,cursor:'pointer',fontFamily:'inherit'}}>{l}</button>
            ))}
          </div>
          {scope==='role' && (
            <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
              {allRoles.map(r=>{
                const rs = roleStyles[r]||{};
                return <button key={r} onClick={()=>setRole(r)} style={{padding:'5px 12px',borderRadius:999,fontSize:12,fontWeight:role===r?600:400,background:role===r?(rs.bg||T.accentLight):'transparent',color:role===r?(rs.text||T.accentText):T.text2,border:`1px solid ${role===r?(rs.border||T.accent):T.border}`,cursor:'pointer',fontFamily:'inherit'}}>{r}</button>;
              })}
            </div>
          )}
          {scope==='specific' && (
            <div style={{display:'flex',flexDirection:'column',gap:2,maxHeight:180,overflowY:'auto',marginBottom:12,border:`1px solid ${T.border}`,borderRadius:8,padding:6}}>
              {employees.map(e=>(
                <label key={e.id} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 6px',borderRadius:6,cursor:'pointer',background:pickedIds.has(e.id)?T.surfaceWarm:'transparent'}}>
                  <input type="checkbox" checked={pickedIds.has(e.id)} onChange={()=>togglePicked(e.id)}/>
                  <span style={{fontSize:12,color:T.text}}>{e.name}</span>
                </label>
              ))}
            </div>
          )}
          <div style={{fontSize:11,color:T.text3,marginBottom:14}}>{t('msg.recipientCount',{n:recipients.length})}</div>

          <input value={subject} onChange={e=>setSubject(e.target.value)} placeholder={t('msg.subjectPlaceholder')} style={{...s.input,marginBottom:8,width:'100%'}}/>
          <textarea value={body} onChange={e=>setBody(e.target.value)} placeholder={t('msg.bodyPlaceholder')} rows={5} style={{...s.input,resize:'vertical',marginBottom:12,width:'100%'}}/>

          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:16}}>
            <div style={{minWidth:0}}>
              <div style={{fontSize:12,fontWeight:500,color:T.text}}>{t('msg.allowReplies')}</div>
              <div style={{fontSize:10,color:T.text3,marginTop:1}}>{t('msg.allowRepliesDesc')}</div>
            </div>
            <button onClick={()=>setAllowReplies(p=>!p)} aria-pressed={allowReplies} style={{width:40,height:22,borderRadius:999,border:'none',cursor:'pointer',padding:2,background:allowReplies?T.accent:T.border,position:'relative',flexShrink:0,transition:'background 0.15s'}}>
              <span style={{display:'block',width:18,height:18,borderRadius:'50%',background:'#fff',transform:allowReplies?'translateX(18px)':'translateX(0)',transition:'transform 0.15s'}}/>
            </button>
          </div>
        </div>
        <div style={{display:'flex',gap:8,padding:20,borderTop:`1px solid ${T.border}`}}>
          <Btn onClick={()=>onSubmit({ recipientEmpIds: recipients.map(e=>e.id), subject: subject.trim(), body: body.trim(), allowReplies })} disabled={busy||!canSend}>{busy?t('save.saving'):t('msg.send')}</Btn>
          <Btn variant="ghost" onClick={onCancel}>{t('common.cancel')}</Btn>
        </div>
      </div>
    </div>
  );
}
