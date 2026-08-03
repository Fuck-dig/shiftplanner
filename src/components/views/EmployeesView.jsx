import { useState, useEffect } from 'react';
import { T, DAYS, AVAIL_TEMPLATES, DEFAULT_ROLE_STYLES, pal, isDark } from '../../lib/constants';
import { toMin, LOCALE } from '../../lib/dates';
import { Avatar, RoleBadge, Btn, SectionLabel, TimePicker } from '../ui';
import TeamAccess from '../TeamAccess';
import { fetchEmployeeDocuments, uploadEmployeeDocument, getEmployeeDocumentUrl, deleteEmployeeDocument } from '../../lib/data';

const fmtSize=(bytes)=>{
  if(!bytes) return '0 KB';
  if(bytes<1024*1024) return `${Math.max(1,Math.round(bytes/1024))} KB`;
  return `${(bytes/(1024*1024)).toFixed(1)} MB`;
};

export default function EmployeesView({
  employees, allRoles, roleStyles,
  expandedEmp, setExpandedEmp,
  updateEmp, updateAvail, toggleDay, applyTemplate, duplicateEmp, removeEmp, archiveEmp,
  showAddEmp, setShowAddEmp, newEmp, setNewEmp, addEmployee,
  onAddShift, onOpenCompose, onOpenKiosk, myId,
  orgId, orgName, isOwner, uploaderLabel, currency, s, t,
}){
  const [showArchived,setShowArchived]=useState(false);
  // Documents are manager-only (see 20260725120000_employee_documents.sql)
  // and only ever needed for whichever single employee panel is expanded —
  // expandedEmp is one id, not a set, so a flat per-id cache is enough
  // rather than eagerly loading every employee's documents up front.
  const [empDocs, setEmpDocs] = useState({});     // empId -> Doc[] | undefined (not yet loaded)
  const [docBusy, setDocBusy] = useState({});     // empId -> true while an upload is in flight
  const [docErrors, setDocErrors] = useState({}); // empId -> error message | undefined

  useEffect(() => {
    if (!expandedEmp || empDocs[expandedEmp] !== undefined) return;
    fetchEmployeeDocuments(expandedEmp)
      .then(docs => setEmpDocs(p => ({ ...p, [expandedEmp]: docs })))
      .catch(err => setDocErrors(p => ({ ...p, [expandedEmp]: err.message || 'Failed to load documents' })));
  }, [expandedEmp]);

  const handleUploadDoc = (empId, file) => {
    setDocBusy(p => ({ ...p, [empId]: true }));
    setDocErrors(p => ({ ...p, [empId]: undefined }));
    uploadEmployeeDocument(orgId, empId, file, uploaderLabel)
      .then(doc => setEmpDocs(p => ({ ...p, [empId]: [doc, ...(p[empId] || [])] })))
      .catch(err => setDocErrors(p => ({ ...p, [empId]: err.message || 'Upload failed' })))
      .finally(() => setDocBusy(p => ({ ...p, [empId]: false })));
  };

  const handleOpenDoc = (doc) => {
    getEmployeeDocumentUrl(doc.storagePath)
      .then(url => window.open(url, '_blank'))
      .catch(err => setDocErrors(p => ({ ...p, [doc.employeeId]: err.message || 'Could not open file' })));
  };

  const handleDeleteDoc = (empId, doc) => {
    deleteEmployeeDocument(doc)
      .then(() => setEmpDocs(p => ({ ...p, [empId]: (p[empId] || []).filter(d => d.id !== doc.id) })))
      .catch(err => setDocErrors(p => ({ ...p, [empId]: err.message || 'Delete failed' })));
  };

  return (<>
  <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginBottom:10}}>
    {onOpenKiosk && <Btn onClick={onOpenKiosk} variant="ghost">{'⏱ '+t('kiosk.openButton')}</Btn>}
    <Btn onClick={()=>onOpenCompose()} variant="secondary">{'✉ '+t('msg.newMessage')}</Btn>
  </div>
  {employees.length===0 && !showAddEmp && (
    <div style={{...s.card,padding:'52px 32px',textAlign:'center',position:'relative',overflow:'hidden'}}>
      <div style={{position:'absolute',inset:0,backgroundImage:`radial-gradient(circle, ${T.border} 1px, transparent 1px)`,backgroundSize:'24px 24px',opacity:0.5,pointerEvents:'none'}}/>
      <div style={{position:'relative'}}>
        <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:22,fontWeight:500,color:T.text,marginBottom:8}}>{t('emp.noneYet')}</div>
        <div style={{fontSize:13,color:T.text2,marginBottom:28}}>{t('emp.noneYetDesc')}</div>
        <Btn onClick={()=>setShowAddEmp(true)}>{t('emp.addEmployeeBtn')}</Btn>
      </div>
    </div>
  )}
  <div style={{display:'flex',flexDirection:'column',gap:10}}>
    {employees.filter(e=>!e.archived).map(emp=>(<div key={emp.id} style={s.card}>
      <div style={{display:'flex',alignItems:'center',gap:12}}>
        <Avatar emp={emp} size={40}/>
        <div style={{flex:1}}>
          <div style={{fontSize:14,fontWeight:500,display:'flex',alignItems:'center',gap:8,marginBottom:3,flexWrap:'wrap'}}>{emp.name}{(emp.roles||[]).map(r=><RoleBadge key={r} role={r} rs={roleStyles[r]}/>)}</div>
          <div style={{fontSize:12,color:T.text2}}>{(emp.contractType||'hourly')==='hourly'?`${emp.wage||'—'} ${currency}/h`:`${(emp.wage||0).toLocaleString(LOCALE)} ${currency}/mo`} · max {emp.maxHours}h/{(emp.contractPeriod||'week')==='month'?'month':'week'}</div>
        </div>
        <div style={{display:'flex',gap:6}}>
          <Btn onClick={()=>onAddShift(emp)} variant="secondary" small>{'+ '+t('emp.addShift')}</Btn>
          {emp.id!==myId && <Btn onClick={()=>onOpenCompose([emp.id])} variant="ghost" small>{'✉ '+t('msg.message')}</Btn>}
          <Btn onClick={()=>duplicateEmp(emp)} variant="ghost" small>{'⧉ '+t('emp.clone')}</Btn>
          <Btn onClick={()=>setExpandedEmp(expandedEmp===emp.id?null:emp.id)} variant={expandedEmp===emp.id?'secondary':'ghost'} small>{expandedEmp===emp.id?t('common.close'):t('common.edit')}</Btn>
          {/* Archive is the default way to remove someone: they leave every
              scheduling surface but keep their history. Delete still exists
              for a genuinely mistaken row and warns that it destroys past
              shifts, which archiving doesn't. */}
          {archiveEmp && <Btn onClick={()=>archiveEmp(emp.id,true)} variant="secondary" small>{t('emp.archive')}</Btn>}
          <Btn onClick={()=>{ if(confirm(t('emp.deleteConfirm',{name:emp.name}))) removeEmp(emp.id); }} variant="danger" small>✕</Btn>
        </div>
      </div>
      {expandedEmp===emp.id&&(<div style={{marginTop:18,paddingTop:18,borderTop:`1px solid ${T.border}`}}>
        <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
          <div style={{flex:'2 1 120px'}}><SectionLabel>{t('emp.name')}</SectionLabel><input value={emp.name} onChange={e=>updateEmp(emp.id,'name',e.target.value)} style={s.input}/></div>
        <div style={{flex:'2 1 160px'}}><SectionLabel>{t('emp.email')}</SectionLabel><input type="email" value={emp.email||''} onChange={e=>updateEmp(emp.id,'email',e.target.value)} placeholder={t('team.emailPlaceholder')} style={s.input}/><div style={{fontSize:9,color:T.text3,marginTop:3}}>{t('emp.emailHint')}</div></div>
        <div style={{flex:'1 1 140px'}}><SectionLabel>{t('emp.phone')}</SectionLabel><input type="tel" value={emp.phone||''} onChange={e=>updateEmp(emp.id,'phone',e.target.value)} placeholder={t('emp.phonePlaceholder')} style={s.input}/></div>
        <div style={{flex:'1 1 110px'}}><SectionLabel>{t('emp.kioskPin')}</SectionLabel><input type="text" inputMode="numeric" maxLength={6} value={emp.pin||''} onChange={e=>updateEmp(emp.id,'pin',e.target.value.replace(/\D/g,'').slice(0,6))} placeholder={t('emp.kioskPinPlaceholder')} style={{...s.input,letterSpacing:'0.15em'}}/><div style={{fontSize:9,color:T.text3,marginTop:3}}>{t('emp.kioskPinHint')}</div></div>
        </div>
        <div style={{marginBottom:12}}>
          <SectionLabel>{t('emp.roles')}</SectionLabel>
          <div style={{display:'flex',gap:5,flexWrap:'wrap',marginTop:4}}>
            {allRoles.map(r=>{const active=(emp.roles||[]).includes(r),rs=roleStyles[r]||DEFAULT_ROLE_STYLES.Other;return<button key={r} onClick={()=>{const cur=emp.roles||[];const next=active?cur.filter(x=>x!==r):[...cur,r];if(next.length>0)updateEmp(emp.id,'roles',next);}} style={{display:'inline-flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:999,fontSize:11,fontWeight:500,background:active?(isDark()?rs.dot+'22':rs.bg):'transparent',color:active?(isDark()?rs.dot:rs.text):T.text3,border:`1px solid ${active?(isDark()?rs.dot+'55':rs.border):T.border}`,cursor:'pointer',fontFamily:'inherit'}}><span style={{width:5,height:5,borderRadius:'50%',background:active?rs.dot:T.text3}}/>{r}</button>;})}
          </div>
        </div>
        <div style={{background:T.surfaceWarm,border:`1px solid ${T.border}`,borderRadius:10,padding:'12px 14px',marginBottom:12}}>
          <SectionLabel>{t('emp.contract')}</SectionLabel>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:6,alignItems:'flex-start'}}>
            <div style={{flex:'1 1 140px'}}><div style={{fontSize:11,color:T.text3,marginBottom:4}}>{t('emp.paidBy')}</div><div style={{display:'flex',gap:3}}>{[['hourly',t('emp.hourly')],['fixed',t('emp.fixedSalary')]].map(([k,l])=><button key={k} onClick={()=>updateEmp(emp.id,'contractType',k)} style={{flex:1,padding:'5px 8px',borderRadius:7,fontSize:11,fontWeight:(emp.contractType||'hourly')===k?600:400,background:(emp.contractType||'hourly')===k?T.surface:'transparent',border:`1px solid ${T.border}`,cursor:'pointer',fontFamily:'inherit',color:(emp.contractType||'hourly')===k?T.text:T.text2}}>{l}</button>)}</div></div>
            <div style={{flex:'1 1 130px'}}><div style={{fontSize:11,color:T.text3,marginBottom:4}}>{t('emp.period')}</div><div style={{display:'flex',gap:3}}>{[['week',t('emp.perWeek')],['month',t('emp.perMonth')]].map(([k,l])=><button key={k} onClick={()=>updateEmp(emp.id,'contractPeriod',k)} style={{flex:1,padding:'5px 8px',borderRadius:7,fontSize:11,fontWeight:(emp.contractPeriod||'week')===k?600:400,background:(emp.contractPeriod||'week')===k?T.surface:'transparent',border:`1px solid ${T.border}`,cursor:'pointer',fontFamily:'inherit',color:(emp.contractPeriod||'week')===k?T.text:T.text2}}>{l}</button>)}</div></div>
            <div style={{flex:'1 1 110px'}}><div style={{fontSize:11,color:T.text3,marginBottom:4}}>{(emp.contractType||'hourly')==='hourly'?t('emp.hourlyRate'):t('emp.monthlySalary')}</div><div style={{display:'flex',alignItems:'center',gap:5}}><input type="number" min="0" step="1" value={emp.wage??''} onChange={e=>{const v=e.target.value;updateEmp(emp.id,'wage',v===''?'':Number(v));}} onBlur={e=>{if(e.target.value==='')updateEmp(emp.id,'wage',0);}} style={{...s.input,flex:1}}/><span style={{fontSize:11,color:T.text3,flexShrink:0}}>{(emp.contractType||'hourly')==='hourly'?`${currency}/h`:`${currency}/mo`}</span></div></div>
            <div style={{flex:'1 1 90px'}}><div style={{fontSize:11,color:T.text3,marginBottom:4}}>{(emp.contractPeriod||'week')==='month'?t('emp.maxHMonth'):t('emp.maxHWeek')}</div><input type="number" min="4" max="250" value={emp.maxHours??''} onChange={e=>{const v=e.target.value;updateEmp(emp.id,'maxHours',v===''?'':Number(v));}} onBlur={e=>{if(e.target.value==='')updateEmp(emp.id,'maxHours',40);}} style={s.input}/></div>
            <div style={{flex:'1 1 100px'}}><div style={{fontSize:11,color:T.text3,marginBottom:4}}>{t('emp.targetHours')}</div><input type="number" min="0" max="250" value={emp.targetHours??emp.maxHours??''} onChange={e=>{const v=e.target.value;updateEmp(emp.id,'targetHours',v===''?'':Number(v));}} onBlur={e=>{if(e.target.value==='')updateEmp(emp.id,'targetHours',emp.maxHours||40);}} style={s.input}/><div style={{fontSize:9,color:T.text3,marginTop:3}}>{t('emp.targetHoursHint')}</div></div>
            <div style={{flex:'1 1 80px'}}><div style={{fontSize:11,color:T.text3,marginBottom:4}}>{t('emp.priority')} %</div><input type="number" min="10" max="200" step="5" value={emp.priority??''} onChange={e=>{const v=e.target.value;updateEmp(emp.id,'priority',v===''?'':Number(v));}} onBlur={e=>{if(e.target.value==='')updateEmp(emp.id,'priority',100);}} style={s.input}/><div style={{fontSize:9,color:T.text3,marginTop:3}}>{t('emp.lowerFirst')}</div></div>
          </div>
        </div>
        <div style={{marginBottom:10}}><SectionLabel>{t('emp.quickTemplates')}</SectionLabel><div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:4}}>{Object.keys(AVAIL_TEMPLATES).map(tpl=><button key={tpl} onClick={()=>applyTemplate(emp.id,tpl)} style={{padding:'4px 10px',borderRadius:6,fontSize:11,cursor:'pointer',background:T.surfaceWarm,border:`1px solid ${T.border}`,color:T.text2,fontFamily:'inherit'}}>{t('tpl.'+tpl)}</button>)}</div></div>
        <SectionLabel>{t('emp.weeklyAvail')}</SectionLabel>
        <div style={{display:'flex',flexDirection:'column',gap:6,marginTop:6}}>
          {DAYS.map(day=>{const avail=emp.availability[day],p=pal(emp);return(<div key={day} style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <button onClick={()=>toggleDay(emp.id,day)} style={{width:46,padding:'4px 0',borderRadius:6,fontSize:11,fontWeight:500,cursor:'pointer',background:avail?(isDark()?p.dot+'22':p.bg):'transparent',color:avail?(isDark()?p.dot:p.text):T.text3,border:`1px solid ${avail?p.dot+'55':T.border}`,textAlign:'center',fontFamily:'inherit'}}>{t('day.'+day)}</button>
            {avail?(<><span style={{fontSize:11,color:T.text3}}>{t('common.fromCap')}</span><TimePicker value={avail.from} onChange={v=>updateAvail(emp.id,day,'from',v)} small/><span style={{fontSize:11,color:T.text3}}>{t('common.toLower')}</span><TimePicker value={avail.to} onChange={v=>updateAvail(emp.id,day,'to',v)} small/><span style={{fontSize:11,color:T.text3}}>{(()=>{const sv=toMin(avail.from);let ev=toMin(avail.to);if(ev<=sv)ev+=1440;return`${((ev-sv)/60).toFixed(1)}h`;})()}</span></>):<span style={{fontSize:11,color:T.text3}}>{t('emp.notAvailable')}</span>}
          </div>);})}
        </div>
        <div style={{marginTop:16,paddingTop:16,borderTop:`1px solid ${T.border}`}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8,gap:8,flexWrap:'wrap'}}>
            <SectionLabel>{t('emp.documents')}</SectionLabel>
            <label style={{fontSize:11,fontWeight:600,color:T.accent,cursor:docBusy[emp.id]?'default':'pointer',opacity:docBusy[emp.id]?0.5:1}}>
              {docBusy[emp.id]?t('emp.docUploading'):('+ '+t('emp.docUpload'))}
              <input type="file" style={{display:'none'}} disabled={!!docBusy[emp.id]} onChange={e=>{const f=e.target.files?.[0];if(f)handleUploadDoc(emp.id,f);e.target.value='';}}/>
            </label>
          </div>
          {docErrors[emp.id]&&<div style={{fontSize:11,color:T.danger,marginBottom:8}}>{docErrors[emp.id]}</div>}
          {empDocs[emp.id]===undefined?(
            <div style={{fontSize:11,color:T.text3,fontStyle:'italic'}}>{t('emp.docLoading')}</div>
          ):empDocs[emp.id].length===0?(
            <div style={{fontSize:11,color:T.text3,fontStyle:'italic'}}>{t('emp.noDocuments')}</div>
          ):(
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {empDocs[emp.id].map(doc=>(
                <div key={doc.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',borderRadius:8,background:T.surfaceWarm,border:`1px solid ${T.border}`}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:500,color:T.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{doc.fileName}</div>
                    <div style={{fontSize:10,color:T.text3}}>{fmtSize(doc.sizeBytes)} · {new Date(doc.createdAt).toLocaleDateString()}{doc.uploadedBy?` · ${doc.uploadedBy}`:''}</div>
                  </div>
                  <button onClick={()=>handleOpenDoc(doc)} style={{fontSize:11,fontWeight:500,color:T.accent,background:'none',border:'none',cursor:'pointer',fontFamily:'inherit'}}>{t('emp.docOpen')}</button>
                  <button onClick={()=>handleDeleteDoc(emp.id,doc)} style={{fontSize:11,fontWeight:500,color:T.danger,background:'none',border:'none',cursor:'pointer',fontFamily:'inherit'}}>{t('common.remove')}</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>)}
    </div>))}
    {showAddEmp&&(<div style={s.card}>
      <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:15,fontWeight:500,marginBottom:14}}>{t('emp.newEmployee')}</div>
      <div style={{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap'}}>
        <input placeholder={t('emp.fullName')} value={newEmp.name} onChange={e=>setNewEmp(p=>({...p,name:e.target.value}))} style={{...s.input,flex:'2 1 130px'}} autoFocus/>
        <input type="email" placeholder={t('team.emailPlaceholder')} value={newEmp.email||''} onChange={e=>setNewEmp(p=>({...p,email:e.target.value}))} style={{...s.input,flex:'2 1 160px'}}/>
        <div style={{flex:'2 1 200px'}}><div style={{fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>{t('emp.roles')}</div><div style={{display:'flex',gap:4,flexWrap:'wrap'}}>{allRoles.map(r=>{const active=(newEmp.roles||[]).includes(r),rs=roleStyles[r]||DEFAULT_ROLE_STYLES.Other;return<button key={r} onClick={()=>{const cur=newEmp.roles||[];const next=active?cur.filter(x=>x!==r):[...cur,r];if(next.length>0)setNewEmp(p=>({...p,roles:next}));}} style={{display:'inline-flex',alignItems:'center',gap:4,padding:'4px 9px',borderRadius:999,fontSize:11,fontWeight:500,background:active?(isDark()?rs.dot+'22':rs.bg):'transparent',color:active?(isDark()?rs.dot:rs.text):T.text3,border:`1px solid ${active?(isDark()?rs.dot+'55':rs.border):T.border}`,cursor:'pointer',fontFamily:'inherit'}}><span style={{width:5,height:5,borderRadius:'50%',background:active?rs.dot:T.text3}}/>{r}</button>;})}
        </div></div>
      </div>
      <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap',alignItems:'flex-start'}}>
        <div style={{flex:'1 1 120px'}}><div style={{fontSize:11,color:T.text3,marginBottom:3}}>{t('emp.paidBy')}</div><div style={{display:'flex',gap:3}}>{[['hourly',t('emp.hourly')],['fixed',t('emp.fixed')]].map(([k,l])=><button key={k} onClick={()=>setNewEmp(p=>({...p,contractType:k}))} style={{flex:1,padding:'5px 6px',borderRadius:7,fontSize:11,fontWeight:(newEmp.contractType||'hourly')===k?600:400,background:(newEmp.contractType||'hourly')===k?T.bg:'transparent',border:`1px solid ${T.border}`,cursor:'pointer',fontFamily:'inherit',color:(newEmp.contractType||'hourly')===k?T.text:T.text2}}>{l}</button>)}</div></div>
        <div style={{flex:'1 1 120px'}}><div style={{fontSize:11,color:T.text3,marginBottom:3}}>{t('emp.period')}</div><div style={{display:'flex',gap:3}}>{[['week',t('emp.week')],['month',t('emp.month')]].map(([k,l])=><button key={k} onClick={()=>setNewEmp(p=>({...p,contractPeriod:k}))} style={{flex:1,padding:'5px 6px',borderRadius:7,fontSize:11,fontWeight:(newEmp.contractPeriod||'week')===k?600:400,background:(newEmp.contractPeriod||'week')===k?T.bg:'transparent',border:`1px solid ${T.border}`,cursor:'pointer',fontFamily:'inherit',color:(newEmp.contractPeriod||'week')===k?T.text:T.text2}}>{l}</button>)}</div></div>
        <div style={{flex:'1 1 100px'}}><div style={{fontSize:11,color:T.text3,marginBottom:3}}>{(newEmp.contractType||'hourly')==='hourly'?t('emp.hourlyRate'):t('emp.monthlySalary')}</div><div style={{display:'flex',gap:4,alignItems:'center'}}><input type="number" min="0" step="1" value={newEmp.wage??''} onChange={e=>{const v=e.target.value;setNewEmp(p=>({...p,wage:v===''?'':Number(v)}));}} onBlur={e=>{if(e.target.value==='')setNewEmp(p=>({...p,wage:0}));}} style={{...s.input,flex:1}}/><span style={{fontSize:11,color:T.text3,flexShrink:0}}>{(newEmp.contractType||'hourly')==='hourly'?`${currency}/h`:`${currency}/mo`}</span></div></div>
        <div style={{flex:'1 1 70px'}}><div style={{fontSize:11,color:T.text3,marginBottom:3}}>{(newEmp.contractPeriod||'week')==='month'?t('emp.maxHMo'):t('emp.maxHWk')}</div><input type="number" min="4" max="250" value={newEmp.maxHours??''} onChange={e=>{const v=e.target.value;setNewEmp(p=>({...p,maxHours:v===''?'':Number(v)}));}} onBlur={e=>{if(e.target.value==='')setNewEmp(p=>({...p,maxHours:40}));}} style={s.input}/></div>
        <div style={{flex:'1 1 80px'}}><div style={{fontSize:11,color:T.text3,marginBottom:3}}>{t('emp.targetHours')}</div><input type="number" min="0" max="250" value={newEmp.targetHours??newEmp.maxHours??''} onChange={e=>{const v=e.target.value;setNewEmp(p=>({...p,targetHours:v===''?'':Number(v)}));}} onBlur={e=>{if(e.target.value==='')setNewEmp(p=>({...p,targetHours:p.maxHours||40}));}} style={s.input}/></div>
        <div style={{flex:'1 1 70px'}}><div style={{fontSize:11,color:T.text3,marginBottom:3}}>{t('emp.priority')} %</div><input type="number" min="10" max="200" step="5" value={newEmp.priority??''} onChange={e=>{const v=e.target.value;setNewEmp(p=>({...p,priority:v===''?'':Number(v)}));}} onBlur={e=>{if(e.target.value==='')setNewEmp(p=>({...p,priority:100}));}} style={s.input}/></div>
      </div>
      <div style={{display:'flex',gap:8}}><Btn onClick={addEmployee}>{t('emp.addEmployee')}</Btn><Btn onClick={()=>setShowAddEmp(false)} variant="ghost">{t('common.cancel')}</Btn></div>
    </div>)}
    {!showAddEmp&&<Btn onClick={()=>setShowAddEmp(true)} variant="secondary">{t('emp.addEmployeeBtn')}</Btn>}

    {/* Former staff. Compact and collapsed by default — they're kept for their
        history, not for day-to-day use, so they shouldn't compete with the
        active roster for attention. Restoring is one click, because "they're
        back for the summer" is a real thing. */}
    {(() => {
      const archived = employees.filter(e => e.archived);
      if (!archived.length) return null;
      return (
        <div style={{...s.card, marginTop: 4}}>
          <button onClick={()=>setShowArchived(v=>!v)} style={{display:'flex',alignItems:'center',gap:8,width:'100%',background:'none',border:'none',padding:0,cursor:'pointer',fontFamily:'inherit',textAlign:'left'}}>
            <span style={{fontSize:10,color:T.text3,transform:showArchived?'none':'rotate(-90deg)',transition:'transform 0.15s',display:'inline-block'}}>▾</span>
            <span style={{fontSize:11,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em'}}>{t('emp.archivedHeading',{n:archived.length})}</span>
          </button>
          {showArchived && (
            <div style={{display:'flex',flexDirection:'column',gap:6,marginTop:12}}>
              {archived.map(emp=>(
                <div key={emp.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:9,background:T.surfaceWarm,border:`1px solid ${T.border}`}}>
                  <span style={{opacity:0.55,display:'flex'}}><Avatar emp={emp} size={28}/></span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:500,color:T.text2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{emp.name}</div>
                    <div style={{fontSize:10,color:T.text3}}>{t('emp.archivedNote')}</div>
                  </div>
                  {archiveEmp && <Btn onClick={()=>archiveEmp(emp.id,false)} variant="secondary" small>{t('emp.restore')}</Btn>}
                  <Btn onClick={()=>{ if(confirm(t('emp.deleteConfirm',{name:emp.name}))) removeEmp(emp.id); }} variant="danger" small>✕</Btn>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    })()}
  </div>

  <TeamAccess orgId={orgId} orgName={orgName} isOwner={isOwner} s={s} t={t}/>
  </>);
}
