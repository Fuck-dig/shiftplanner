import { useState, useEffect } from 'react';
import { T } from '../lib/constants';
import { supabase } from '../lib/supabase';
import { addMember, removeMember, listMembers, createInvitation, listInvitations, deleteInvitation } from '../lib/org';
import { Btn } from './ui';

export default function TeamAccess({ orgId, orgName, isOwner=false, s, t }){
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
