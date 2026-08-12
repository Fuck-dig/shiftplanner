import { useState } from 'react';
import { T } from '../../lib/constants';
import { payPeriodFor, payDateFor } from '../../lib/payPeriod';
import { fmt } from '../../lib/dates';
import { Btn, SectionLabel } from '../ui';

// Restaurant settings.
//
// These were scattered: currency and sick pay were edited from the COSTS tab,
// of all places, and the pay-period start day had no UI at all — you would have
// had to change it in SQL. That was tolerable with one setting and stopped
// being so at four. This is the one place they live now, and the restaurant
// setup form asks for the same fields at creation.
//
// Two of them are owner-only, and not merely hidden from managers: a database
// trigger rejects the change (20260813100000). The disabled inputs here are a
// courtesy so nobody types into a field whose save will bounce; the trigger is
// the actual control, and it holds against the REST API too.
export default function SettingsView({
  orgName, isOwner, settings, onSave, saving, error, s, t,
}){
  const [draft,setDraft]=useState(()=>({
    currency: settings?.currency ?? '',
    sickPayPct: settings?.sickPayPct ?? 100,
    payPeriodStartDay: settings?.payPeriodStartDay ?? 16,
  }));
  const set=(k,v)=>setDraft(p=>({...p,[k]:v}));

  const dirty = settings && (
    String(draft.currency) !== String(settings.currency ?? '') ||
    Number(draft.sickPayPct) !== Number(settings.sickPayPct) ||
    Number(draft.payPeriodStartDay) !== Number(settings.payPeriodStartDay)
  );

  // Shown live under the pay-period field, because "starts on the 16th" is
  // abstract and "16 Jul – 15 Aug, paid 31 Aug" is not. It also makes a typo
  // obvious immediately rather than at the end of the month.
  const previewDay = Number(draft.payPeriodStartDay);
  const preview = previewDay>=1 && previewDay<=28 ? payPeriodFor(new Date(), previewDay) : null;

  const label = { fontSize:11, color:T.text3, marginBottom:4 };
  const input = { width:'100%', boxSizing:'border-box', padding:'8px 12px', borderRadius:8,
                  border:`1px solid ${T.border}`, background:T.surfaceWarm, color:T.text,
                  fontSize:13, fontFamily:'inherit', outline:'none' };
  const locked = { ...input, opacity:0.55, cursor:'not-allowed' };

  return (
    <div style={{display:'flex',flexDirection:'column',gap:16,maxWidth:640}}>
      <div style={s.card}>
        <SectionLabel mb={4}>{t('settings.title')}</SectionLabel>
        <div style={{fontSize:12,color:T.text2,marginBottom:16}}>{t('settings.subtitle',{name:orgName||''})}</div>

        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div style={{maxWidth:160}}>
            <div style={label}>{t('picker.currencyLabel')}</div>
            <input maxLength={5} value={draft.currency} onChange={e=>set('currency',e.target.value)}
              style={input} disabled={saving}/>
          </div>

          <div style={{borderTop:`1px solid ${T.border}`,paddingTop:14}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap'}}>
              <SectionLabel mb={0}>{t('settings.paySection')}</SectionLabel>
              {!isOwner&&<span style={{fontSize:10,fontWeight:600,color:T.warning,background:T.warningLight,border:`1px solid ${T.warning}33`,borderRadius:999,padding:'2px 8px'}}>{t('settings.ownerOnly')}</span>}
            </div>
            <div style={{fontSize:12,color:T.text2,marginBottom:12}}>
              {isOwner?t('settings.payHint'):t('settings.payLockedHint')}
            </div>

            <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
              <div style={{flex:'1 1 140px',minWidth:140}}>
                <div style={label}>{t('picker.sickPayLabel')}</div>
                <input type="number" min="0" max="100" step="1" value={draft.sickPayPct}
                  onChange={e=>set('sickPayPct',e.target.value===''?'':Math.max(0,Math.min(100,Number(e.target.value))))}
                  style={isOwner?input:locked} disabled={!isOwner||saving}/>
              </div>
              <div style={{flex:'1 1 140px',minWidth:140}}>
                <div style={label}>{t('picker.payPeriodLabel')}</div>
                {/* 1–28: the 29th to 31st do not exist in every month, so a
                    period anchored there would fail to open in February. Same
                    bound as the CHECK constraint on the column. */}
                <input type="number" min="1" max="28" step="1" value={draft.payPeriodStartDay}
                  onChange={e=>set('payPeriodStartDay',e.target.value===''?'':Math.max(1,Math.min(28,Number(e.target.value))))}
                  style={isOwner?input:locked} disabled={!isOwner||saving}/>
              </div>
            </div>

            {preview&&(
              <div style={{fontSize:11,color:T.text3,marginTop:8}}>
                {t('settings.periodPreview',{
                  from:fmt(preview.start), to:fmt(preview.end), paid:fmt(payDateFor(preview)),
                })}
              </div>
            )}
          </div>
        </div>

        {error&&<div style={{marginTop:14,fontSize:12,color:T.danger,background:T.dangerLight,border:`1px solid ${T.danger}33`,borderRadius:8,padding:'8px 12px'}}>{error}</div>}

        <div style={{marginTop:18,display:'flex',gap:8,alignItems:'center'}}>
          <Btn onClick={()=>onSave(draft)} disabled={!dirty||saving}>{saving?t('common.saving'):t('common.save')}</Btn>
          {dirty&&!saving&&<span style={{fontSize:11,color:T.text3}}>{t('settings.unsaved')}</span>}
        </div>
      </div>

      <div style={{fontSize:11,color:T.text3,lineHeight:1.6}}>{t('settings.footnote')}</div>
    </div>
  );
}
