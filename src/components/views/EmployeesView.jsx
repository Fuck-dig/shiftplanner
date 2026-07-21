import { T, DAYS, AVAIL_TEMPLATES, DEFAULT_ROLE_STYLES, pal } from '../../lib/constants';
import { toMin } from '../../lib/dates';
import { Avatar, RoleBadge, Btn, SectionLabel } from '../ui';
import TeamAccess from '../TeamAccess';

export default function EmployeesView({
  employees, allRoles, roleStyles,
  expandedEmp, setExpandedEmp,
  updateEmp, updateAvail, toggleDay, applyTemplate, duplicateEmp, removeEmp,
  showAddEmp, setShowAddEmp, newEmp, setNewEmp, addEmployee,
  onAddShift,
  orgId, orgName, isOwner, s, t,
}){
  return (<>
  <div style={{display:'flex',flexDirection:'column',gap:10}}>
    {employees.map(emp=>(<div key={emp.id} style={s.card}>
      <div style={{display:'flex',alignItems:'center',gap:12}}>
        <Avatar emp={emp} size={40}/>
        <div style={{flex:1}}>
          <div style={{fontSize:14,fontWeight:500,display:'flex',alignItems:'center',gap:8,marginBottom:3,flexWrap:'wrap'}}>{emp.name}{(emp.roles||[]).map(r=><RoleBadge key={r} role={r} rs={roleStyles[r]}/>)}</div>
          <div style={{fontSize:12,color:T.text2}}>{(emp.contractType||'hourly')==='hourly'?`${emp.wage||'—'} kr/h`:`${(emp.wage||0).toLocaleString('da-DK')} kr/mo`} · max {emp.maxHours}h/{(emp.contractPeriod||'week')==='month'?'month':'week'}</div>
        </div>
        <div style={{display:'flex',gap:6}}>
          <Btn onClick={()=>onAddShift(emp)} variant="secondary" small>{'+ '+t('emp.addShift')}</Btn>
          <Btn onClick={()=>duplicateEmp(emp)} variant="ghost" small>{'⧉ '+t('emp.clone')}</Btn>
          <Btn onClick={()=>setExpandedEmp(expandedEmp===emp.id?null:emp.id)} variant={expandedEmp===emp.id?'secondary':'ghost'} small>{expandedEmp===emp.id?t('common.close'):t('common.edit')}</Btn>
          <Btn onClick={()=>removeEmp(emp.id)} variant="danger" small>✕</Btn>
        </div>
      </div>
      {expandedEmp===emp.id&&(<div style={{marginTop:18,paddingTop:18,borderTop:`1px solid ${T.border}`}}>
        <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
          <div style={{flex:'2 1 120px'}}><SectionLabel>{t('emp.name')}</SectionLabel><input value={emp.name} onChange={e=>updateEmp(emp.id,'name',e.target.value)} style={s.input}/></div>
        </div>
        <div style={{marginBottom:12}}>
          <SectionLabel>{t('emp.roles')}</SectionLabel>
          <div style={{display:'flex',gap:5,flexWrap:'wrap',marginTop:4}}>
            {allRoles.map(r=>{const active=(emp.roles||[]).includes(r),rs=roleStyles[r]||DEFAULT_ROLE_STYLES.Other;return<button key={r} onClick={()=>{const cur=emp.roles||[];const next=active?cur.filter(x=>x!==r):[...cur,r];if(next.length>0)updateEmp(emp.id,'roles',next);}} style={{display:'inline-flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:999,fontSize:11,fontWeight:500,background:active?rs.bg:'transparent',color:active?rs.text:T.text3,border:`1px solid ${active?rs.border:T.border}`,cursor:'pointer',fontFamily:'inherit'}}><span style={{width:5,height:5,borderRadius:'50%',background:active?rs.dot:T.text3}}/>{r}</button>;})}
          </div>
        </div>
        <div style={{background:T.surfaceWarm,border:`1px solid ${T.border}`,borderRadius:10,padding:'12px 14px',marginBottom:12}}>
          <SectionLabel>{t('emp.contract')}</SectionLabel>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:6,alignItems:'flex-start'}}>
            <div style={{flex:'1 1 140px'}}><div style={{fontSize:11,color:T.text3,marginBottom:4}}>{t('emp.paidBy')}</div><div style={{display:'flex',gap:3}}>{[['hourly',t('emp.hourly')],['fixed',t('emp.fixedSalary')]].map(([k,l])=><button key={k} onClick={()=>updateEmp(emp.id,'contractType',k)} style={{flex:1,padding:'5px 8px',borderRadius:7,fontSize:11,fontWeight:(emp.contractType||'hourly')===k?600:400,background:(emp.contractType||'hourly')===k?T.surface:'transparent',border:`1px solid ${T.border}`,cursor:'pointer',fontFamily:'inherit',color:(emp.contractType||'hourly')===k?T.text:T.text2}}>{l}</button>)}</div></div>
            <div style={{flex:'1 1 130px'}}><div style={{fontSize:11,color:T.text3,marginBottom:4}}>{t('emp.period')}</div><div style={{display:'flex',gap:3}}>{[['week',t('emp.perWeek')],['month',t('emp.perMonth')]].map(([k,l])=><button key={k} onClick={()=>updateEmp(emp.id,'contractPeriod',k)} style={{flex:1,padding:'5px 8px',borderRadius:7,fontSize:11,fontWeight:(emp.contractPeriod||'week')===k?600:400,background:(emp.contractPeriod||'week')===k?T.surface:'transparent',border:`1px solid ${T.border}`,cursor:'pointer',fontFamily:'inherit',color:(emp.contractPeriod||'week')===k?T.text:T.text2}}>{l}</button>)}</div></div>
            <div style={{flex:'1 1 110px'}}><div style={{fontSize:11,color:T.text3,marginBottom:4}}>{(emp.contractType||'hourly')==='hourly'?t('emp.hourlyRate'):t('emp.monthlySalary')}</div><div style={{display:'flex',alignItems:'center',gap:5}}><input type="number" min="0" step="1" value={emp.wage||0} onChange={e=>updateEmp(emp.id,'wage',Number(e.target.value))} style={{...s.input,flex:1}}/><span style={{fontSize:11,color:T.text3,flexShrink:0}}>{(emp.contractType||'hourly')==='hourly'?'kr/h':'kr/mo'}</span></div></div>
            <div style={{flex:'1 1 90px'}}><div style={{fontSize:11,color:T.text3,marginBottom:4}}>{(emp.contractPeriod||'week')==='month'?t('emp.maxHMonth'):t('emp.maxHWeek')}</div><input type="number" min="4" max="250" value={emp.maxHours} onChange={e=>updateEmp(emp.id,'maxHours',Number(e.target.value))} style={s.input}/></div>
            <div style={{flex:'1 1 100px'}}><div style={{fontSize:11,color:T.text3,marginBottom:4}}>{t('emp.targetHours')}</div><input type="number" min="0" max="250" value={emp.targetHours??emp.maxHours} onChange={e=>updateEmp(emp.id,'targetHours',Number(e.target.value))} style={s.input}/><div style={{fontSize:9,color:T.text3,marginTop:3}}>{t('emp.targetHoursHint')}</div></div>
            <div style={{flex:'1 1 80px'}}><div style={{fontSize:11,color:T.text3,marginBottom:4}}>{t('emp.priority')} %</div><input type="number" min="10" max="200" step="5" value={emp.priority||100} onChange={e=>updateEmp(emp.id,'priority',Number(e.target.value))} style={s.input}/><div style={{fontSize:9,color:T.text3,marginTop:3}}>{t('emp.lowerFirst')}</div></div>
          </div>
        </div>
        <div style={{marginBottom:10}}><SectionLabel>{t('emp.quickTemplates')}</SectionLabel><div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:4}}>{Object.keys(AVAIL_TEMPLATES).map(tpl=><button key={tpl} onClick={()=>applyTemplate(emp.id,tpl)} style={{padding:'4px 10px',borderRadius:6,fontSize:11,cursor:'pointer',background:T.surfaceWarm,border:`1px solid ${T.border}`,color:T.text2,fontFamily:'inherit'}}>{t('tpl.'+tpl)}</button>)}</div></div>
        <SectionLabel>{t('emp.weeklyAvail')}</SectionLabel>
        <div style={{display:'flex',flexDirection:'column',gap:6,marginTop:6}}>
          {DAYS.map(day=>{const avail=emp.availability[day],p=pal(emp);return(<div key={day} style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <button onClick={()=>toggleDay(emp.id,day)} style={{width:46,padding:'4px 0',borderRadius:6,fontSize:11,fontWeight:500,cursor:'pointer',background:avail?p.bg:'transparent',color:avail?p.text:T.text3,border:`1px solid ${avail?p.dot+'55':T.border}`,textAlign:'center',fontFamily:'inherit'}}>{t('day.'+day)}</button>
            {avail?(<><span style={{fontSize:11,color:T.text3}}>{t('common.fromCap')}</span><input type="time" value={avail.from} onChange={e=>updateAvail(emp.id,day,'from',e.target.value)} style={{...s.input,width:'auto',padding:'4px 8px',fontSize:12}}/><span style={{fontSize:11,color:T.text3}}>{t('common.toLower')}</span><input type="time" value={avail.to} onChange={e=>updateAvail(emp.id,day,'to',e.target.value)} style={{...s.input,width:'auto',padding:'4px 8px',fontSize:12}}/><span style={{fontSize:11,color:T.text3}}>{(()=>{const sv=toMin(avail.from);let ev=toMin(avail.to);if(ev<=sv)ev+=1440;return`${((ev-sv)/60).toFixed(1)}h`;})()}</span></>):<span style={{fontSize:11,color:T.text3}}>{t('emp.notAvailable')}</span>}
          </div>);})}
        </div>
      </div>)}
    </div>))}
    {showAddEmp&&(<div style={s.card}>
      <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:15,fontWeight:500,marginBottom:14}}>{t('emp.newEmployee')}</div>
      <div style={{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap'}}>
        <input placeholder={t('emp.fullName')} value={newEmp.name} onChange={e=>setNewEmp(p=>({...p,name:e.target.value}))} style={{...s.input,flex:'2 1 130px'}} autoFocus/>
        <div style={{flex:'2 1 200px'}}><div style={{fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>{t('emp.roles')}</div><div style={{display:'flex',gap:4,flexWrap:'wrap'}}>{allRoles.map(r=>{const active=(newEmp.roles||[]).includes(r),rs=roleStyles[r]||DEFAULT_ROLE_STYLES.Other;return<button key={r} onClick={()=>{const cur=newEmp.roles||[];const next=active?cur.filter(x=>x!==r):[...cur,r];if(next.length>0)setNewEmp(p=>({...p,roles:next}));}} style={{display:'inline-flex',alignItems:'center',gap:4,padding:'4px 9px',borderRadius:999,fontSize:11,fontWeight:500,background:active?rs.bg:'transparent',color:active?rs.text:T.text3,border:`1px solid ${active?rs.border:T.border}`,cursor:'pointer',fontFamily:'inherit'}}><span style={{width:5,height:5,borderRadius:'50%',background:active?rs.dot:T.text3}}/>{r}</button>;})}
        </div></div>
      </div>
      <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap',alignItems:'flex-start'}}>
        <div style={{flex:'1 1 120px'}}><div style={{fontSize:11,color:T.text3,marginBottom:3}}>{t('emp.paidBy')}</div><div style={{display:'flex',gap:3}}>{[['hourly',t('emp.hourly')],['fixed',t('emp.fixed')]].map(([k,l])=><button key={k} onClick={()=>setNewEmp(p=>({...p,contractType:k}))} style={{flex:1,padding:'5px 6px',borderRadius:7,fontSize:11,fontWeight:(newEmp.contractType||'hourly')===k?600:400,background:(newEmp.contractType||'hourly')===k?T.bg:'transparent',border:`1px solid ${T.border}`,cursor:'pointer',fontFamily:'inherit',color:(newEmp.contractType||'hourly')===k?T.text:T.text2}}>{l}</button>)}</div></div>
        <div style={{flex:'1 1 120px'}}><div style={{fontSize:11,color:T.text3,marginBottom:3}}>{t('emp.period')}</div><div style={{display:'flex',gap:3}}>{[['week',t('emp.week')],['month',t('emp.month')]].map(([k,l])=><button key={k} onClick={()=>setNewEmp(p=>({...p,contractPeriod:k}))} style={{flex:1,padding:'5px 6px',borderRadius:7,fontSize:11,fontWeight:(newEmp.contractPeriod||'week')===k?600:400,background:(newEmp.contractPeriod||'week')===k?T.bg:'transparent',border:`1px solid ${T.border}`,cursor:'pointer',fontFamily:'inherit',color:(newEmp.contractPeriod||'week')===k?T.text:T.text2}}>{l}</button>)}</div></div>
        <div style={{flex:'1 1 100px'}}><div style={{fontSize:11,color:T.text3,marginBottom:3}}>{(newEmp.contractType||'hourly')==='hourly'?t('emp.hourlyRate'):t('emp.monthlySalary')}</div><div style={{display:'flex',gap:4,alignItems:'center'}}><input type="number" min="0" step="1" value={newEmp.wage||0} onChange={e=>setNewEmp(p=>({...p,wage:Number(e.target.value)}))} style={{...s.input,flex:1}}/><span style={{fontSize:11,color:T.text3,flexShrink:0}}>{(newEmp.contractType||'hourly')==='hourly'?'kr/h':'kr/mo'}</span></div></div>
        <div style={{flex:'1 1 70px'}}><div style={{fontSize:11,color:T.text3,marginBottom:3}}>{(newEmp.contractPeriod||'week')==='month'?t('emp.maxHMo'):t('emp.maxHWk')}</div><input type="number" min="4" max="250" value={newEmp.maxHours} onChange={e=>setNewEmp(p=>({...p,maxHours:Number(e.target.value)}))} style={s.input}/></div>
        <div style={{flex:'1 1 80px'}}><div style={{fontSize:11,color:T.text3,marginBottom:3}}>{t('emp.targetHours')}</div><input type="number" min="0" max="250" value={newEmp.targetHours??newEmp.maxHours} onChange={e=>setNewEmp(p=>({...p,targetHours:Number(e.target.value)}))} style={s.input}/></div>
        <div style={{flex:'1 1 70px'}}><div style={{fontSize:11,color:T.text3,marginBottom:3}}>{t('emp.priority')} %</div><input type="number" min="10" max="200" step="5" value={newEmp.priority||100} onChange={e=>setNewEmp(p=>({...p,priority:Number(e.target.value)}))} style={s.input}/></div>
      </div>
      <div style={{display:'flex',gap:8}}><Btn onClick={addEmployee}>{t('emp.addEmployee')}</Btn><Btn onClick={()=>setShowAddEmp(false)} variant="ghost">{t('common.cancel')}</Btn></div>
    </div>)}
    {!showAddEmp&&<Btn onClick={()=>setShowAddEmp(true)} variant="secondary">{t('emp.addEmployeeBtn')}</Btn>}
  </div>

  <TeamAccess orgId={orgId} orgName={orgName} isOwner={isOwner} s={s} t={t}/>
  </>);
}
