import { T, TIMEOFF_TYPES } from '../../lib/constants';
import { fmt, fmtLong } from '../../lib/dates';
import { Avatar, StatusBadge, Btn, SectionLabel, EmpChip } from '../ui';

export default function TimeOffView({
  offThisWeek, weekDates,
  toFilter, setToFilter,
  showAddTO, setShowAddTO, newTO, setNewTO, addTO,
  employees, filteredTO, updateTOStatus, removeTO,
  pendingSwaps, blocks, approveSwap, declineSwapManager,
  s, t,
}){
  return (<div style={{display:'flex',flexDirection:'column',gap:12}}>
    {pendingSwaps.length>0&&(<div style={s.card}>
      <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:15,fontWeight:500,marginBottom:12}}>{t('swap.pendingApprovals')}</div>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {pendingSwaps.map(sw=>{
          const from=employees.find(e=>e.id===sw.fromEmpId),claimant=employees.find(e=>e.id===sw.claimedByEmpId),block=blocks.find(b=>b.id===sw.blockId);
          return(<div key={sw.id} style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',padding:'10px 14px',borderRadius:10,border:`1px solid ${T.border}`,background:T.surfaceWarm}}>
            <span style={{fontSize:12,color:T.text,flex:1,minWidth:200}}><b>{from?.name||'?'}</b> {t('swap.to',{name:claimant?.name||'?'})} · {block?.name||''} · {sw.role} · {t('day.'+sw.day)}</span>
            <Btn small variant="success" onClick={()=>approveSwap(sw)}>{t('swap.approve')}</Btn>
            <Btn small variant="danger" onClick={()=>declineSwapManager(sw)}>{t('to.reject')}</Btn>
          </div>);
        })}
      </div>
    </div>)}
    {offThisWeek.length>0&&(<div style={{background:T.warningLight,border:`1px solid ${T.warning}33`,borderRadius:10,padding:'12px 16px'}}>
      <div style={{fontSize:12,fontWeight:600,color:T.warning,marginBottom:8}}>{t('sched.onLeaveWeek')} ({fmt(weekDates[0])} – {fmt(weekDates[6])})</div>
      <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{offThisWeek.map(e=><EmpChip key={e.id} emp={e}/>)}</div>
    </div>)}
    <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
      <div style={{display:'flex',background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:3,gap:2}}>
        {[['all',t('to.all')],['pending',t('to.pending')],['approved',t('to.approved')],['this-week',t('to.thisWeek')]].map(([k,l])=><button key={k} onClick={()=>setToFilter(k)} style={{padding:'4px 10px',borderRadius:6,background:toFilter===k?T.bg:'transparent',border:toFilter===k?`1px solid ${T.border}`:'1px solid transparent',cursor:'pointer',fontSize:12,fontWeight:toFilter===k?500:400,color:toFilter===k?T.text:T.text2,fontFamily:'inherit'}}>{l}</button>)}
      </div>
      <div style={{marginLeft:'auto'}}><Btn onClick={()=>setShowAddTO(true)}>{t('to.addRequest')}</Btn></div>
    </div>
    {showAddTO&&(<div style={s.card}>
      <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:15,fontWeight:500,marginBottom:14}}>{t('to.newRequest')}</div>
      <div style={{display:'flex',gap:10,marginBottom:12,flexWrap:'wrap'}}>
        <div style={{flex:'2 1 140px'}}><SectionLabel>{t('to.employee')}</SectionLabel><select value={newTO.empId} onChange={e=>setNewTO(p=>({...p,empId:e.target.value}))} style={s.select}><option value="">{t('to.selectEllipsis')}</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
        <div style={{flex:'1 1 120px'}}><SectionLabel>{t('common.fromCap')}</SectionLabel><input type="date" value={newTO.startDate} onChange={e=>setNewTO(p=>({...p,startDate:e.target.value}))} style={s.input}/></div>
        <div style={{flex:'1 1 120px'}}><SectionLabel>{t('common.toCap')}</SectionLabel><input type="date" value={newTO.endDate} onChange={e=>setNewTO(p=>({...p,endDate:e.target.value}))} style={s.input}/></div>
        <div style={{flex:'1 1 100px'}}><SectionLabel>{t('to.type')}</SectionLabel><select value={newTO.type} onChange={e=>setNewTO(p=>({...p,type:e.target.value}))} style={s.select}>{TIMEOFF_TYPES.map(tt=><option key={tt} value={tt}>{tt}</option>)}</select></div>
        <div style={{flex:'2 1 140px'}}><SectionLabel>{t('to.note')}</SectionLabel><input placeholder={t('to.optional')} value={newTO.note} onChange={e=>setNewTO(p=>({...p,note:e.target.value}))} style={s.input}/></div>
        <div style={{flex:'1 1 100px'}}><SectionLabel>{t('to.status')}</SectionLabel><select value={newTO.status} onChange={e=>setNewTO(p=>({...p,status:e.target.value}))} style={s.select}><option>Pending</option><option>Approved</option></select></div>
      </div>
      <div style={{display:'flex',gap:8}}><Btn onClick={addTO}>{t('to.saveRequest')}</Btn><Btn onClick={()=>setShowAddTO(false)} variant="ghost">{t('common.cancel')}</Btn></div>
    </div>)}
    {filteredTO.length===0?(<div style={{...s.card,textAlign:'center',padding:'44px 32px',position:'relative',overflow:'hidden'}}>
      <div style={{position:'absolute',inset:0,backgroundImage:`radial-gradient(circle, ${T.border} 1px, transparent 1px)`,backgroundSize:'24px 24px',opacity:0.4,pointerEvents:'none'}}/>
      <div style={{position:'relative'}}><div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:18,color:T.text,marginBottom:6}}>{toFilter!=='all'?t('to.noneFilter',{filter:t('to.'+(toFilter==='this-week'?'thisWeek':toFilter)).toLowerCase()}):t('to.noneYet')}</div>{toFilter==='all'&&<Btn onClick={()=>setShowAddTO(true)}>{t('to.addFirst')}</Btn>}</div>
    </div>):filteredTO.map(to=>{
      const emp=employees.find(e=>e.id===to.empId),days=Math.round((new Date(to.endDate)-new Date(to.startDate))/(24*3600*1000))+1,borderColor={Approved:T.success,Pending:T.warning,Rejected:T.danger}[to.status]||T.border;
      return(<div key={to.id} style={{...s.card,borderLeft:`3px solid ${borderColor}`,padding:'14px 18px',display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
        {emp&&<Avatar emp={emp} size={38}/>}
        <div style={{flex:1,minWidth:140}}>
          <div style={{fontSize:13,fontWeight:500,marginBottom:3}}>{emp?.name||t('to.unknown')}</div>
          <div style={{fontSize:12,color:T.text2}}>{fmtLong(to.startDate)} – {fmtLong(to.endDate)} · <b>{days}</b> {t.n('to.dayUnit',days)}</div>
          <div style={{display:'flex',gap:6,marginTop:4,alignItems:'center'}}>
            <span style={{fontSize:11,color:T.text3,background:T.bg,padding:'1px 7px',borderRadius:999,border:`1px solid ${T.border}`}}>{to.type}</span>
            {to.note&&<span style={{fontSize:11,color:T.text3,fontStyle:'italic'}}>"{to.note}"</span>}
          </div>
        </div>
        <StatusBadge status={to.status}/>
        <div style={{display:'flex',gap:6}}>
          {to.status!=='Approved'&&<Btn onClick={()=>updateTOStatus(to.id,'Approved')} variant="success" small>{t('to.approve')}</Btn>}
          {to.status!=='Rejected'&&<Btn onClick={()=>updateTOStatus(to.id,'Rejected')} variant="danger" small>{t('to.reject')}</Btn>}
          {to.status==='Rejected'&&<Btn onClick={()=>updateTOStatus(to.id,'Pending')} variant="ghost" small>{t('to.reset')}</Btn>}
          <Btn onClick={()=>removeTO(to.id)} variant="ghost" small>✕</Btn>
        </div>
      </div>);
    })}
  </div>);
}
