import { useState } from 'react';
import { T, pal } from '../../lib/constants';
import { fmt, getMonthOffsets, weekKey, dateToISO } from '../../lib/dates';
import { isOnTimeOff } from '../../lib/schedule';
import { escapeHtml } from '../../lib/html';
import { Avatar, RoleBadge, Btn } from '../ui';

// CSV field escaping — wrap in quotes (doubling any embedded quotes) only
// when the value actually needs it, so simple values stay readable in the
// raw file.
const csvField = (v) => {
  const str = String(v ?? '');
  return /[",\r\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
};

// Raw/data version — plain numbers and a separate Currency column, sorted
// highest-cost-first (matches the on-screen breakdown). Meant for importing
// into a spreadsheet or payroll system, not for a human to read top to
// bottom.
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

// One horizontal bar row for the printable report — plain HTML/CSS (a
// percentage-width div), not a canvas/SVG chart library, so it renders
// identically on screen and on paper with zero dependencies.
function barRow(label, sub, valueLabel, pct, color){
  return `<div class="bar-row">
    <div class="bar-label">${escapeHtml(label)}${sub?`<span class="bar-sub">${escapeHtml(sub)}</span>`:''}</div>
    <div class="bar-track"><div class="bar-fill" style="width:${Math.max(0,Math.min(100,pct))}%;background:${color}"></div></div>
    <div class="bar-value">${escapeHtml(valueLabel)}</div>
  </div>`;
}

// A clean, printable one-page report — summary stats plus two bar charts
// (cost per employee, cost per role) — opened in its own tab the same way
// the schedule's Print button does. Meant to be looked at or saved as a PDF
// via the browser's print dialog, not machine-parsed like the CSV export.
function buildCostsReportHTML({ orgName, periodLabel, stats, empRows, roleRows }){
  const statCards = stats.map(({label,value,sub})=>`<div class="stat"><div class="stat-label">${escapeHtml(label)}</div><div class="stat-value">${escapeHtml(value)}</div><div class="stat-sub">${escapeHtml(sub)}</div></div>`).join('');
  const empBars = empRows.map(r=>barRow(r.label,r.sub,r.value,r.pct,r.color)).join('') || `<div class="empty">—</div>`;
  const roleBars = roleRows.map(r=>barRow(r.label,r.sub,r.value,r.pct,r.color)).join('') || `<div class="empty">—</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(orgName)} — ${escapeHtml(periodLabel)}</title><style>
    body{font-family:Arial,Helvetica,sans-serif;color:#211b15;padding:28px;}
    h1{font-size:19px;margin:0 0 2px;}
    .sub{font-size:12px;color:#6b625a;margin-bottom:22px;}
    h2{font-size:13px;margin:26px 0 12px;text-transform:uppercase;letter-spacing:0.06em;color:#4a4038;}
    .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:8px;}
    .stat{border:1px solid #d8d1c8;border-radius:8px;padding:10px 12px;}
    .stat-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#8a8074;margin-bottom:5px;}
    .stat-value{font-size:18px;font-weight:600;margin-bottom:2px;}
    .stat-sub{font-size:10px;color:#8a8074;}
    .bar-row{display:flex;align-items:center;gap:10px;margin-bottom:9px;}
    .bar-label{width:170px;flex-shrink:0;font-size:11px;font-weight:500;}
    .bar-sub{display:block;font-size:9px;color:#8a8074;font-weight:400;}
    .bar-track{flex:1;height:11px;background:#eee8de;border-radius:999px;overflow:hidden;}
    .bar-fill{height:100%;border-radius:999px;}
    .bar-value{width:90px;flex-shrink:0;text-align:right;font-size:11px;font-weight:600;}
    .empty{font-size:12px;color:#8a8074;padding:8px 0;}
    @media print{ body{padding:0;} }
  </style></head><body>
    <h1>${escapeHtml(orgName)}</h1>
    <div class="sub">${escapeHtml(periodLabel)}</div>
    <div class="stats">${statCards}</div>
    <h2>Cost by employee</h2>
    ${empBars}
    <h2>Cost by role</h2>
    ${roleBars}
    <script>window.onload=()=>window.print();<\/script>
  </body></html>`;
}

function openCostsReport(html){
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(()=>URL.revokeObjectURL(url), 30000);
}

// Restaurant-industry rule of thumb for labor cost as a % of revenue —
// used only to color-code the figure (green/amber/red), not to gate
// anything. 30/35 are the commonly-cited "healthy"/"watch it" thresholds.
const laborPctColor=pct=>pct<=30?T.success:pct<=35?T.warning:T.danger;

export default function CostsView({
  costsMode, setCostsMode, costsWeekOffset, setCostsWeekOffset, displayMonth, schedules, schedule, weekDates,
  hourlyRate, setHourlyRate,
  monthCostData, costData, totalMonthCostUnits, totalCostUnits, maxMonthCostUnits, maxCostUnits, monthRoleCosts, weekRoleCosts,
  toMoney, toMoneyRaw, hasWages, employees, timeOff, roleStyles, setView, orgName,
  revenue, onSaveRevenue, dailyLaborCostByDate, monthRevenueTotal,
  s, t,
}){
  // Local echo of whatever's being typed into a revenue box right now, so a
  // field can be fully cleared while editing instead of snapping back to 0
  // (same fix as the hourly-rate/wage inputs elsewhere) — committed to the
  // real revenue map (and Supabase) onBlur, not on every keystroke.
  const [revenueDraft, setRevenueDraft] = useState({});
  const moneyFmt=n=>`${hasWages?'kr':hourlyRate.currency} ${Math.round(n).toLocaleString('da-DK')}`;
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
        <input type="number" min="1" step="1" value={hourlyRate.amount??''} onChange={e=>{const v=e.target.value;setHourlyRate(p=>({...p,amount:v===''?'':Number(v)}));}} onBlur={e=>{if(e.target.value==='')setHourlyRate(p=>({...p,amount:1}));}} style={{width:60,padding:'2px 6px',borderRadius:5,border:`1px solid ${T.border}`,fontSize:12,fontFamily:'inherit',textAlign:'right',background:T.surfaceWarm}}/>
        <input value={hourlyRate.currency} onChange={e=>setHourlyRate(p=>({...p,currency:e.target.value.slice(0,5)}))} style={{width:36,padding:'2px 4px',borderRadius:5,border:`1px solid ${T.border}`,fontSize:12,fontFamily:'inherit',background:T.surfaceWarm}}/>
        <span style={{fontSize:11,color:T.text3}}>/h</span>
      </div>
    </div>
    {((costsMode!=='month'&&!schedule)||(costsMode==='month'&&!getMonthOffsets(displayMonth).some(off=>schedules[weekKey(off)])))?(<div style={{...s.card,textAlign:'center',padding:'52px 32px',position:'relative',overflow:'hidden'}}>
      <div style={{position:'absolute',inset:0,backgroundImage:`radial-gradient(circle, ${T.border} 1px, transparent 1px)`,backgroundSize:'24px 24px',opacity:0.5,pointerEvents:'none'}}/>
      <div style={{position:'relative'}}><div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:20,marginBottom:8}}>{t('cost.noSchedule')}</div><div style={{fontSize:13,color:T.text2,marginBottom:20}}>{t('cost.noScheduleDesc')}</div><Btn onClick={()=>setView('schedule')}>{t('cost.goToSchedule')}</Btn></div>
    </div>):(()=>{
      const data=costsMode==='month'?monthCostData:costData,totalCost=costsMode==='month'?totalMonthCostUnits:totalCostUnits,maxCost=costsMode==='month'?maxMonthCostUnits:maxCostUnits,roleCosts=costsMode==='month'?monthRoleCosts:weekRoleCosts,maxRC=Math.max(...Object.values(roleCosts),0.01),workingCount=data.filter(d=>d.hours>0).length,totalHours=data.reduce((sv,d)=>sv+d.hours,0);
      // Revenue vs labor cost — revenue is hand-entered per calendar day
      // (see Costs' new Revenue card below), compared against that same
      // period's scheduled labor cost in real money (toMoneyRaw undoes the
      // "cost index" fallback used when nobody has a wage set, so this
      // still means something even for orgs that never entered wages).
      const laborCostMoney=toMoneyRaw(totalCost);
      const weekRevenueTotal=weekDates.reduce((sum,d)=>sum+(revenue[dateToISO(d)]||0),0);
      const revenueTotal=costsMode==='month'?monthRevenueTotal:weekRevenueTotal;
      const laborPct=revenueTotal>0?(laborCostMoney/revenueTotal*100):null;
      const profit=revenueTotal-laborCostMoney;
      const periodLabel=costsMode==='month'
        ?new Date(displayMonth.y,displayMonth.m,1).toLocaleDateString('en-GB',{month:'long',year:'numeric'})
        :`${fmt(weekDates[0])} – ${fmt(weekDates[6])}`;
      const exportCsv=()=>{
        const label=costsMode==='month'
          ?`${displayMonth.y}-${String(displayMonth.m+1).padStart(2,'0')}`
          :`${dateToISO(weekDates[0])}_to_${dateToISO(weekDates[6])}`;
        downloadCSV(buildCostsCSV(data,hourlyRate.currency),`costs-${costsMode}-${label}.csv`);
      };
      const viewReport=()=>{
        const statCards=[
          {label:t('cost.estimatedCost'),value:toMoney(totalCost),sub:t('cost.estimatedCostSub',{rate:hourlyRate.amount,cur:hourlyRate.currency})},
          {label:t('cost.totalHours'),value:totalHours+'h',sub:costsMode==='month'?t('cost.thisMonthSub'):t('cost.thisWeekSub')},
          {label:t('cost.staffScheduled'),value:`${workingCount} ${t('cost.ofN',{n:employees.length})}`,sub:costsMode==='month'?t('cost.staffMonthSub',{n:getMonthOffsets(displayMonth).filter(off=>schedules[weekKey(off)]).length}):t('cost.staffWeekSub')},
          {label:t('cost.avgCost'),value:workingCount>0?toMoney(totalCost/workingCount):'—',sub:t('cost.avgCostSub')},
        ];
        const empRows=[...data].sort((a,b)=>b.costUnits-a.costUnits).map(({emp,hours,costUnits})=>({
          label:emp.name,
          sub:(emp.roles||[]).join(', ')||undefined,
          value:hours>0?toMoney(costUnits):'—',
          pct:maxCost>0?(costUnits/maxCost*100):0,
          color:hours>0?pal(emp).dot:'#d8d1c8',
        }));
        const roleRows=Object.entries(roleCosts).filter(([,v])=>v>0).sort(([,a],[,b])=>b-a).map(([role,cost])=>{
          const cnt=data.filter(d=>(d.emp.roles||[]).includes(role)&&d.hours>0).length;
          return { label:role, sub:`${cnt} staff`, value:toMoney(cost), pct:maxRC>0?(cost/maxRC*100):0, color:(roleStyles[role]||{}).dot||'#9C9088' };
        });
        openCostsReport(buildCostsReportHTML({ orgName:orgName||'Restaurant', periodLabel, stats:statCards, empRows, roleRows }));
      };
      return(<>
        <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
          <Btn small variant="ghost" onClick={viewReport}>{t('cost.viewReport')}</Btn>
          <Btn small variant="ghost" onClick={exportCsv}>{t('cost.exportCsv')}</Btn>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:12}}>
          {[{label:t('cost.estimatedCost'),value:toMoney(totalCost),sub:t('cost.estimatedCostSub',{rate:hourlyRate.amount,cur:hourlyRate.currency}),color:T.accent},{label:t('cost.totalHours'),value:totalHours+'h',sub:costsMode==='month'?t('cost.thisMonthSub'):t('cost.thisWeekSub'),color:T.text},{label:t('cost.staffScheduled'),value:`${workingCount} ${t('cost.ofN',{n:employees.length})}`,sub:costsMode==='month'?t('cost.staffMonthSub',{n:getMonthOffsets(displayMonth).filter(off=>schedules[weekKey(off)]).length}):t('cost.staffWeekSub'),color:T.success},{label:t('cost.avgCost'),value:workingCount>0?toMoney(totalCost/workingCount):'—',sub:t('cost.avgCostSub'),color:T.text2}].map(({label,value,sub,color})=>(<div key={label} style={{...s.card,padding:'14px 16px'}}><div style={{fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:6}}>{label}</div><div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:22,fontWeight:500,color,marginBottom:2}}>{value}</div><div style={{fontSize:11,color:T.text3}}>{sub}</div></div>))}
        </div>
        <div style={s.card}>
          <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:15,fontWeight:500,marginBottom:4}}>{t('cost.revenueTitle')}</div>
          <div style={{fontSize:12,color:T.text2,marginBottom:16}}>{t('cost.revenueDesc')}</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:12,marginBottom:costsMode==='week'?20:0}}>
            <div style={{...s.cardFlush,padding:'14px 16px',background:T.surfaceWarm,border:`1px solid ${T.border}`}}>
              <div style={{fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:6}}>{t('cost.revenue')}</div>
              <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:22,fontWeight:500,color:T.success,marginBottom:2}}>{revenueTotal>0?moneyFmt(revenueTotal):'—'}</div>
              <div style={{fontSize:11,color:T.text3}}>{costsMode==='month'?t('cost.thisMonthSub'):t('cost.thisWeekSub')}</div>
            </div>
            <div style={{...s.cardFlush,padding:'14px 16px',background:T.surfaceWarm,border:`1px solid ${T.border}`}}>
              <div style={{fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:6}}>{t('cost.laborCost')}</div>
              <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:22,fontWeight:500,color:T.text,marginBottom:2}}>{moneyFmt(laborCostMoney)}</div>
              <div style={{fontSize:11,color:T.text3}}>{t('cost.laborCostSub')}</div>
            </div>
            <div style={{...s.cardFlush,padding:'14px 16px',background:T.surfaceWarm,border:`1px solid ${T.border}`}}>
              <div style={{fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:6}}>{t('cost.laborPct')}</div>
              <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:22,fontWeight:500,color:laborPct==null?T.text3:laborPctColor(laborPct),marginBottom:2}}>{laborPct==null?'—':`${laborPct.toFixed(1)}%`}</div>
              <div style={{fontSize:11,color:T.text3}}>{laborPct==null?t('cost.laborPctNoRevenue'):t('cost.laborPctSub')}</div>
            </div>
            <div style={{...s.cardFlush,padding:'14px 16px',background:T.surfaceWarm,border:`1px solid ${T.border}`}}>
              <div style={{fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:6}}>{t('cost.profit')}</div>
              <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:22,fontWeight:500,color:revenueTotal>0?(profit>=0?T.success:T.danger):T.text3,marginBottom:2}}>{revenueTotal>0?moneyFmt(profit):'—'}</div>
              <div style={{fontSize:11,color:T.text3}}>{t('cost.profitSub')}</div>
            </div>
          </div>
          {costsMode==='week'&&(
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {weekDates.map(d=>{
                const iso=dateToISO(d);
                const dayRevenue=revenue[iso]||0;
                const dayLabor=dailyLaborCostByDate[iso]||0;
                const dayPct=dayRevenue>0?(dayLabor/dayRevenue*100):null;
                return (
                  <div key={iso} style={{display:'grid',gridTemplateColumns:'110px 130px 100px 1fr 60px',alignItems:'center',gap:10,padding:'8px 0',borderBottom:`1px solid ${T.border}`}}>
                    <div style={{fontSize:12,fontWeight:500,color:T.text}}>{fmt(d)}</div>
                    <div style={{display:'flex',alignItems:'center',gap:4,background:T.surfaceWarm,border:`1px solid ${T.border}`,borderRadius:7,padding:'2px 8px'}}>
                      <span style={{fontSize:11,color:T.text3}}>{hasWages?'kr':hourlyRate.currency}</span>
                      <input
                        type="number" min="0" step="1" placeholder={t('cost.enterRevenue')}
                        value={revenueDraft[iso]??(revenue[iso]??'')}
                        onChange={e=>setRevenueDraft(p=>({...p,[iso]:e.target.value}))}
                        onBlur={e=>{const v=e.target.value;onSaveRevenue(iso,v===''?0:Number(v));setRevenueDraft(p=>{const n={...p};delete n[iso];return n;});}}
                        style={{width:'100%',border:'none',background:'transparent',fontSize:12,fontFamily:'inherit',textAlign:'right',outline:'none',color:T.text}}
                      />
                    </div>
                    <div style={{fontSize:12,color:T.text2,textAlign:'right'}}>{dayLabor>0?moneyFmt(dayLabor):'—'}</div>
                    <div style={{position:'relative',height:8,background:T.border,borderRadius:999,overflow:'hidden'}}>{dayPct!=null&&<div style={{position:'absolute',left:0,top:0,height:'100%',width:`${Math.min(100,dayPct)}%`,background:laborPctColor(dayPct),borderRadius:999}}/>}</div>
                    <div style={{fontSize:12,fontWeight:600,textAlign:'right',color:dayPct==null?T.text3:laborPctColor(dayPct)}}>{dayPct==null?'—':`${dayPct.toFixed(0)}%`}</div>
                  </div>
                );
              })}
            </div>
          )}
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
