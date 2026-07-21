import { T, DAYS, isDark, pal, initials, DEFAULT_ROLE_STYLES } from '../../lib/constants';
import { dateToISO } from '../../lib/dates';
import { isOnTimeOff } from '../../lib/schedule';
import { Avatar, RoleBadge, Btn } from '../ui';

// Planday-style grid — employees as rows, days as columns.
export default function TeamView({
  schedule, employees, blocks, roleStyles, weekDates, weekOffset, timeOff, allRoles,
  gridGroupBy, setGridGroupBy, gridTight, setGridTight, gridSearch, setGridSearch,
  empHours, assignmentHours, openEditSlot, openShiftModalFor,
  generate, generateMonth, offThisWeek, isMobile,
  s, t,
}){
  if(!schedule)return(<div style={{...s.card,padding:'52px 32px',textAlign:'center',position:'relative',overflow:'hidden'}}>
    <div style={{position:'absolute',inset:0,backgroundImage:`radial-gradient(circle, ${T.border} 1px, transparent 1px)`,backgroundSize:'24px 24px',opacity:0.5,pointerEvents:'none'}}/>
    <div style={{position:'relative'}}>
      <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:22,fontWeight:500,color:T.text,marginBottom:8}}>{t('empty.nothing')}</div>
      <div style={{fontSize:13,color:T.text2,marginBottom:4}}>{t.n('empty.across',blocks.length,{emp:employees.length,blocks:blocks.length})}</div>
      <div style={{fontSize:12,color:T.text3,marginBottom:28}}>{t('empty.respected')}</div>
      <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap'}}><Btn onClick={()=>generate()}>{t('empty.generateWeek')}</Btn><Btn onClick={generateMonth} variant="secondary">{t('empty.generateMonth')}</Btn></div>
    </div>
  </div>);

  // Sort/group employees — in "by role" mode, an employee with multiple roles appears once per matching role group
  const allRoleOrder=Object.keys(roleStyles);
  const gq=gridSearch.trim().toLowerCase();
  const gridEmployees=gq?employees.filter(e=>e.name.toLowerCase().includes(gq)):employees;
  const rows=gridGroupBy==='role'
    ?allRoleOrder
        .filter(role=>gridEmployees.some(e=>(e.roles||[]).includes(role)))
        .flatMap(role=>[...gridEmployees].filter(e=>(e.roles||[]).includes(role)).sort((a,b)=>a.name.localeCompare(b.name)).map(emp=>({emp,role})))
    :[...gridEmployees].sort((a,b)=>a.name.localeCompare(b.name)).map(emp=>({emp,role:null}));
  const rowH=gridTight?60:80;
  const nameW=isMobile?(gridTight?110:140):(gridTight?140:180);
  const gridMinW=isMobile?nameW+7*54:700;
  return(
  <div>
    {/* Grid controls + header — sticky so they stay visible while scrolling the employee list, stacked just below the sticky week/view-mode bar above */}
    <div style={{position:'sticky',top:98,zIndex:19,background:T.bg,backgroundImage:isDark()?'radial-gradient(circle at 12% 6%, rgba(217,122,74,0.07), transparent 38%), radial-gradient(circle at 88% 94%, rgba(95,174,122,0.06), transparent 42%)':'radial-gradient(circle at 12% 6%, rgba(191,90,44,0.045), transparent 38%), radial-gradient(circle at 88% 94%, rgba(61,122,82,0.04), transparent 42%)',backgroundAttachment:'fixed',paddingTop:16,marginTop:-16}}>
      <div style={{display:'flex',gap:8,marginBottom:12,alignItems:'center',flexWrap:'wrap'}}>
        <div style={{display:'flex',background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:3,gap:2}}>
          {[['name',t('grid.byName')],['role',t('grid.byRole')]].map(([k,l])=><button key={k} onClick={()=>setGridGroupBy(k)} style={{padding:'4px 12px',borderRadius:6,background:gridGroupBy===k?T.bg:'transparent',border:gridGroupBy===k?`1px solid ${T.border}`:'1px solid transparent',cursor:'pointer',fontSize:12,fontWeight:gridGroupBy===k?500:400,color:gridGroupBy===k?T.text:T.text2,fontFamily:'inherit'}}>{l}</button>)}
        </div>
        <button onClick={()=>setGridTight(p=>!p)} style={{padding:'4px 12px',borderRadius:8,background:gridTight?T.bg:T.surface,border:`1px solid ${T.border}`,cursor:'pointer',fontSize:12,color:gridTight?T.text:T.text2,fontFamily:'inherit',fontWeight:gridTight?500:400}}>
          {gridTight?t('grid.compact'):t('grid.comfortable')}
        </button>
        <input value={gridSearch} onChange={e=>setGridSearch(e.target.value)} placeholder={t('week.searchStaff')} style={{...s.input,width:160,padding:'5px 10px',fontSize:12}}/>
        <span style={{fontSize:12,color:T.text3,marginLeft:4}}>{t('grid.scheduledOfTotal',{n:employees.filter(e=>Object.values(schedule).some(day=>Object.values(day).some(b=>b.some(a=>a.empId===e.id)))).length,total:employees.length})}</span>
      </div>
      <div style={{...s.cardFlush,overflowX:'auto',overflowY:'visible',borderBottomLeftRadius:0,borderBottomRightRadius:0}}>
        {/* Header */}
        <div style={{display:'grid',gridTemplateColumns:`${nameW}px repeat(7,1fr)`,minWidth:gridMinW,borderBottom:`2px solid ${T.border}`,background:T.surfaceWarm}}>
          <div style={{padding:gridTight?'10px 14px':'14px 20px',fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.08em',borderRight:`1px solid ${T.border}`}}>{t('to.employee')}</div>
          {DAYS.map((day,i)=>{
            const date=weekDates[i],isToday=dateToISO(date)===dateToISO(new Date());
            return(<div key={day} style={{padding:gridTight?'10px 8px':'14px 12px',textAlign:'center',borderRight:i<6?`1px solid ${T.border}`:'none'}}>
              <div style={{fontSize:gridTight?12:13,fontWeight:600,color:isToday?T.accent:T.text}}>{t('day.'+day)}</div>
              <div style={{fontSize:gridTight?10:12,color:isToday?T.accent:T.text3,marginTop:1}}>{date.getDate()} {date.toLocaleDateString('en-GB',{month:'short'})}</div>
            </div>);
          })}
        </div>
      </div>
    </div>
    <div style={{...s.cardFlush,overflowX:'auto',overflowY:'visible',borderTop:'none',borderTopLeftRadius:0,borderTopRightRadius:0}}>
      {/* Rows */}
      {rows.map((row,ri)=>{
        const emp=row.emp;
        const p=pal(emp);
        const prevRole=ri>0?rows[ri-1].role:undefined;
        const showDivider=gridGroupBy==='role'&&row.role!==prevRole;
        return(<div key={`${row.role||'all'}-${emp.id}`}>
          {/* Role group divider */}
          {showDivider&&<div style={{display:'grid',gridTemplateColumns:`${nameW}px repeat(7,1fr)`,minWidth:gridMinW,background:T.surfaceWarm,borderTop:`2px solid ${T.border}`,borderBottom:`1px solid ${T.border}`}}>
            <div style={{padding:'6px 14px',display:'flex',alignItems:'center',gap:8,borderRight:`1px solid ${T.border}`}}>
              <RoleBadge role={row.role} rs={roleStyles[row.role]}/>
            </div>
            {DAYS.map((_,i)=><div key={i} style={{borderRight:i<6?`1px solid ${T.border}`:'none'}}/>)}
          </div>}
          <div style={{display:'grid',gridTemplateColumns:`${nameW}px repeat(7,1fr)`,minWidth:gridMinW,borderBottom:`1px solid ${T.border}`,background:ri%2===1?T.surfaceWarm:T.surface}}>
            {/* Name cell */}
            <div style={{padding:gridTight?'8px 14px':'12px 20px',borderRight:`1px solid ${T.border}`,display:'flex',alignItems:'center',gap:gridTight?8:10,minHeight:rowH}}>
              {!gridTight&&<div style={{width:36,height:36,borderRadius:'50%',background:isDark()?p.dot+'25':p.bg,color:isDark()?p.dot:p.text,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,flexShrink:0,border:`2px solid ${p.dot}33`}}>{initials(emp.name)}</div>}
              <div style={{minWidth:0}}>
                <div style={{fontSize:gridTight?12:14,fontWeight:600,color:T.text,lineHeight:1.2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{gridTight?emp.name.split(' ')[0]:emp.name}</div>
                {!gridTight&&<div style={{fontSize:11,color:T.text3,marginTop:2}}>{emp.name.split(' ').slice(1).join(' ')}</div>}
                {!gridTight&&<div style={{display:'flex',gap:3,marginTop:3,flexWrap:'wrap'}}>{(emp.roles||[]).slice(0,2).map(r=>{const rs=roleStyles[r]||DEFAULT_ROLE_STYLES.Other;return<span key={r} style={{fontSize:9,fontWeight:600,color:isDark()?rs.dot:rs.text,background:isDark()?rs.dot+'22':rs.bg,border:`1px solid ${isDark()?rs.dot+'55':rs.border}`,padding:'1px 5px',borderRadius:999}}>{r}</span>;})}</div>}
                {!gridTight&&(()=>{const h=empHours(emp.id);return(
                  <div style={{display:'flex',alignItems:'center',gap:6,marginTop:5}}>
                    <div style={{height:4,width:50,borderRadius:999,background:T.border,overflow:'hidden'}}><div style={{height:'100%',width:`${Math.min(100,(h/emp.maxHours)*100)}%`,borderRadius:999,background:h>emp.maxHours?T.danger:h/emp.maxHours>0.8?T.warning:T.success}}/></div>
                    <span style={{fontSize:10,color:h>emp.maxHours?T.danger:T.text3}}>{h}h / {emp.maxHours}h</span>
                  </div>
                );})()}
              </div>
            </div>
            {/* Day cells */}
            {DAYS.map((day,di)=>{
              const date=weekDates[di];
              const onTO=isOnTimeOff(emp.id,date,timeOff);
              const assignedBlocks=blocks.filter(b=>(schedule[day]?.[b.id]||[]).some(a=>a.empId===emp.id));
              return(<div key={day} style={{padding:gridTight?'6px 5px':'8px 7px',borderRight:di<6?`1px solid ${T.border}`:'none',display:'flex',flexDirection:'column',gap:4,justifyContent:'center',minHeight:rowH}}>
                {onTO?(
                  <div style={{padding:gridTight?'4px 7px':'7px 9px',borderRadius:7,background:T.warningLight,border:`1px solid ${T.warning}44`,textAlign:'center'}}>
                    <div style={{fontSize:gridTight?10:11,fontWeight:600,color:T.warning}}>{t('staff.leave')}</div>
                  </div>
                ):assignedBlocks.length>0?assignedBlocks.map(b=>{
                  const shiftEntry=(schedule[day]?.[b.id]||[]).find(a=>a.empId===emp.id);
                  const dispStart=shiftEntry?.start||b.start,dispEnd=shiftEntry?.end||b.end;
                  const bh=assignmentHours(shiftEntry||{},b);
                  const shiftRole=shiftEntry?.role;
                  const rrs=shiftRole?(roleStyles[shiftRole]||DEFAULT_ROLE_STYLES.Other):null;
                  const realIdx=(schedule[day]?.[b.id]||[]).findIndex(a=>a.empId===emp.id);
                  return(
                    <div key={b.id} onClick={()=>openEditSlot(day,b.id,realIdx)} title={t('week.editShift')} style={{padding:gridTight?'5px 8px':'9px 11px',borderRadius:8,background:isDark()?p.dot+'28':p.bg,border:`2px solid ${p.dot}55`,position:'relative',flexShrink:0,cursor:'pointer',transition:'box-shadow 0.15s,transform 0.15s'}} onMouseEnter={e=>{e.currentTarget.style.boxShadow=`0 0 0 2px ${p.dot}55`;e.currentTarget.style.transform='translateY(-1px)';}} onMouseLeave={e=>{e.currentTarget.style.boxShadow='none';e.currentTarget.style.transform='none';}}>
                      <div style={{position:'absolute',top:gridTight?5:7,right:gridTight?5:7,width:6,height:6,borderRadius:'50%',background:p.dot}}/>
                      <div style={{fontSize:gridTight?11:14,fontWeight:700,color:isDark()?p.dot:p.text,lineHeight:1.1}}>{b.name}</div>
                      {!gridTight&&<div style={{fontSize:11,color:isDark()?p.dot+'CC':p.text,opacity:0.85,marginTop:2}}>{dispStart}–{dispEnd}</div>}
                      {gridTight&&<div style={{fontSize:9,color:isDark()?p.dot+'99':p.text,opacity:0.7}}>{dispStart.slice(0,5)}</div>}
                      {!gridTight&&<div style={{fontSize:10,color:isDark()?p.dot+'88':p.text,opacity:0.65,marginTop:1}}>{bh.toFixed(1)}h</div>}
                      {(emp.roles||[]).length>1&&shiftRole&&<div style={{marginTop:3,display:'inline-block',fontSize:9,fontWeight:600,color:isDark()?rrs.dot:rrs.text,background:isDark()?rrs.dot+'22':rrs.bg,border:`1px solid ${isDark()?rrs.dot+'55':rrs.border}`,padding:'1px 5px',borderRadius:999}}>{shiftRole}</div>}
                    </div>
                  );
                }):(
                  <button onClick={()=>openShiftModalFor(emp,weekOffset,day)} title={t('grid.addShiftTitle')} style={{height:gridTight?32:46,borderRadius:7,border:`1.5px dashed ${T.border}`,display:'flex',alignItems:'center',justifyContent:'center',opacity:0.35,background:'transparent',cursor:'pointer',fontFamily:'inherit',width:'100%',transition:'opacity 0.15s,border-color 0.15s'}} onMouseEnter={e=>{e.currentTarget.style.opacity=1;e.currentTarget.style.borderColor=T.accent;}} onMouseLeave={e=>{e.currentTarget.style.opacity=0.35;e.currentTarget.style.borderColor=T.border;}}>
                    <span style={{fontSize:16,color:T.text3}}>+</span>
                  </button>
                )}
              </div>);
            })}
          </div>
        </div>);
      })}
      {/* Footer */}
      <div style={{display:'grid',gridTemplateColumns:`${nameW}px repeat(7,1fr)`,minWidth:gridMinW,background:T.surfaceWarm,borderTop:`2px solid ${T.border}`}}>
        <div style={{padding:'10px 20px',fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em',borderRight:`1px solid ${T.border}`,display:'flex',alignItems:'center'}}>{t('grid.totalLabel')}</div>
        {DAYS.map((day,di)=>{
          const count=[...new Set(blocks.flatMap(b=>(schedule[day]?.[b.id]||[]).map(a=>a.empId)))].length;
          const onLeave=employees.filter(e=>isOnTimeOff(e.id,weekDates[di],timeOff)).length;
          return(<div key={day} style={{padding:'10px 12px',textAlign:'center',borderRight:di<6?`1px solid ${T.border}`:'none'}}>
            <div style={{fontSize:15,fontWeight:700,color:count===0?T.text3:T.text}}>{count}</div>
            <div style={{fontSize:10,color:T.text3}}>{t('grid.workingLabel')}</div>
            {onLeave>0&&<div style={{fontSize:10,color:T.warning,marginTop:2}}>{onLeave} {t('staff.leave')}</div>}
          </div>);
        })}
      </div>
    </div>
    <div style={{marginTop:16,padding:'12px 16px',background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,display:'flex',gap:20,flexWrap:'wrap',alignItems:'center'}}>
      <span style={{fontSize:11,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em'}}>{t('staff.weekSummary')}</span>
      <span style={{fontSize:12,color:T.text2}}><b style={{color:T.text}}>{employees.reduce((acc,e)=>acc+empHours(e.id),0)}h</b>{t('staff.totalHours')}</span>
      <span style={{fontSize:12,color:T.text2}}><b style={{color:T.text}}>{employees.filter(e=>empHours(e.id)>0).length}</b>{t('staff.staffWorking',{n:employees.length})}</span>
      {offThisWeek.length>0&&<span style={{fontSize:12,color:T.warning}}><b>{offThisWeek.length}</b>{t('staff.onLeaveCount')}</span>}
    </div>
  </div>
  );
}
