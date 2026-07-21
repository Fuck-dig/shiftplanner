import { useState } from 'react';
import { createPortal } from 'react-dom';
import { T, EMP_PALETTE } from '../lib/constants';
import { supabase } from '../lib/supabase';
import { Btn } from './ui';

const roleColors = {
  owner:    { bg: '#F5E2E2', text: '#963030', border: '#E8BABA' },
  manager:  { bg: '#F5EAE2', text: '#7A3318', border: '#E8C0A0' },
  employee: { bg: '#E5F0E9', text: '#236040', border: '#9FD8B8' },
};

// Shared account-settings modal, used from both Dashboard and EmployeeView.
// myEmp is the employees row matched to the logged-in user's own email (or
// null if none exists yet) — name/avatar editing only makes sense when that
// match exists, since otherwise there's no roster row to update.
export default function ProfileSettings({ role, myEmp, onSaveName, onSaveColor, onClose, s, t }){
  const [name, setName] = useState(myEmp?.name || '');
  const [nameSaved, setNameSaved] = useState(false);
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState(null); // {ok:boolean, text:string} | null
  const rc = roleColors[role] || roleColors.employee;

  const saveName = () => {
    if (!name.trim()) return;
    onSaveName(name.trim());
    setNameSaved(true);
    setTimeout(()=>setNameSaved(false), 1800);
  };

  const savePassword = async () => {
    setPwMsg(null);
    if (pw1.length < 6){ setPwMsg({ ok:false, text:t('profile.passwordTooShort') }); return; }
    if (pw1 !== pw2){ setPwMsg({ ok:false, text:t('profile.passwordMismatch') }); return; }
    setPwBusy(true);
    try{
      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) throw error;
      setPw1(''); setPw2('');
      setPwMsg({ ok:true, text:t('profile.passwordSaved') });
    }catch(err){
      setPwMsg({ ok:false, text: err.message || t('profile.passwordFailed') });
    }finally{ setPwBusy(false); }
  };

  return createPortal(
    <div onClick={onClose} style={{position:'fixed',inset:0,zIndex:300,background:'rgba(20,16,13,0.5)',display:'flex',alignItems:'center',justifyContent:'center',padding:20,fontFamily:"'Hanken Grotesk',sans-serif"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,width:'min(440px,100%)',maxHeight:'88vh',overflowY:'auto',padding:22,boxShadow:'0 24px 60px -16px rgba(0,0,0,0.5)'}}>
        <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:17,fontWeight:500,marginBottom:16}}>{t('profile.title')}</div>

        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20}}>
          <span style={{fontSize:12,color:T.text3}}>{t('profile.role')}</span>
          <span style={{fontSize:11,fontWeight:600,padding:'3px 10px',borderRadius:999,background:rc.bg,color:rc.text,border:`1px solid ${rc.border}`}}>{t('team.role'+(role.charAt(0).toUpperCase()+role.slice(1)))}</span>
        </div>

        {myEmp ? (<>
          <div style={{marginBottom:18}}>
            <div style={{fontSize:11,color:T.text3,marginBottom:5}}>{t('profile.myDisplayName')}</div>
            <div style={{display:'flex',gap:8}}>
              <input value={name} onChange={e=>setName(e.target.value)} style={{...s.input,flex:1}}/>
              <Btn small onClick={saveName} disabled={!name.trim()}>{nameSaved?t('profile.saved'):t('profile.save')}</Btn>
            </div>
          </div>
          <div style={{marginBottom:20}}>
            <div style={{fontSize:11,color:T.text3,marginBottom:6}}>{t('profile.avatarColor')}</div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {EMP_PALETTE.map((p,i)=>(
                <button key={i} onClick={()=>onSaveColor(i)} title={t('profile.avatarColor')} style={{width:28,height:28,borderRadius:'50%',background:p.dot,border:(myEmp.palIdx||0)===i?`2px solid ${T.text}`:'2px solid transparent',boxShadow:(myEmp.palIdx||0)===i?`0 0 0 2px ${T.surface}`:'none',cursor:'pointer',padding:0}}/>
              ))}
            </div>
          </div>
        </>) : (
          <div style={{fontSize:12,color:T.text3,fontStyle:'italic',marginBottom:20,padding:'10px 12px',background:T.surfaceWarm,borderRadius:10,border:`1px solid ${T.border}`}}>{t('profile.noEmployeeRecord')}</div>
        )}

        <div style={{borderTop:`1px solid ${T.border}`,paddingTop:16,marginBottom:16}}>
          <div style={{fontSize:11,color:T.text3,marginBottom:8}}>{t('profile.changePassword')}</div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            <input type="password" placeholder={t('profile.newPassword')} value={pw1} onChange={e=>setPw1(e.target.value)} style={s.input}/>
            <input type="password" placeholder={t('profile.confirmPassword')} value={pw2} onChange={e=>setPw2(e.target.value)} style={s.input}/>
            {pwMsg && <div style={{fontSize:12,color:pwMsg.ok?T.success:T.danger}}>{pwMsg.text}</div>}
            <div><Btn small onClick={savePassword} disabled={pwBusy||!pw1||!pw2}>{pwBusy?t('save.saving'):t('profile.changePassword')}</Btn></div>
          </div>
        </div>

        <Btn variant="ghost" onClick={onClose}>{t('common.close')}</Btn>
      </div>
    </div>,
    document.body
  );
}
