import { useState } from 'react';
import { T, EMP_PALETTE, MEMBERSHIP_ROLE_COLORS, DAYS, AVAIL_TEMPLATES } from '../lib/constants';
import { supabase } from '../lib/supabase';
import { Btn, TimePicker } from './ui';

// Account-settings tab (its own view, not a modal), used from both Dashboard
// and EmployeeView. myEmp is the employees row matched to the logged-in
// user's own email (or null if none exists yet) — name/avatar editing only
// makes sense when that match exists, since otherwise there's no roster row
// to update.
export default function ProfileSettings({ role, myEmp, myEmail, onGoToEmployees, onSaveName, onSaveColor, onSavePhone, onSaveAvailability, onSaveEmailNotifications, weekHours, weekCorrected, monthHours, monthCorrected, s, t }){
  const [name, setName] = useState(myEmp?.name || '');
  const [nameSaved, setNameSaved] = useState(false);
  const [phone, setPhone] = useState(myEmp?.phone || '');
  const [phoneSaved, setPhoneSaved] = useState(false);
  // Saves immediately on click, like color/toggle-style controls elsewhere
  // on this page — a preference toggle doesn't need a separate Save step.
  const [emailNotif, setEmailNotif] = useState(myEmp?.emailNotifications ?? true);
  const toggleEmailNotif = () => {
    const next = !emailNotif;
    setEmailNotif(next);
    onSaveEmailNotifications(next);
  };
  // Edited locally and only pushed on Save (rather than per-click, like
  // name/phone/color above) — a week's worth of day toggles + time pickers
  // is a lot of small edits to fire off individually.
  const [availability, setAvailability] = useState(myEmp?.availability || {});
  const [availSaved, setAvailSaved] = useState(false);
  const toggleAvailDay = (day) => setAvailability(p=>({ ...p, [day]: p[day] ? null : { from:'09:00', to:'17:00' } }));
  const updateAvailField = (day, field, val) => setAvailability(p=>({ ...p, [day]: { ...p[day], [field]: val } }));
  const saveAvailability = () => {
    onSaveAvailability(availability);
    setAvailSaved(true);
    setTimeout(()=>setAvailSaved(false), 1800);
  };
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
    <div style={{display:'flex',flexDirection:'column',gap:12,maxWidth:860,width:'100%',margin:'0 auto'}}>
      <div style={s.card}>
        <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:15,fontWeight:500,marginBottom:14}}>{t('profile.title')}</div>

        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20}}>
          <span style={{fontSize:12,color:T.text3}}>{t('profile.role')}</span>
          <span style={{fontSize:11,fontWeight:600,padding:'3px 10px',borderRadius:999,background:rc.bg,color:rc.text,border:`1px solid ${rc.border}`}}>{t('team.role'+(role.charAt(0).toUpperCase()+role.slice(1)))}</span>
        </div>

        {myEmp ? (<>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))',gap:18,marginBottom:18}}>
            <div>
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
            <div>
              <div style={{fontSize:11,color:T.text3,marginBottom:5}}>{t('profile.email')}</div>
              <div style={{fontSize:14,fontWeight:500}}>{myEmp.email||'—'}</div>
              {/* Email is what links this row to your login — editable only
                  from the manager's Employees admin page, never here, since
                  changing it on yourself would break that match. */}
              <div style={{fontSize:11,color:T.text3,fontStyle:'italic',marginTop:4}}>{t('profile.emailLocked')}</div>
            </div>
            <div>
              <div style={{fontSize:11,color:T.text3,marginBottom:5}}>{t('profile.phone')}</div>
              <div style={{display:'flex',gap:8}}>
                <input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder={t('profile.phonePlaceholder')} style={{...s.input,flex:1}}/>
                <Btn small onClick={savePhone}>{phoneSaved?t('profile.saved'):t('profile.save')}</Btn>
              </div>
            </div>
          </div>
          <div style={{marginBottom:onSaveEmailNotifications?18:6}}>
            <div style={{fontSize:11,color:T.text3,marginBottom:6}}>{t('profile.avatarColor')}</div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {EMP_PALETTE.map((p,i)=>(
                <button key={i} onClick={()=>onSaveColor(i)} title={t('profile.avatarColor')} style={{width:28,height:28,borderRadius:'50%',background:p.dot,border:(myEmp.palIdx||0)===i?`2px solid ${T.text}`:'2px solid transparent',boxShadow:(myEmp.palIdx||0)===i?`0 0 0 2px ${T.surface}`:'none',cursor:'pointer',padding:0}}/>
              ))}
            </div>
          </div>
          {onSaveEmailNotifications && (
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,paddingTop:16,borderTop:`1px solid ${T.border}`}}>
              <div style={{minWidth:0}}>
                <div style={{fontSize:13,fontWeight:500,color:T.text}}>{t('profile.emailNotifTitle')}</div>
                <div style={{fontSize:11,color:T.text3,marginTop:2}}>{t('profile.emailNotifDesc')}</div>
              </div>
              <button onClick={toggleEmailNotif} aria-label={t('profile.emailNotifTitle')} aria-pressed={emailNotif} style={{width:40,height:22,borderRadius:999,border:'none',cursor:'pointer',padding:2,background:emailNotif?T.accent:T.border,position:'relative',flexShrink:0,transition:'background 0.15s'}}>
                <span style={{display:'block',width:18,height:18,borderRadius:'50%',background:'#fff',transform:emailNotif?'translateX(18px)':'translateX(0)',transition:'transform 0.15s'}}/>
              </button>
            </div>
          )}
        </>) : (
          <div style={{padding:'14px 16px',background:T.surfaceWarm,borderRadius:10,border:`1px solid ${T.border}`}}>
            <div style={{fontSize:12,color:T.text2,lineHeight:1.6,marginBottom:onGoToEmployees?14:(myEmail?12:0)}}>
              {onGoToEmployees ? t('profile.noEmployeeRecordManager') : t('profile.noEmployeeRecord')}
            </div>
            {myEmail && (
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:onGoToEmployees?14:0}}>
                <span style={{fontSize:11,color:T.text3}}>{t('profile.yourLoginEmail')}</span>
                <span style={{fontSize:13,fontWeight:500,color:T.text}}>{myEmail}</span>
              </div>
            )}
            {onGoToEmployees && <Btn small onClick={onGoToEmployees}>{t('profile.addSelfToRoster')}</Btn>}
          </div>
        )}
      </div>

      {/* Recurring weekly availability — previously manager-edited only
          (the admin Employees page). Editable here now too, applied
          immediately on Save (no approval step, same as the manager's own
          edit), which is fine since — unlike email — nothing depends on
          this staying in sync with anything else. */}
      {myEmp && onSaveAvailability && (
        <div style={s.card}>
          <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:15,fontWeight:500,marginBottom:14}}>{t('emp.weeklyAvail')}</div>
          <div style={{marginBottom:12}}>
            <div style={{fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>{t('emp.quickTemplates')}</div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {Object.keys(AVAIL_TEMPLATES).map(tpl=><button key={tpl} onClick={()=>setAvailability(AVAIL_TEMPLATES[tpl])} style={{padding:'4px 10px',borderRadius:6,fontSize:11,cursor:'pointer',background:T.surfaceWarm,border:`1px solid ${T.border}`,color:T.text2,fontFamily:'inherit'}}>{t('tpl.'+tpl)}</button>)}
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(210px, 1fr))',gap:10}}>
            {DAYS.map(day=>{
              const avail=availability[day];
              return (
                <div key={day} style={{display:'flex',flexDirection:'column',gap:8,padding:'12px',borderRadius:10,background:avail?T.accentLight:T.surfaceWarm,border:`1px solid ${avail?T.accent+'55':T.border}`}}>
                  <button onClick={()=>toggleAvailDay(day)} style={{alignSelf:'flex-start',padding:'4px 12px',borderRadius:6,fontSize:12,fontWeight:600,cursor:'pointer',background:avail?T.accent:'transparent',color:avail?'#fff':T.text3,border:`1px solid ${avail?T.accent:T.border}`,fontFamily:'inherit'}}>{t('day.'+day)}</button>
                  {avail?(
                    <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                      <span style={{fontSize:11,color:T.text3}}>{t('common.fromCap')}</span>
                      <TimePicker value={avail.from} onChange={v=>updateAvailField(day,'from',v)} small/>
                      <span style={{fontSize:11,color:T.text3}}>{t('common.toLower')}</span>
                      <TimePicker value={avail.to} onChange={v=>updateAvailField(day,'to',v)} small/>
                    </div>
                  ):<span style={{fontSize:11,color:T.text3,fontStyle:'italic'}}>{t('emp.notAvailable')}</span>}
                </div>
              );
            })}
          </div>
          <div style={{marginTop:14}}><Btn small onClick={saveAvailability}>{availSaved?t('profile.saved'):t('profile.save')}</Btn></div>
        </div>
      )}

      {/* Hours worked and Change password are both compact cards, so they sit
          side by side on wide screens instead of eating a full row each.
          weekHours/monthHours are passed from both EmployeeView and the
          manager Dashboard — a manager only sees this card when their own
          login is matched to an employees row (i.e. they also work
          scheduled shifts themselves), same gating as everything else on
          this page that depends on myEmp. */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))',gap:12,alignItems:'start'}}>
        {myEmp && weekHours!=null && (
          <div style={s.card}>
            <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:15,fontWeight:500,marginBottom:14}}>{t('profile.hoursWorked')}</div>
            <div style={{display:'flex',gap:28,flexWrap:'wrap'}}>
              <div>
                <div style={{display:'flex',alignItems:'center',gap:5}}>
                  <div style={{fontSize:22,fontWeight:600,color:T.text}}>{weekHours.toFixed(1)}h</div>
                  {weekCorrected>0&&<span title={t('profile.hoursCorrectedHint',{n:weekCorrected})} style={{width:6,height:6,borderRadius:'50%',background:T.success,display:'inline-block'}}/>}
                </div>
                <div style={{fontSize:11,color:T.text3,marginTop:2}}>{t('profile.thisWeek')}</div>
              </div>
              <div>
                <div style={{display:'flex',alignItems:'center',gap:5}}>
                  <div style={{fontSize:22,fontWeight:600,color:T.text}}>{monthHours.toFixed(1)}h</div>
                  {monthCorrected>0&&<span title={t('profile.hoursCorrectedHint',{n:monthCorrected})} style={{width:6,height:6,borderRadius:'50%',background:T.success,display:'inline-block'}}/>}
                </div>
                <div style={{fontSize:11,color:T.text3,marginTop:2}}>{t('profile.thisMonthToDate')}</div>
              </div>
            </div>
            {(weekCorrected>0||monthCorrected>0)&&<div style={{fontSize:10,color:T.text3,marginTop:10,fontStyle:'italic'}}>{t('profile.hoursCorrectedLegend')}</div>}
          </div>
        )}

        <div style={s.card}>
          <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:15,fontWeight:500,marginBottom:14}}>{t('profile.changePassword')}</div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            <input type="password" placeholder={t('profile.newPassword')} value={pw1} onChange={e=>setPw1(e.target.value)} style={s.input}/>
            <input type="password" placeholder={t('profile.confirmPassword')} value={pw2} onChange={e=>setPw2(e.target.value)} style={s.input}/>
            {pwMsg && <div style={{fontSize:12,color:pwMsg.ok?T.success:T.danger}}>{pwMsg.text}</div>}
            <div><Btn small onClick={savePassword} disabled={pwBusy||!pw1||!pw2}>{pwBusy?t('save.saving'):t('profile.changePassword')}</Btn></div>
          </div>
        </div>
      </div>
    </div>
  );
}
