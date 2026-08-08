import { useState } from 'react';
import { T, DAYS, isDark, pal, initials, DEFAULT_ROLE_STYLES } from '../../lib/constants';
import { dateToISO, LOCALE } from '../../lib/dates';
import { isOnTimeOff, effectiveRolesFor, activeOnly, workingCount, rosterForWeek } from '../../lib/schedule';
import { RoleBadge, Btn, GripDots } from '../ui';

// Planday-style grid — employees as rows, days as columns.
export default function TeamView({
  schedule, employees, blocks, roleStyles, weekDates, weekOffset, timeOff, allRoles,
  gridGroupBy, gridTight, gridSearch,
  empHours, actualAssignmentHours, openEditSlot, openShiftModalFor,
  generate, generateMonth, offThisWeek, isMobile, reorderRoles, onIsolateDay,
  openShiftsForDay, postOpenShift, cancelOpenShift,
  stickyTop,
  s, t,
}){
  const [collapsedRoles,setCollapsedRoles]=useState(()=>new Set());
  const toggleRoleCollapse=(role)=>setCollapsedRoles(prev=>{const next=new Set(prev);if(next.has(role))next.delete(role);else next.add(role);return next;});
  // Drag-and-drop role-group reordering — dragRole is what's being picked
  // up, dragOverRole is whichever divider it's currently hovering (just for
  // the highlight), both cleared on drop/dragend regardless of outcome.
  const [dragRole,setDragRole]=useState(null);
  const [dragOverRole,setDragOverRole]=useState(null);
  // Which day's "post an open shift" picker is open. Team rows are per-PERSON,
  // so unlike the Week grid there's no role/block context to infer — it has to
  // be asked for.
  const [openShiftDay,setOpenShiftDay]=useState(null);

  // ONE scroll box, not two. The previous version had the day header and the
  // grid body in separate horizontally-scrolling boxes with their scrollLeft
  // values synced in JS. That can never be smooth on iOS: momentum scrolling
  // runs on the compositor thread and a scroll handler runs a frame or two
  // behind it, so the header visibly chases the body. Every app that syncs two
  // scrollers has the same lag.
  //
  // Instead the whole grid is one scroll container and the header row is
  // `position:sticky; top:0` INSIDE it. Sticky is done by the compositor, so
  // the header physically cannot drift out of step — there is nothing left to
  // synchronise. The cost is that the grid scrolls within its own height
  // rather than with the page, which is the standard spreadsheet trade and the
  // only way to keep a header pinned without JS.

  if(!schedule)return(<div style={{...s.card,padding:'52px 32px',textAlign:'center',position:'relative',overflow:'hidden'}}>
    <div style={{position:'absolute',inset:0,backgroundImage:`radial-gradient(circle, ${T.border} 1px, transparent 1px)`,backgroundSize:'24px 24px',opacity:0.5,pointerEvents:'none'}}/>
    <div style={{position:'relative'}}>
      <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:22,fontWeight:500,color:T.text,marginBottom:8}}>{t('empty.nothing')}</div>
      <div style={{fontSize:13,color:T.text2,marginBottom:4}}>{t.n('empty.across',blocks.length,{emp:employees.length,blocks:blocks.length})}</div>
      <div style={{fontSize:12,color:T.text3,marginBottom:28}}>{t('empty.respected')}</div>
      <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap'}}><Btn onClick={()=>generate()}>{t('empty.generateWeek')}</Btn><Btn onClick={generateMonth} variant="secondary">{t('empty.generateMonth')}</Btn></div>
    </div>
  </div>);

  // Sort/group employees — in "by role" mode, each employee appears in
  // exactly ONE role group (their first effective role, in the same order
  // as the Coverage tab's role list), not once per role they have. Showing
  // someone's whole week duplicated under every one of their roles was more
  // confusing than useful; which role a given shift is actually for is one
  // click away (open the shift). "Effective" roles means their configured
  // roles OR whatever they're actually scheduled as this week
  // (effectiveRolesFor) — so someone covering a one-off shift outside their
  // usual role still gets grouped sensibly.
  const allRoleOrder=allRoles;
  // Search dims rather than filters. This grid used to drop non-matching rows
  // entirely, while the Week view (whose rows are roles, not people) could
  // only dim — so the same search box did two different things depending on
  // which tab you were on. Dimming everywhere is one behaviour, and it keeps
  // the roster's shape and role grouping intact while you're looking.
  const gq=gridSearch.trim().toLowerCase();
  const matchesSearch=(name)=>!gq||(name||'').toLowerCase().includes(gq);
  // Rows = everyone still on the team, PLUS anyone archived who actually has a
  // shift in THIS week. See rosterForWeek — filtering archived people out
  // unconditionally hid their finished weeks AND, worse, hid an upcoming shift
  // they were still holding when they were archived.
  const gridEmployees=rosterForWeek(employees,schedule);
  // The footer counts a different thing from the rows, on purpose. Rows are a
  // record of the WEEK, so they include someone who has since left. The tallies
  // describe the TEAM YOU HAVE, so they don't — archiving someone should still
  // make "N of M staff" drop by one. Same reason workingCount() filters
  // internally rather than trusting whatever list it's handed.
  const rosterNow=activeOnly(employees);
  const effRoles=new Map(gridEmployees.map(e=>[e.id,effectiveRolesFor(e,schedule,blocks)]));
  const primaryRoleFor=new Map(gridEmployees.map(e=>{
    const eff=effRoles.get(e.id);
    const first=allRoleOrder.find(r=>eff.has(r));
    return [e.id,first||null];
  }));
  const rows=gridGroupBy==='role'
    ?allRoleOrder
        .filter(role=>gridEmployees.some(e=>primaryRoleFor.get(e.id)===role))
        .flatMap(role=>[...gridEmployees].filter(e=>primaryRoleFor.get(e.id)===role).sort((a,b)=>a.name.localeCompare(b.name)).map(emp=>({emp,role})))
    :[...gridEmployees].sort((a,b)=>a.name.localeCompare(b.name)).map(emp=>({emp,role:null}));
  const rowH=gridTight?60:80;
  const nameW=isMobile?(gridTight?110:140):(gridTight?140:180);
  const gridMinW=isMobile?nameW+7*104:700;
  return(
  <div>
    {/* Header — sticky so it stays visible while scrolling the employee
        list. The by-name/by-role/compact/search/count controls that used to
        live in their own sticky bar right here now live one level up, folded
        into the same row as the date nav and Week/Month/Team tabs — one
        toolbar instead of two stacked ones. */}
    <div style={{...s.cardFlush,overflow:'auto',maxHeight:`calc(100vh - ${(stickyTop??98)+24}px)`,WebkitOverflowScrolling:'touch'}}>
        {/* Header — sticky to the TOP OF THIS BOX, so it moves horizontally
            with the columns for free and stays put vertically. */}
        <div style={{display:'grid',gridTemplateColumns:`${nameW}px repeat(7,minmax(0,1fr))`,minWidth:gridMinW,borderBottom:`2px solid ${T.border}`,background:T.surfaceWarm,position:'sticky',top:0,zIndex:21}}>
          <div style={{padding:gridTight?'10px 14px':'14px 20px',fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.08em',borderRight:`1px solid ${T.border}`}}>{t('to.employee')}</div>
          {DAYS.map((day,i)=>{
            const date=weekDates[i],isToday=dateToISO(date)===dateToISO(new Date());
            return(<button key={day} onClick={()=>onIsolateDay&&onIsolateDay(day)} title={t('week.isolateDay')} style={{padding:gridTight?'10px 8px':'14px 12px',textAlign:'center',borderTop:'none',borderLeft:'none',borderBottom:isToday?`2px solid ${T.accent}`:'none',borderRight:i<6?`1px solid ${T.border}`:'none',background:isToday?T.accentLight:'transparent',cursor:onIsolateDay?'pointer':'default',fontFamily:'inherit',width:'100%',boxSizing:'border-box',outline:'none'}} onMouseEnter={e=>{if(onIsolateDay)e.currentTarget.style.background=isToday?T.accentLight:T.surface;}} onMouseLeave={e=>{e.currentTarget.style.background=isToday?T.accentLight:'transparent';}}>
              <div style={{fontSize:gridTight?12:13,fontWeight:600,color:isToday?T.accent:T.text}}>{t('day.'+day)}</div>
              <div style={{fontSize:gridTight?10:12,color:isToday?T.accent:T.text3,marginTop:1}}>{date.getDate()} {date.toLocaleDateString(LOCALE,{month:'short'})}</div>
            </button>);
          })}
        </div>
      {/* Open shifts — the Week grid can post one straight into a role cell,
          but Team's rows are people, so this row carries them instead and asks
          which block/role when you add one. */}
      {postOpenShift&&(
        <div style={{display:'grid',gridTemplateColumns:`${nameW}px repeat(7,minmax(0,1fr))`,minWidth:gridMinW,borderBottom:`1px solid ${T.border}`,background:T.surface}}>
          <div style={{padding:gridTight?'8px 14px':'12px 20px',borderRight:`1px solid ${T.border}`,display:'flex',alignItems:'center',gap:8}}>
            <span style={{width:gridTight?22:28,height:gridTight?22:28,borderRadius:'50%',background:T.accent+'1E',color:T.accent,display:'flex',alignItems:'center',justifyContent:'center',fontSize:gridTight?11:13,fontWeight:700,flexShrink:0,border:`1.5px dashed ${T.accent}55`}}>?</span>
            <span style={{fontSize:gridTight?11:12,fontWeight:600,color:T.accentText}}>{t('open.rowLabel')}</span>
          </div>
          {DAYS.map((day,di)=>{
            const forDay=openShiftsForDay?openShiftsForDay(day):[];
            return(<div key={day} style={{padding:'6px 7px',borderRight:di<6?`1px solid ${T.border}`:'none',display:'flex',flexDirection:'column',gap:3,justifyContent:'center',position:'relative'}}>
              {forDay.map(sw=>(
                <div key={sw.id} style={{display:'flex',alignItems:'center',gap:4,padding:'3px 6px',borderRadius:7,background:T.accentLight,border:`1px dashed ${T.accent}66`}}>
                  <span style={{flex:1,minWidth:0,fontSize:10,fontWeight:600,color:T.accentText,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{blocks.find(b=>b.id===sw.blockId)?.name||''} · {sw.role}</span>
                  {cancelOpenShift&&sw.status==='open'&&<button onClick={()=>cancelOpenShift(sw)} title={t('open.cancel')} style={{background:'none',border:'none',cursor:'pointer',color:T.accentText,opacity:0.6,fontSize:11,padding:0,fontFamily:'inherit'}}>✕</button>}
                </div>
              ))}
              <button onClick={()=>setOpenShiftDay(openShiftDay===day?null:day)} title={t('open.post')} style={{padding:'3px 7px',borderRadius:7,fontSize:10,fontWeight:500,background:'transparent',color:T.accent,border:`1px dashed ${T.accent}55`,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}>{t('open.postShort')}</button>
              {openShiftDay===day&&(
                <div style={{position:'absolute',top:'100%',left:4,zIndex:30,background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,boxShadow:'0 12px 30px -10px rgba(33,27,21,0.35)',padding:8,minWidth:150}}>
                  <div style={{fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:6}}>{t('open.post')}</div>
                  {blocks.map(b=>(
                    <div key={b.id} style={{marginBottom:6}}>
                      <div style={{fontSize:10,color:T.text3,marginBottom:3}}>{b.name}</div>
                      <div style={{display:'flex',flexWrap:'wrap',gap:3}}>
                        {allRoles.map(r=>(
                          <button key={r} onClick={()=>{postOpenShift(day,b.id,r);setOpenShiftDay(null);}} style={{padding:'2px 7px',borderRadius:7,fontSize:10,fontWeight:500,background:'transparent',border:`1px solid ${T.border}`,color:T.text2,cursor:'pointer',fontFamily:'inherit'}}>{r}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <button onClick={()=>setOpenShiftDay(null)} style={{fontSize:10,color:T.text3,background:'none',border:'none',cursor:'pointer',fontFamily:'inherit',padding:0}}>{t('common.cancel')}</button>
                </div>
              )}
            </div>);
          })}
        </div>
      )}
      {/* Rows */}
      {rows.map((row,ri)=>{
        const emp=row.emp;
        const p=pal(emp);
        const prevRole=ri>0?rows[ri-1].role:undefined;
        const showDivider=gridGroupBy==='role'&&row.role!==prevRole;
        const roleCollapsed=gridGroupBy==='role'&&row.role&&collapsedRoles.has(row.role);
        return(<div key={`${row.role||'all'}-${emp.id}`}>
          {/* Role group divider — click to collapse/expand, drag to reorder */}
          {showDivider&&<div
            onClick={()=>toggleRoleCollapse(row.role)}
            draggable={gridGroupBy==='role'}
            onDragStart={e=>{setDragRole(row.role);e.dataTransfer.effectAllowed='move';}}
            onDragEnd={()=>{setDragRole(null);setDragOverRole(null);}}
            onDragOver={e=>{if(dragRole&&dragRole!==row.role){e.preventDefault();if(dragOverRole!==row.role)setDragOverRole(row.role);}}}
            onDragLeave={()=>{if(dragOverRole===row.role)setDragOverRole(null);}}
            onDrop={e=>{e.preventDefault();reorderRoles&&reorderRoles(dragRole,row.role);setDragRole(null);setDragOverRole(null);}}
            style={{display:'grid',gridTemplateColumns:`${nameW}px repeat(7,minmax(0,1fr))`,minWidth:gridMinW,background:T.surfaceWarm,borderTop:dragOverRole===row.role?`2px solid ${T.accent}`:`2px solid ${T.border}`,borderBottom:`1px solid ${T.border}`,cursor:reorderRoles?'grab':'pointer',userSelect:'none',opacity:dragRole===row.role?0.5:1,transition:'opacity 0.15s,border-color 0.15s'}}>
            <div style={{padding:'6px 14px',display:'flex',alignItems:'center',gap:8,borderRight:`1px solid ${T.border}`}}>
              {reorderRoles&&<GripDots title={t('grid.dragToReorder')}/>}
              <span style={{fontSize:9,color:T.text3,transform:roleCollapsed?'rotate(-90deg)':'none',transition:'transform 0.15s',display:'inline-block'}}>▾</span>
              <RoleBadge role={row.role} rs={roleStyles[row.role]}/>
            </div>
            {DAYS.map((_,i)=><div key={i} style={{borderRight:i<6?`1px solid ${T.border}`:'none'}}/>)}
          </div>}
          {!roleCollapsed && <div style={{display:'grid',gridTemplateColumns:`${nameW}px repeat(7,minmax(0,1fr))`,minWidth:gridMinW,borderBottom:`1px solid ${T.border}`,background:ri%2===1?T.surfaceWarm:T.surface,opacity:matchesSearch(emp.name)?1:0.25,filter:matchesSearch(emp.name)?'none':'grayscale(1)',transition:'opacity 0.15s,filter 0.15s'}}>
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
              // One entry per ASSIGNMENT, not per block. Someone can legitimately
              // hold two roles in the same block (e.g. Manager and Waiter at
              // lunch); listing blocks showed only one card for that and — worse
              // — looking the entry back up by employee id returned whichever
              // came first, so clicking their Waiter card opened their Manager
              // shift. Each card now carries its own real index.
              const myEntries=blocks.flatMap(b=>(schedule[day]?.[b.id]||[]).map((a,i)=>({b,a,i})).filter(x=>x.a.empId===emp.id));
              return(<div key={day} style={{padding:gridTight?'6px 5px':'8px 7px',borderRight:di<6?`1px solid ${T.border}`:'none',display:'flex',flexDirection:'column',gap:4,justifyContent:'center',minHeight:rowH}}>
                {/* Leave and shifts are shown TOGETHER, not either/or. The leave
                    card used to replace the cell entirely, which hid the fact
                    that someone was still rostered on a day they'd booked off —
                    exactly the clash a manager needs to see. */}
                {onTO&&(
                  <div style={{padding:gridTight?'4px 7px':'7px 9px',borderRadius:7,background:T.warningLight,border:`1px solid ${T.warning}44`,textAlign:'center'}}>
                    <div style={{fontSize:gridTight?10:11,fontWeight:600,color:T.warning}}>{t('staff.leave')}</div>
                  </div>
                )}
                {myEntries.length>0?myEntries.map(({b,a:shiftEntry,i:realIdx})=>{
                  const dispStart=shiftEntry?.start||b.start,dispEnd=shiftEntry?.end||b.end;
                  // Actual (clocked) hours, not scheduled — falls back to the
                  // scheduled figure automatically for anything not yet
                  // clocked, same helper the Costs tab and Profile page use.
                  const bh=actualAssignmentHours(shiftEntry||{},b);
                  const clockedInfo=shiftEntry&&(shiftEntry.noShow||shiftEntry.actualStart||shiftEntry.actualEnd);
                  const clockStatusColor=shiftEntry?.noShow?T.danger:T.success;
                  return(
                    <div key={b.id+"-"+realIdx} onClick={()=>openEditSlot(day,b.id,realIdx)} title={onTO?t('staff.leaveClash'):clockedInfo?(shiftEntry.noShow?t('emp.noShow'):`${t('week.clockedLabel')} ${shiftEntry.actualStart||'—'}–${shiftEntry.actualEnd||t('week.clockedOngoing')}`):t('week.editShift')} style={{padding:gridTight?'5px 8px':'9px 11px',borderRadius:8,background:isDark()?p.dot+'28':p.bg,border:`2px solid ${onTO?T.warning:clockedInfo?clockStatusColor+'88':p.dot+'55'}`,position:'relative',flexShrink:0,cursor:'pointer',transition:'box-shadow 0.15s,transform 0.15s'}} onMouseEnter={e=>{e.currentTarget.style.boxShadow=`0 0 0 2px ${p.dot}55`;e.currentTarget.style.transform='translateY(-1px)';}} onMouseLeave={e=>{e.currentTarget.style.boxShadow='none';e.currentTarget.style.transform='none';}}>
                      <div style={{position:'absolute',top:gridTight?5:7,right:gridTight?5:7,width:6,height:6,borderRadius:'50%',background:clockedInfo?clockStatusColor:p.dot}}/>
                      <div style={{fontSize:gridTight?11:14,fontWeight:700,color:isDark()?p.dot:p.text,lineHeight:1.1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{b.name}</div>
                      {!gridTight&&<div style={{fontSize:11,color:isDark()?p.dot+'CC':p.text,opacity:0.85,marginTop:2,whiteSpace:'nowrap'}}>{dispStart}–{dispEnd}</div>}
                      {gridTight&&<div style={{fontSize:9,color:isDark()?p.dot+'99':p.text,opacity:0.7}}>{dispStart.slice(0,5)}</div>}
                      {!gridTight&&<div style={{fontSize:10,color:isDark()?p.dot+'88':p.text,opacity:0.65,marginTop:1,whiteSpace:'nowrap'}}>{bh.toFixed(1)}h</div>}
                      {/* What actually happened, straight from the punch clock/kiosk —
                          only rendered once someone's actually clocked in (or been
                          marked a no-show), so a not-yet-worked future shift still
                          shows just the plain scheduled time above. */}
                      {!gridTight&&clockedInfo&&(
                        <div style={{fontSize:10,fontWeight:600,color:clockStatusColor,marginTop:3}}>
                          {shiftEntry.noShow?t('emp.noShow'):`${t('week.clockedLabel')} ${shiftEntry.actualStart||'—'}–${shiftEntry.actualEnd||t('week.clockedOngoing')}`}
                        </div>
                      )}
                    </div>
                  );
                }):onTO?null:(
                  <button onClick={()=>openShiftModalFor(emp,weekOffset,day)} title={t('grid.addShiftTitle')} style={{height:gridTight?32:46,borderRadius:7,border:`1.5px dashed ${T.border}`,display:'flex',alignItems:'center',justifyContent:'center',opacity:0.35,background:'transparent',cursor:'pointer',fontFamily:'inherit',width:'100%',transition:'opacity 0.15s,border-color 0.15s'}} onMouseEnter={e=>{e.currentTarget.style.opacity=1;e.currentTarget.style.borderColor=T.accent;}} onMouseLeave={e=>{e.currentTarget.style.opacity=0.35;e.currentTarget.style.borderColor=T.border;}}>
                    <span style={{fontSize:16,color:T.text3}}>+</span>
                  </button>
                )}
              </div>);
            })}
          </div>}
        </div>);
      })}
      {/* Footer */}
      <div style={{display:'grid',gridTemplateColumns:`${nameW}px repeat(7,minmax(0,1fr))`,minWidth:gridMinW,background:T.surfaceWarm,borderTop:`2px solid ${T.border}`}}>
        <div style={{padding:'10px 20px',fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em',borderRight:`1px solid ${T.border}`,display:'flex',alignItems:'center'}}>{t('grid.totalLabel')}</div>
        {DAYS.map((day,di)=>{
          const count=workingCount(schedule,blocks,day,gridEmployees);
          const onLeave=rosterNow.filter(e=>isOnTimeOff(e.id,weekDates[di],timeOff)).length;
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
      <span style={{fontSize:12,color:T.text2}}><b style={{color:T.text}}>{rosterNow.reduce((acc,e)=>acc+empHours(e.id),0)}h</b>{t('staff.totalHours')}</span>
      <span style={{fontSize:12,color:T.text2}}><b style={{color:T.text}}>{rosterNow.filter(e=>empHours(e.id)>0).length}</b>{t('staff.staffWorking',{n:rosterNow.length})}</span>
      {offThisWeek.length>0&&<span style={{fontSize:12,color:T.warning}}><b>{offThisWeek.length}</b>{t('staff.onLeaveCount')}</span>}
    </div>
  </div>
  );
}
