import { T, pal } from '../../lib/constants';
import { fmt, getMonthOffsets, weekKey, dateToISO } from '../../lib/dates';
import { isOnTimeOff } from '../../lib/schedule';
import { Avatar, RoleBadge, Btn } from '../ui';

// CSV field escaping — wrap in quotes (doubling any embedded quotes) only
// when the value actually needs it, so simple values stay readable in the
// raw file.
const csvField = (v) => {
  const str = String(v ?? '');
  return /[",\r\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
};

// Builds a payroll-friendly CSV from the same per-employee cost breakdown
// already shown on screen, so what a manager sees and what they hand off to
// payroll always match.
function buildCostsCSV(data, currency) {
  const header = ['Employee', 'Roles', 'Hours', 'Max Hours', 'Cost', 'Currency'];
  const rows = [...data]
    .sort((a, b) => b.costUnits - a.costUnits)
    .map(({ emp, hours, costUnits }) => [
      emp.name,
      (emp.roles || []).join('/'),
      hours,
      emp.maxHours,
      costUnits.toFixed(2),
      currency,
    ]);
  return [header, ...rows].map(row => row.map(csvField).join(',')).join('\r\n');
}

function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function CostsView({
  costsMode, setCostsMode, costsWeekOffset, setCostsWeekOffset, displayMonth, schedules, schedule, weekDates,
  hourlyRate, setHourlyRate,
  monthCostData, costData, totalMonthCostUnits, totalCostUnits, maxMonthCostUnits, maxCostUnits, monthRoleCosts, weekRoleCosts,
  toMoney, employees, timeOff, roleStyles, setView,
  s, t,
}){
  return (<div style={{display:'flex',flexDirection:'column',gap:16}}>
    <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
      <div style={{display:'flex',background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:3,gap:2}}>
        {[['week',t('cost.thisWeek')],['month',t('cost.thisMonth')]].map(([k,l])=><button key={k} onClick={()=>setCostsMode(k)} style={{padding:'4px 14px',borderRadius:6,background:costsMode===k?T.bg:'transparent',border:costsMode===k?`1px solid ${T.border}`:'1px solid transparent',cursor:'pointer',fontSize:12,fontWeight:costsMode===k?500:400,color:costsMode===k?T.text:T.text2,fontFamily:'inherit'}}>{l}</button>)}
      </div>
      {costsMode==='month'&&<span style={{fontSize:12,color:T.text2}}>{new Date(displayMonth.y,displayMonth.m,1).toLocaleDateString('en-GB',{month:'long',year:'numeric'})} — {t('cost.weeksGenerated',{a:getMonthOffsets(displayMonth).filter(off=>schedules[weekKey(off)]).length,b:getMonthOffsets(displayMonth).length})}</span>}
      {costsMode==='week'&&(
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <div style={{display:'flex',alignItems:'center',gap:2,background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:3}}>
            <button onClick={()=>setCostsWeekOffset(o=>o-1)} style={{padding:'4px 10px',borderRadius:6,background:'none',border:'none',cursor:'pointer',color:T.text2,fontFamily:'inherit',fontSize:13}}>‹</button>
            <span style={{fontSize:12,fontWeight:500,color:T.text,minWidth:120,textAlign:'center',padding:'0 2px'}}>{fmt(weekDates[0])} – {fmt(weekDates[6])}</span>
            <button onClick={()=>setCostsWeekOffset(o=>o+1)} style={{padding:'4px 10px',borderRadius:6,background:'none',border:'none',cursor:'pointer',color:T.text2,fontFamily:'inherit',fontSize:13}}>›</button>
          </div>
          {costsWeekOffset!==0&&<button onClick={()=>setCostsWeekOffset(0)} style={{padding:'5px 12px',borderRadius:8,background:T.surface,border:`1px solid ${T.border}`,cursor:'pointer',fontSize:11,color:T.text2,fontFamily:'inherit'}}>{t('common.today')}</button>}
        </div>
      )}
      <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6,background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:'4px 10px'}}>
        <span style={{fontSize:11,color:T.text3}}>{t('cost.baseRate')}</span>
        <input type="number" min="1" step="1" value={hourlyRate.amount} onChange={e=>setHourlyRate(p=>({...p,amount:Math.max(1,Number(e.target.value))}))} style={{width:60,padding:'2px 6px',borderRadius:5,border:`1px solid ${T.border}`,fontSize:12,fontFamily:'inherit',textAlign:'right',background:T.surfaceWarm}}/>
        <input value={hourlyRate.currency} onChange={e=>setHourlyRate(p=>({...p,currency:e.target.value.slice(0,5)}))} style={{width:36,padding:'2px 4px',borderRadius:5,border:`1px solid ${T.border}`,fontSize:12,fontFamily:'inherit',background:T.surfaceWarm}}/>
        <span style={{fontSize:11,color:T.text3}}>/h</span>
      </div>
    </div>
    {((costsMode!=='month'&&!schedule)||(costsMode==='month'&&!getMonthOffsets(displayMonth).some(off=>schedules[weekKey(off)])))?(<div style={{...s.card,textAlign:'center',padding:'52px 32px',position:'relative',overflow:'hidden'}}>
      <div style={{position:'absolute',inset:0,backgroundImage:`radial-gradient(circle, ${T.border} 1px, transparent 1px)`,backgroundSize:'24px 24px',opacity:0.5,pointerEvents:'none'}}/>
      <div style={{position:'relative'}}><div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:20,marginBottom:8}}>{t('cost.noSchedule')}</div><div style={{fontSize:13,color:T.text2,marginBottom:20}}>{t('cost.noScheduleDesc')}</div><Btn onClick={()=>setView('schedule')}>{t('cost.goToSchedule')}</Btn></div>
    </div>):(()=>{
      const data=costsMode==='month'?monthCostData:costData,totalCost=costsMode==='month'?totalMonthCostUnits:totalCostUnits,maxCost=costsMode==='month'?maxMonthCostUnits:maxCostUnits,roleCosts=costsMode==='month'?monthRoleCosts:weekRoleCosts,maxRC=Math.max(...Object.values(roleCosts),0.01),workingCount=data.filter(d=>d.hours>0).length,totalHours=data.reduce((sv,d)=>sv+d.hours,0);
      const exportCsv=()=>{
        const label=costsMode==='month'
          ?`${displayMonth.y}-${String(displayMonth.m+1).padStart(2,'0')}`
          :`${dateToISO(weekDates[0])}_to_${dateToISO(weekDates[6])}`;
        downloadCSV(buildCostsCSV(data,hourlyRate.currency),`costs-${costsMode}-${label}.csv`);
      };
      return(<>
        <div style={{display:'flex',justifyContent:'flex-end'}}>
          <Btn small variant="ghost" onClick={exportCsv}>{t('cost.exportCsv')}</Btn>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:12}}>
          {[{label:t('cost.estimatedCost'),value:toMoney(totalCost),sub:t('cost.estimatedCostSub',{rate:hourlyRate.amount,cur:hourlyRate.currency}),color:T.accent},{label:t('cost.totalHours'),value:totalHours+'h',sub:costsMode==='month'?t('cost.thisMonthSub'):t('cost.thisWeekSub'),color:T.text},{label:t('cost.staffScheduled'),value:`${workingCount} ${t('cost.ofN',{n:employees.length})}`,sub:costsMode==='month'?t('cost.staffMonthSub',{n:getMonthOffsets(displayMonth).filter(off=>schedules[weekKey(off)]).length}):t('cost.staffWeekSub'),color:T.success},{label:t('cost.avgCost'),value:workingCount>0?toMoney(totalCost/workingCount):'—',sub:t('cost.avgCostSub'),color:T.text2}].map(({label,value,sub,color})=>(<div key={label} style={{...s.card,padding:'14px 16px'}}><div style={{fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:6}}>{label}</div><div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:22,fontWeight:500,color,marginBottom:2}}>{value}</div><div style={{fontSize:11,color:T.text3}}>{sub}</div></div>))}
        </div>
        <div style={s.card}>
          <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:15,fontWeight:500,marginBottom:4}}>{t('cost.empBreakdown')}</div>
          <div style={{fontSize:12,color:T.text2,marginBottom:16}}>{t('cost.empBreakdownDesc')}</div>
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {[...data].sort((a,b)=>b.costUnits-a.costUnits).map(({emp,hours,costUnits})=>{const p=pal(emp),pct=maxCost>0?(costUnits/maxCost*100):0,isOff=weekDates.some(d=>isOnTimeOff(emp.id,d,timeOff));return(
              <div key={emp.id} style={{display:'grid',gridTemplateColumns:'160px 48px 52px 1fr 80px',alignItems:'center',gap:10,padding:'8px 0',borderBottom:`1px solid ${T.border}`}}>
                <div style={{display:'flex',alignItems:'center',gap:8,minWidth:0}}><Avatar emp={emp} size={26}/><div style={{minWidth:0}}><div style={{fontSize:12,fontWeight:500,color:T.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{emp.name}</div><div style={{display:'flex',gap:3,flexWrap:'wrap',marginTop:1}}>{(emp.roles||[]).slice(0,2).map(r=><RoleBadge key={r} role={r} rs={roleStyles[r]}/>)}</div></div></div>
                <div style={{textAlign:'center'}}><div style={{fontSize:12,fontWeight:500,color:T.text}}>{emp.priority||100}%</div><div style={{fontSize:10,color:T.text3}}>{t('emp.priority')}</div></div>
                <div style={{textAlign:'center'}}><div style={{fontSize:12,fontWeight:500,color:hours>emp.maxHours?T.danger:T.text}}>{hours}h</div><div style={{fontSize:10,color:T.text3}}>{t('cost.ofN',{n:emp.maxHours})}</div></div>
                <div style={{position:'relative',height:8,background:T.border,borderRadius:999,overflow:'hidden'}}><div style={{position:'absolute',left:0,top:0,height:'100%',width:`${pct}%`,background:hours===0?T.border:p.dot,borderRadius:999}}/></div>
                <div style={{textAlign:'right'}}>{isOff&&costsMode!=='month'?<span style={{fontSize:10,color:T.warning}}>{t('cost.off')}</span>:<div><div style={{fontSize:12,fontWeight:600,color:hours===0?T.text3:T.text}}>{hours===0?'—':toMoney(costUnits)}</div><div style={{fontSize:10,color:T.text3}}>{hours>0?`idx ${costUnits.toFixed(1)}`:''}</div></div>}</div>
              </div>);})}
          </div>
        </div>
        <div style={s.card}>
          <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:15,fontWeight:500,marginBottom:16}}>{t('cost.costByRole')}</div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {Object.entries(roleCosts).filter(([,v])=>v>0).sort(([,a],[,b])=>b-a).map(([role,cost])=>{const rs=roleStyles[role]||{dot:'#9C9088'},pct=maxRC>0?(cost/maxRC*100):0,cnt=data.filter(d=>(d.emp.roles||[]).includes(role)&&d.hours>0).length;return(
              <div key={role} style={{display:'grid',gridTemplateColumns:'110px 1fr 80px',alignItems:'center',gap:12}}>
                <RoleBadge role={role} rs={rs}/>
                <div style={{position:'relative',height:10,background:T.border,borderRadius:999,overflow:'hidden'}}><div style={{position:'absolute',left:0,top:0,height:'100%',width:`${pct}%`,background:rs.dot,borderRadius:999}}/></div>
                <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end'}}><span style={{fontSize:13,fontWeight:600,color:T.text}}>{toMoney(cost)}</span><span style={{fontSize:10,color:T.text3}}>{cnt} staff</span></div>
              </div>);})}
            {Object.values(roleCosts).every(v=>v===0)&&<div style={{fontSize:13,color:T.text3,textAlign:'center',padding:'16px 0'}}>{t('cost.noHours')}</div>}
          </div>
        </div>
        <div style={{fontSize:12,color:T.text2,background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:'10px 14px'}}>{t('cost.infoBox')}</div>
      </>);
    })()}
  </div>);
}
