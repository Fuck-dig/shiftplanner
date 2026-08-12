import { useState } from 'react';
import { T, isDark, MEMBERSHIP_ROLE_COLORS } from '../lib/constants';
import { supabase } from '../lib/supabase';
import { createOrg } from '../lib/org';
import { saveOrgSetup } from '../lib/data';
import { LANGUAGES, makeT, detectLang } from '../i18n';
import { load, save } from '../lib/storage';

// A rough starting guess only — the field right below it is always a plain
// free-text input (matching how currency is edited everywhere else in the
// app, e.g. Costs), so this never blocks picking anything else.
const DEFAULT_CURRENCY_FOR_LANG = { da:'kr', de:'€', en:'$', es:'€', fr:'€' };

export default function RestaurantPicker({ orgs, onSelect, onCreated, toggleTheme }) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName]             = useState('');
  const [currency, setCurrency]     = useState('');
  // Defaults chosen to be the common case rather than blank: 16th-to-15th is
  // what Almus runs, and a restaurant turning sick pay on almost always pays
  // full. Someone who doesn't care can press Create and get sane values; the
  // point of showing them is that they're now a deliberate choice rather than
  // something discovered months later in Costs.
  const [sickPay, setSickPay]       = useState('100');
  const [payStart, setPayStart]     = useState('16');
  const [busy, setBusy]             = useState(false);
  const [error, setError]           = useState('');
  const [lang, setLangRaw]          = useState(()=>load('sa2_lang', detectLang()));
  const setLang = v => { setLangRaw(v); save('sa2_lang', v); };
  const t = makeT(lang);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true); setError('');
    try {
      const id = await createOrg(name.trim());
      // Best-effort, deliberately: a failure here must not strand someone
      // outside a restaurant that HAS been created. Every one of these has a
      // sane column default and is editable later from Costs, so the worst case
      // is defaults rather than a broken restaurant.
      saveOrgSetup(id, {
        currency: currency.trim() || DEFAULT_CURRENCY_FOR_LANG[lang] || 'kr',
        sickPayPct: sickPay,
        payPeriodStartDay: payStart,
      }).catch(err=>console.error('Could not save restaurant setup:',err));
      setName(''); setCurrency(''); setSickPay('100'); setPayStart('16'); setShowCreate(false);
      await onCreated(id);
    } catch(e) {
      setError(e.message || t('picker.createFailed'));
    } finally { setBusy(false); }
  };

  return (
    <div style={{minHeight:'100vh',width:'100%',background:T.bg,backgroundImage:isDark()?'radial-gradient(circle at 20% 10%, rgba(217,122,74,0.08), transparent 40%), radial-gradient(circle at 80% 90%, rgba(95,174,122,0.07), transparent 40%)':'radial-gradient(circle at 20% 10%, rgba(191,90,44,0.05), transparent 40%), radial-gradient(circle at 80% 90%, rgba(61,122,82,0.04), transparent 40%)',fontFamily:"'Hanken Grotesk',sans-serif",color:T.text,display:'flex',flexDirection:'column'}}>

      {/* Top bar */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'20px 32px'}}>
        <span style={{fontFamily:'Fraunces, Georgia, serif',fontSize:22,fontWeight:600,color:T.text,letterSpacing:'-0.02em'}}>Rorota</span>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <select value={lang} onChange={e=>setLang(e.target.value)} style={{fontFamily:'inherit',fontSize:12,color:T.text2,background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:'6px 8px',cursor:'pointer',outline:'none'}}>{LANGUAGES.map(L=><option key={L.code} value={L.code}>{L.label}</option>)}</select>
          <button onClick={toggleTheme} style={{width:32,height:32,borderRadius:8,border:`1px solid ${T.border}`,background:T.surface,color:T.text2,cursor:'pointer',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center'}}>{isDark()?'☀':'☾'}</button>
          <button onClick={()=>supabase.auth.signOut()} style={{padding:'6px 14px',borderRadius:8,border:`1px solid ${T.border}`,background:T.surface,color:T.text2,cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>{t('common.logout')}</button>
        </div>
      </div>

      {/* Main content */}
      <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'32px 24px'}}>
        <div style={{width:'100%',maxWidth:520}}>
          <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:28,fontWeight:500,color:T.text,marginBottom:8,textAlign:'center'}}>
            {orgs.length === 0 ? t('picker.welcomeTitle') : t('picker.yourRestaurants')}
          </div>
          <div style={{fontSize:13,color:T.text2,marginBottom:32,textAlign:'center'}}>
            {orgs.length === 0 ? t('picker.firstRestaurantDesc') : t('picker.selectDesc')}
          </div>

          {/* Restaurant cards */}
          <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:16}}>
            {orgs.map(org => {
              const rc = MEMBERSHIP_ROLE_COLORS[org.role] || MEMBERSHIP_ROLE_COLORS.employee;
              return (
                <button key={org.id} onClick={() => onSelect(org.id)}
                  style={{display:'flex',alignItems:'center',gap:16,padding:'16px 20px',borderRadius:14,background:T.surface,border:`1px solid ${T.border}`,cursor:'pointer',fontFamily:'inherit',textAlign:'left',transition:'all 0.15s',boxShadow:'0 1px 2px rgba(33,27,21,0.04), 0 8px 20px -12px rgba(33,27,21,0.12)'}}
                  onMouseEnter={e=>{e.currentTarget.style.border=`1px solid ${T.accent}66`;e.currentTarget.style.transform='translateY(-1px)';}}
                  onMouseLeave={e=>{e.currentTarget.style.border=`1px solid ${T.border}`;e.currentTarget.style.transform='translateY(0)';}}>
                  {/* Restaurant avatar */}
                  <div style={{width:44,height:44,borderRadius:12,background:isDark()?T.accent+'22':T.accentLight,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:700,color:T.accent,flexShrink:0,fontFamily:'Fraunces, Georgia, serif'}}>
                    {org.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:15,fontWeight:600,color:T.text,marginBottom:3}}>{org.name}</div>
                    <div style={{fontSize:11,color:T.text3}}>{t('picker.clickToOpen')}</div>
                  </div>
                  <span style={{fontSize:11,fontWeight:500,padding:'3px 10px',borderRadius:999,background:isDark()?rc.text+'22':rc.bg,color:rc.text,border:`1px solid ${isDark()?rc.text+'44':rc.border}`,flexShrink:0}}>
                    {t('team.role'+(org.role.charAt(0).toUpperCase()+org.role.slice(1)))}
                  </span>
                  <span style={{fontSize:18,color:T.text3}}>›</span>
                </button>
              );
            })}
          </div>

          {/* Create new */}
          {!showCreate ? (
            <button onClick={() => setShowCreate(true)}
              style={{width:'100%',padding:'14px 20px',borderRadius:14,background:'transparent',border:`1.5px dashed ${T.border}`,cursor:'pointer',fontFamily:'inherit',fontSize:13,color:T.text2,display:'flex',alignItems:'center',justifyContent:'center',gap:8,transition:'all 0.15s'}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=T.accent;e.currentTarget.style.color=T.accent;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.color=T.text2;}}>
              <span style={{fontSize:18,lineHeight:1}}>+</span> {t('picker.createNew')}
            </button>
          ) : (
            <div style={{padding:'16px 20px',borderRadius:14,background:T.surface,border:`1px solid ${T.border}`}}>
              <div style={{fontSize:13,fontWeight:500,color:T.text,marginBottom:4}}>{t('picker.newRestaurant')}</div>
              {/* These were settings you discovered later, buried in Costs, and
                  a couple of them silently shape money — sick pay decides what a
                  sick day costs, the pay period decides which month a shift is
                  paid in. Asking once, at the point the restaurant is created,
                  makes them a decision instead of a default someone inherits.
                  All four keep working defaults, so pressing Create without
                  touching them is still a valid path. */}
              <div style={{fontSize:12,color:T.text2,marginBottom:14}}>{t('picker.setupHint')}</div>

              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                <div>
                  <div style={{fontSize:11,color:T.text3,marginBottom:4}}>{t('picker.nameLabel')}</div>
                  <input autoFocus placeholder={t('picker.namePlaceholder')} value={name} onChange={e=>setName(e.target.value)}
                    onKeyDown={e=>e.key==='Enter'&&create()} style={{width:'100%',boxSizing:'border-box',padding:'8px 12px',borderRadius:8,border:`1px solid ${T.border}`,background:T.surfaceWarm,color:T.text,fontSize:13,fontFamily:'inherit',outline:'none'}} disabled={busy}/>
                </div>

                <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                  <div style={{flex:'1 1 90px',minWidth:90}}>
                    <div style={{fontSize:11,color:T.text3,marginBottom:4}}>{t('picker.currencyLabel')}</div>
                    <input placeholder={DEFAULT_CURRENCY_FOR_LANG[lang]||'kr'} maxLength={5} value={currency} onChange={e=>setCurrency(e.target.value)}
                      onKeyDown={e=>e.key==='Enter'&&create()} style={{width:'100%',boxSizing:'border-box',padding:'8px 12px',borderRadius:8,border:`1px solid ${T.border}`,background:T.surfaceWarm,color:T.text,fontSize:13,fontFamily:'inherit',outline:'none'}} disabled={busy}/>
                  </div>
                  <div style={{flex:'1 1 120px',minWidth:120}}>
                    <div style={{fontSize:11,color:T.text3,marginBottom:4}}>{t('picker.sickPayLabel')}</div>
                    <input type="number" min="0" max="100" step="1" value={sickPay}
                      onChange={e=>setSickPay(e.target.value===''?'':String(Math.max(0,Math.min(100,Number(e.target.value)))))}
                      onKeyDown={e=>e.key==='Enter'&&create()} style={{width:'100%',boxSizing:'border-box',padding:'8px 12px',borderRadius:8,border:`1px solid ${T.border}`,background:T.surfaceWarm,color:T.text,fontSize:13,fontFamily:'inherit',outline:'none'}} disabled={busy}/>
                  </div>
                  <div style={{flex:'1 1 120px',minWidth:120}}>
                    <div style={{fontSize:11,color:T.text3,marginBottom:4}}>{t('picker.payPeriodLabel')}</div>
                    {/* 1–28 only: the 29th, 30th and 31st don't exist in every
                        month, so a period anchored there would fail to open in
                        February. Same constraint the column carries. */}
                    <input type="number" min="1" max="28" step="1" value={payStart}
                      onChange={e=>setPayStart(e.target.value===''?'':String(Math.max(1,Math.min(28,Number(e.target.value)))))}
                      onKeyDown={e=>e.key==='Enter'&&create()} style={{width:'100%',boxSizing:'border-box',padding:'8px 12px',borderRadius:8,border:`1px solid ${T.border}`,background:T.surfaceWarm,color:T.text,fontSize:13,fontFamily:'inherit',outline:'none'}} disabled={busy}/>
                  </div>
                </div>
                <div style={{fontSize:11,color:T.text3,marginTop:-4}}>{t('picker.payPeriodHint',{day:payStart||'16'})}</div>
              </div>

              <div style={{display:'flex',gap:8,marginTop:16}}>
                <button onClick={create} disabled={busy||!name.trim()}
                  style={{padding:'8px 16px',borderRadius:8,background:T.accent,color:'#fff',border:'none',cursor:'pointer',fontSize:13,fontFamily:'inherit',fontWeight:500,opacity:busy||!name.trim()?0.6:1}}>
                  {busy ? t('common.creating') : t('common.create')}
                </button>
                <button onClick={()=>{setShowCreate(false);setName('');setError('');}}
                  style={{padding:'8px 12px',borderRadius:8,background:T.surfaceWarm,color:T.text2,border:`1px solid ${T.border}`,cursor:'pointer',fontSize:13,fontFamily:'inherit'}}>
                  {t('common.cancel')}
                </button>
              </div>
              {error && <div style={{marginTop:8,fontSize:12,color:T.danger}}>{error}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
