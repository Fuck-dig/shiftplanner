import { useState } from 'react';
import { T, EMP_PALETTE, MEMBERSHIP_ROLE_COLORS } from '../lib/constants';
import { supabase } from '../lib/supabase';
import { Btn } from './ui';

// Account-settings tab (its own view, not a modal), used from both Dashboard
// and EmployeeView. myEmp is the employees row matched to the logged-in
// user's own email (or null if none exists yet) — name/avatar editing only
// makes sense when that match exists, since otherwise there's no roster row
// to update.
export default function ProfileSettings({ role, myEmp, onSaveName, onSaveColor, onSavePhone, s, t }){
  const [name, setName] = useState(myEmp?.name || '');
  const [nameSaved, setNameSaved] = useState(false);
  const [phone, setPhone] = useState(myEmp?.phone || '');
  const [phoneSaved, setPhoneSaved] = useState(false);
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState(null); // {ok:boolean, text:string} | null
  const rc = MEMBERSHIP_ROLE_COLORS[role] || MEMBERSHIP_ROLE_COLORS.employee;
  const isEmployee = role === 'employee';

  const saveName = () => {
    if (!name.trim()) return;
    onSaveName(name.trim());
    setNameSaved(true);
    setTimeout(()=>setNameSaved(false), 1800);
  };

  const savePhone = () => {
    onSavePhone(phone.trim());
    setPhoneSaved(true);
    setTimeout(()=>setPhoneSaved(false), 1800);
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

  return (
    <div style={{display:'flex',flexDirection:'column',gap:12,maxWidth:440}}>
      <div style={s.card}>
        <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:15,fontWeight:500,marginBottom:14}}>{t('profile.title')}</div>

        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20}}>
          <span style={{fontSize:12,color:T.text3}}>{t('profile.role')}</span>
          <span style={{fontSize:11,fontWeight:600,padding:'3px 10px',borderRadius:999,background:rc.bg,color:rc.text,border:`1px solid ${rc.border}`}}>{t('team.role'+(role.charAt(0).toUpperCase()+role.slice(1)))}</span>
        </div>

        {myEmp ? (<>
          <div style={{marginBottom:18}}>
            <div style={{fontSize:11,color:T.text3,marginBottom:5}}>{t('profile.myDisplayName')}</div>
            {isEmployee ? (<>
              <div style={{fontSize:14,fontWeight:500}}>{myEmp.name}</div>
              <div style={{fontSize:11,color:T.text3,fontStyle:'italic',marginTop:4}}>{t('profile.nameLocked')}</div>
            </>) : (
              <div style={{display:'flex',gap:8}}>
                <input value={name} onChange={e=>setName(e.target.value)} style={{...s.input,flex:1}}/>
                <Btn small onClick={saveName} disabled={!name.trim()}>{nameSaved?t('profile.saved'):t('profile.save')}</Btn>
              </div>
            )}
          </div>
          <div style={{marginBottom:18}}>
            <div style={{fontSize:11,color:T.text3,marginBottom:5}}>{t('profile.email')}</div>
            <div style={{fontSize:14,fontWeight:500}}>{myEmp.email||'—'}</div>
            {/* Email is what links this row to your login — editable only
                from the manager's Employees admin page, never here, since
                changing it on yourself would break that match. */}
            <div style={{fontSize:11,color:T.text3,fontStyle:'italic',marginTop:4}}>{t('profile.emailLocked')}</div>
          </div>
          <div style={{marginBottom:18}}>
            <div style={{fontSize:11,color:T.text3,marginBottom:5}}>{t('profile.phone')}</div>
            <div style={{display:'flex',gap:8}}>
              <input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder={t('profile.phonePlaceholder')} style={{...s.input,flex:1}}/>
              <Btn small onClick={savePhone}>{phoneSaved?t('profile.saved'):t('profile.save')}</Btn>
            </div>
          </div>
          <div style={{marginBottom:6}}>
            <div style={{fontSize:11,color:T.text3,marginBottom:6}}>{t('profile.avatarColor')}</div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {EMP_PALETTE.map((p,i)=>(
                <button key={i} onClick={()=>onSaveColor(i)} title={t('profile.avatarColor')} style={{width:28,height:28,borderRadius:'50%',background:p.dot,border:(myEmp.palIdx||0)===i?`2px solid ${T.text}`:'2px solid transparent',boxShadow:(myEmp.palIdx||0)===i?`0 0 0 2px ${T.surface}`:'none',cursor:'pointer',padding:0}}/>
              ))}
            </div>
          </div>
        </>) : (
          <div style={{fontSize:12,color:T.text3,fontStyle:'italic',padding:'10px 12px',background:T.surfaceWarm,borderRadius:10,border:`1px solid ${T.border}`}}>{t('profile.noEmployeeRecord')}</div>
        )}
      </div>

      <div style={s.card}>
        <div style={{fontSize:12,color:T.text3,marginBottom:8,fontWeight:500}}>{t('profile.changePassword')}</div>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          <input type="password" placeholder={t('profile.newPassword')} value={pw1} onChange={e=>setPw1(e.target.value)} style={s.input}/>
          <input type="password" placeholder={t('profile.confirmPassword')} value={pw2} onChange={e=>setPw2(e.target.value)} style={s.input}/>
          {pwMsg && <div style={{fontSize:12,color:pwMsg.ok?T.success:T.danger}}>{pwMsg.text}</div>}
          <div><Btn small onClick={savePassword} disabled={pwBusy||!pw1||!pw2}>{pwBusy?t('save.saving'):t('profile.changePassword')}</Btn></div>
        </div>
      </div>
    </div>
  );
}
