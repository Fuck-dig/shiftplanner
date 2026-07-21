import { T, DAYS, isDark } from '../../lib/constants';
import { getWeekDates, weekKey } from '../../lib/dates';
import { dayCoverage, isOnTimeOff } from '../../lib/schedule';
import { Btn } from '../ui';

// Same coverage-dot palette used by the month heatmap — kept local since
// nothing outside this view needs it.
const cDot=status=>(isDark()?{full:{bg:'#5AAE8025',border:'#5AAE8080',text:'#7BC79A'},partial:{bg:'#D4A83025',border:'#D4A83080',text:'#E0BC5E'},low:{bg:'#D0606025',border:'#D0606080',text:'#E08585'},empty:{bg:T.bg,border:T.border,text:T.text3}}:{full:{bg:'#D4F0E2',border:'#5AAE80',text:'#236040'},partial:{bg:'#FBF0D5',border:'#D4A830',text:'#7A5010'},low:{bg:'#F5E2E2',border:'#D06060',text:'#783030'},empty:{bg:T.bg,border:T.border,text:T.text3}})[status];

export default function MonthView({
  monthOff, schedules, weekOffset, setWeekOffset, setCalMode, displayMonth,
  blocks, allRoles, employees, timeOff, generate, deleteMonth,
  s, t,
}){
  return (<div style={{...s.cardFlush,padding:0}}>
    <div style={{display:'grid',gridTemplateColumns:'48px repeat(7,1fr)',borderBottom:`1px solid ${T.border}`,background:T.surfaceWarm}}><div/>{DAYS.map(d=><div key={d} style={{padding:'10px 4px',textAlign:'center',fontSize:11,fontWeight:600,color:T.text2,textTransform:'uppercase',letterSpacing:'0.06em'}}>{t('day.'+d)}</div>)}</div>
    {monthOff.map(off=>{
      const wd=getWeekDates(off),k=weekKey(off),ws=schedules[k]?.schedule||null,wConf=schedules[k]?.confirmed||false,isCur=off===weekOffset;
      return(<div key={off} style={{display:'grid',gridTemplateColumns:'48px repeat(7,1fr)',borderBottom:`1px solid ${T.border}`,background:isCur?T.accentLight:wConf?T.successLight+'88':'transparent'}}>
        <div style={{display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',gap:4,padding:'8px 4px',borderRight:`1px solid ${T.border}`}}>
          {wConf&&<span style={{fontSize:9,color:T.success,fontWeight:600}}>✓</span>}
          <button onClick={()=>{setWeekOffset(off);setCalMode('week');}} style={{fontSize:9,padding:'2px 6px',borderRadius:4,cursor:'pointer',border:`1px solid ${isCur?T.accent:T.border}`,background:isCur?T.accent:'transparent',color:isCur?'#fff':T.text3,fontFamily:'inherit'}}>{t('month.view')}</button>
          {!ws&&<button onClick={()=>generate(off)} style={{fontSize:9,padding:'2px 6px',borderRadius:4,cursor:'pointer',border:`1px solid ${T.accent}`,background:'transparent',color:T.accent,fontFamily:'inherit'}}>{t('month.gen')}</button>}
        </div>
        {wd.map((d,di)=>{
          const dayName=DAYS[di],inMonth=d.getMonth()===displayMonth.m&&d.getFullYear()===displayMonth.y;
          const status=ws?dayCoverage(ws,blocks,dayName,allRoles):'empty',dot=cDot(status);
          const empCount=ws?[...new Set(Object.values(ws[dayName]||{}).flatMap(a=>a.map(x=>x.empId)))].length:0;
          const offCount=employees.filter(e=>isOnTimeOff(e.id,d,timeOff)).length;
          return(<div key={di} onClick={()=>{setWeekOffset(off);setCalMode('week');}} style={{padding:'8px 6px',cursor:'pointer',borderRight:di<6?`1px solid ${T.border}`:'none',background:inMonth?dot.bg:'transparent',opacity:inMonth?1:0.35,minHeight:60}}>
            <div style={{fontSize:13,fontWeight:500,color:inMonth?dot.text:T.text3,marginBottom:2}}>{d.getDate()}</div>
            {ws&&inMonth&&<div style={{fontSize:10,color:dot.text}}>{t('common.staffN',{n:empCount})}</div>}
            {offCount>0&&inMonth&&<div style={{fontSize:10,color:T.warning}}>{offCount} {t('staff.leave')}</div>}
            {!ws&&inMonth&&<div style={{fontSize:10,color:T.text3}}>—</div>}
          </div>);
        })}
      </div>);
    })}
    <div style={{display:'flex',gap:16,padding:'12px 16px',background:T.surfaceWarm,alignItems:'center',flexWrap:'wrap'}}>
      <span style={{fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em'}}>{t('month.coverage')}</span>
      {[['full',t('month.full')],['partial',t('month.partial')],['low',t('month.low')],['empty',t('month.notGenerated')]].map(([sv,l])=>{const d=cDot(sv);return<div key={sv} style={{display:'flex',alignItems:'center',gap:5}}><div style={{width:10,height:10,borderRadius:3,background:d.bg,border:`1px solid ${d.border}`}}/><span style={{fontSize:11,color:T.text2}}>{l}</span></div>;})}
      {monthOff.some(off=>schedules[weekKey(off)])&&<><div style={{flex:1}}/><Btn small variant="danger" onClick={deleteMonth}>{t('month.deleteMonth')}</Btn></>}
    </div>
  </div>);
}
