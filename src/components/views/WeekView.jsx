import { Fragment, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { T, DAYS, isDark, pal, initials, DEFAULT_ROLE_STYLES } from '../../lib/constants';
import { toMin, fmt, dateToISO, LOCALE } from '../../lib/dates';
import { blockHours, getBlockRoles, effectiveHourlyRate, actualTimeRange } from '../../lib/schedule';
import { Avatar, RoleBadge, EmpCard, Btn } from '../ui';

// The week/day schedule grid: per-role×day assignment table, the day-isolated
// Gantt timeline (drag edges to resize, click a bar to edit), and the weekly
// hours summary card at the bottom.
export default function WeekView({
  schedule, blocks, employees, offThisWeek, generate, generateMonth,
  dayFilter, setDayFilter, selected, setSelected, dayGroupBy, setDayGroupBy,
  roleStyles, isMobile, ganttPreview, ganttJustDraggedRef, openEditSlot,
  beginGanttDrag, minToHHMM, collapsedBlocks, setCollapsedBlocks, warnings,
  weekDates, handleSlotClick, openPicker, pickerRoleFilter, setPickerRoleFilter,
  pickerSortBy, setPickerSortBy, pickerSearch, setPickerSearch, candidatesForSlot,
  addToSlot, closePicker, empHours, allRoles, handleEmptySlotClick, openPickerFor,
  removeFromSlot, gridGroupBy, setGridGroupBy, gridTight, setGridTight,
  currency, openShiftsFor, postOpenShift, cancelOpenShift, dropAssignment, search,
  s, t,
}){
  // Ticking "now" marker for the day-isolated Gantt view — only matters
  // when that view is actually showing, but the hook itself has to run
  // unconditionally (before the empty-schedule early return below) per
  // the rules of hooks, so it's a cheap 60s interval regardless.
  const [now,setNow]=useState(()=>new Date());
  useEffect(()=>{
    const id=setInterval(()=>setNow(new Date()),60000);
    return ()=>clearInterval(id);
  },[]);
  // Which day column is currently hovered in the (non-isolated) role×day
  // table below — highlights the whole column, header included, so a shift
  // grid this dense still reads as separate day "cards" rather than one flat
  // sheet. Only one column at a time, so a single piece of state is enough.
  const [hoverDay,setHoverDay]=useState(null);
  // Drag-to-move state. dragSrc is the assignment currently being dragged
  // ({day,blockId,idx,empId}); dropKey is whichever slot is under the cursor
  // right now, purely for the highlight. Both cleared on drop/dragend so a
  // cancelled drag (Esc, or released over nothing) leaves no stale
  // highlight behind.
  const [dragSrc,setDragSrc]=useState(null);
  const [dropKey,setDropKey]=useState(null);
  const endDrag=()=>{setDragSrc(null);setDropKey(null);};
  // Staff search. The Week grid's rows are ROLES, not people, so it can't
  // filter rows down the way the Team grid does — hiding non-matches would
  // leave holes where the rest of the week's shape used to be. Dimming keeps
  // that shape readable while making the person you asked about jump out.
  const q=(search||'').trim().toLowerCase();
  const matchesSearch=(name)=>!q||(name||'').toLowerCase().includes(q);
  if(!schedule)return(<div style={{...s.card,padding:'52px 32px',textAlign:'center',position:'relative',overflow:'hidden'}}>
    <div style={{position:'absolute',inset:0,backgroundImage:`radial-gradient(circle, ${T.border} 1px, transparent 1px)`,backgroundSize:'24px 24px',opacity:0.5,pointerEvents:'none'}}/>
    <div style={{position:'relative'}}>
      <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:22,fontWeight:500,color:T.text,marginBottom:8}}>{t('empty.nothing')}</div>
      <div style={{fontSize:13,color:T.text2,marginBottom:4}}>{t.n('empty.across',blocks.length,{emp:employees.length,blocks:blocks.length})}{offThisWeek.length>0?t('empty.leaveSuffix',{n:offThisWeek.length}):''}</div>
      <div style={{fontSize:12,color:T.text3,marginBottom:28}}>{t('empty.respected')}</div>
      <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap'}}><Btn onClick={()=>generate()}>{t('empty.generateWeek')}</Btn><Btn onClick={generateMonth} variant="secondary">{t('empty.generateMonth')}</Btn></div>
    </div>
  </div>);

  const effectiveDay=dayFilter;
  const effectiveDate=effectiveDay?weekDates?.[DAYS.indexOf(effectiveDay)]:null;
  const isTodayView=!!effectiveDate&&dateToISO(effectiveDate)===dateToISO(now);
  const nowMin=now.getHours()*60+now.getMinutes();
  // The person currently picked up for a move/swap — if they have more than
  // one role, they should be a valid move target for ANY of their roles, not
  // just whichever role they happened to be filling in their original slot.
  const selectedEmp=selected?employees.find(e=>e.id===selected.empId):null;
  const selectedRoles=selectedEmp?(selectedEmp.roles||[]):(selected?[selected.role]:[]);
  const filterDays=effectiveDay?[effectiveDay]:DAYS;
  // Each segment keeps its own blockId (and the block's own default hours)
  // so a bar in the Gantt maps 1:1 to one real assignment — needed so
  // dragging an edge knows exactly which (day, block, person) to update.
  // Segments are deliberately NOT merged across blocks any more (they used
  // to be, cosmetically, when touching) since that would make a dragged bar
  // ambiguous about which underlying assignment it represents.
  const dayShiftsRaw=effectiveDay?blocks.flatMap(b=>{
    return (schedule[effectiveDay]?.[b.id]||[]).map(a=>{
      const st=a.start||b.start,en=a.end||b.end;
      const bs=toMin(st);let be=toMin(en);if(be<=bs)be+=1440;
      // Assignments carry their own embedded name (a.name), frozen at the
      // moment the shift was created — a rename afterward never touches
      // existing schedule data. Prefer the CURRENT roster name, only
      // falling back to the embedded one for an assignment whose employee
      // has since been deleted entirely (same fallback EmpCard already
      // uses elsewhere in this file).
      const liveName=employees.find(e=>e.id===a.empId)?.name||a.name;
      return{empId:a.empId,name:liveName,role:a.role,blockId:b.id,blockName:b.name,blockStart:b.start,blockEnd:b.end,startStr:st,endStr:en,start:bs,end:be};
    });
  }):[];
  const byEmp=new Map();
  dayShiftsRaw.forEach(s=>{
    if(!byEmp.has(s.empId))byEmp.set(s.empId,{empId:s.empId,name:s.name,role:s.role,segs:[]});
    byEmp.get(s.empId).segs.push({blockId:s.blockId,role:s.role,blockStart:s.blockStart,blockEnd:s.blockEnd,start:s.start,end:s.end,startStr:s.startStr,endStr:s.endStr});
  });
  const dayRows=[...byEmp.values()].map(r=>{
    const merged=[...r.segs].sort((a,b)=>a.start-b.start);
    return {...r,merged};
  }).sort((a,b)=>dayGroupBy==='role'?(allRoles.indexOf(a.role)-allRoles.indexOf(b.role))||a.name.localeCompare(b.name):a.name.localeCompare(b.name));
  const fmtTick=m=>String(Math.floor((m%1440)/60)).padStart(2,'0')+':00';
  let timeline=null;
  if(effectiveDay&&dayRows.length){
    const allStarts=dayRows.flatMap(r=>r.merged.map(m=>m.start)),allEnds=dayRows.flatMap(r=>r.merged.map(m=>m.end));
    const rangeStart=Math.floor(Math.min(...allStarts)/60)*60;
    const rangeEnd=Math.ceil(Math.max(...allEnds)/60)*60;
    const totalMin=Math.max(60,rangeEnd-rangeStart);
    const ticks=[];for(let m=rangeStart;m<=rangeEnd;m+=60)ticks.push(m);
    // "Comfortable" (the default) is the taller row/label size — bars used
    // to be tight enough (20/24px) that the time label inside was the
    // smallest text on the page. "Compact" keeps the old tighter size for
    // fitting more people on screen at once. Same gridTight flag the Team
    // grid's own Compact/Comfortable toggle uses, so it's one shared setting
    // rather than two views disagreeing about what "compact" means.
    const ganttSideW=isMobile?76:112,ganttRowH=gridTight?(isMobile?20:24):(isMobile?28:34);
    timeline=(
      <div style={{...s.cardFlush,padding:isMobile?'14px 10px 12px':'16px 18px 14px',overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8,marginBottom:10,minWidth:isMobile?480:'auto'}}>
          <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
            {[...new Set(dayRows.map(r=>r.role))].map(role=>{const rs=roleStyles[role]||DEFAULT_ROLE_STYLES.Other;return(<div key={role} style={{display:'flex',alignItems:'center',gap:5}}><span style={{width:8,height:8,borderRadius:'50%',background:rs.dot,flexShrink:0}}/><span style={{fontSize:11,color:T.text2}}>{role}</span></div>);})}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <div style={{display:'flex',alignItems:'center',gap:2,background:T.surfaceWarm,border:`1px solid ${T.border}`,borderRadius:8,padding:3}}>
              {[['role',t('grid.byRole')],['name',t('grid.byName')]].map(([k,l])=><button key={k} onClick={()=>setDayGroupBy(k)} style={{padding:'3px 10px',borderRadius:6,background:dayGroupBy===k?T.bg:'transparent',border:dayGroupBy===k?`1px solid ${T.border}`:'1px solid transparent',cursor:'pointer',fontSize:11,fontWeight:dayGroupBy===k?500:400,color:dayGroupBy===k?T.text:T.text2,fontFamily:'inherit'}}>{l}</button>)}
            </div>
            {setGridTight&&<button onClick={()=>setGridTight(p=>!p)} style={{padding:'4px 10px',borderRadius:8,background:gridTight?T.bg:T.surfaceWarm,border:`1px solid ${T.border}`,cursor:'pointer',fontSize:11,color:gridTight?T.text:T.text2,fontFamily:'inherit',fontWeight:gridTight?500:400}}>
              {gridTight?t('grid.compact'):t('grid.comfortable')}
            </button>}
          </div>
        </div>
        <div style={{fontSize:11,color:T.text3,marginBottom:8,minWidth:isMobile?480:'auto'}}>{t('week.dragHint')}</div>
        <div style={{position:'relative',height:16,marginLeft:ganttSideW,marginBottom:10,minWidth:isMobile?480-ganttSideW:'auto'}}>
          {ticks.map(m=>(<span key={m} style={{position:'absolute',left:`${(m-rangeStart)/totalMin*100}%`,transform:'translateX(-50%)',fontSize:10,color:T.text3,whiteSpace:'nowrap'}}>{fmtTick(m)}</span>))}
        </div>
        <div style={{display:'flex',gap:8,minWidth:isMobile?480:'auto'}}>
          <div style={{width:ganttSideW,flexShrink:0,display:'flex',flexDirection:'column',gap:8}}>
            {dayRows.map(row=>{const rs=roleStyles[row.role]||DEFAULT_ROLE_STYLES.Other;const dim=!matchesSearch(row.name);return(<div key={row.empId} style={{height:ganttRowH,display:'flex',alignItems:'center',gap:6,fontSize:gridTight?(isMobile?11:12):(isMobile?12:13),fontWeight:500,color:T.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',opacity:dim?0.28:1,transition:'opacity 0.15s'}}><span style={{width:8,height:8,borderRadius:'50%',background:rs.dot,flexShrink:0}}/>{row.name}</div>);})}
          </div>
          <div style={{position:'relative',flex:1}}>
            {ticks.map(m=>(<div key={m} style={{position:'absolute',left:`${(m-rangeStart)/totalMin*100}%`,top:0,bottom:0,width:1,zIndex:2,pointerEvents:'none',background:m===rangeStart||m===rangeEnd?'transparent':T.border}}/>))}
            {isTodayView&&nowMin>=rangeStart&&nowMin<=rangeEnd&&(
              <div style={{position:'absolute',left:`${(nowMin-rangeStart)/totalMin*100}%`,top:-2,bottom:-2,width:2,zIndex:4,pointerEvents:'none',background:T.danger,borderRadius:1,boxShadow:`0 0 0 2px ${T.danger}22`}}>
                <div style={{position:'absolute',top:-4,left:'50%',transform:'translateX(-50%)',width:6,height:6,borderRadius:'50%',background:T.danger}}/>
              </div>
            )}
            <div style={{display:'flex',flexDirection:'column',gap:8,position:'relative'}}>
              {dayRows.map(row=>{
                const dimRow=!matchesSearch(row.name);
                return(<div key={row.empId} style={{position:'relative',height:ganttRowH,background:T.surfaceWarm,borderRadius:6,opacity:dimRow?0.28:1,filter:dimRow?'grayscale(1)':'none',transition:'opacity 0.15s,filter 0.15s'}}>
                  {row.merged.map((seg,si)=>{
                    const rs=roleStyles[seg.role]||DEFAULT_ROLE_STYLES.Other;
                    const dragging=ganttPreview&&ganttPreview.day===effectiveDay&&ganttPreview.blockId===seg.blockId&&ganttPreview.empId===row.empId;
                    const segIdx=(schedule[effectiveDay]?.[seg.blockId]||[]).findIndex(a=>a.empId===row.empId);
                    const realA=schedule[effectiveDay]?.[seg.blockId]?.[segIdx];
                    const isNoShow=!!realA?.noShow;
                    const hasActual=!isNoShow&&realA&&(realA.actualStart||realA.actualEnd);
                    // The bar itself is sized/positioned by what was actually
                    // clocked (falling back to whichever edge hasn't been
                    // recorded yet), not just the scheduled time — so a shift
                    // that ran short or long actually looks short or long,
                    // not just a same-size bar with a note attached.
                    // actualTimeRange (lib/schedule.js) is the single shared
                    // place that turns actualStart/actualEnd into minutes,
                    // including the overnight-wrap and same-minute-punch
                    // conventions — this used to be hand-duplicated here.
                    let actStart=seg.start,actEnd=seg.end,actOngoing=false;
                    if(hasActual){
                      const range=actualTimeRange(realA,{start:seg.startStr,end:seg.endStr});
                      actStart=range.startMin; actEnd=range.endMin; actOngoing=range.ongoing;
                      // Still clocked in with no clock-out yet — nudge the
                      // placeholder width out a bit so a bar that's barely
                      // started still reads as a visible sliver.
                      if(actOngoing) actEnd=Math.max(actStart+15,actEnd);
                    }
                    const rawStart=dragging?ganttPreview.start:(hasActual?actStart:seg.start);
                    const rawEnd=dragging?ganttPreview.end:(hasActual?actEnd:seg.end);
                    // Clamped only for on-screen position/width, so a punch
                    // well outside every scheduled window that day can't push
                    // the bar outside its row — the label below still shows
                    // the true recorded time regardless of clamping.
                    const clampedStart=Math.min(Math.max(rawStart,rangeStart),rangeEnd);
                    const clampedEnd=Math.min(Math.max(rawEnd,rangeStart),rangeEnd);
                    const leftPct=(clampedStart-rangeStart)/totalMin*100,widthPct=(clampedEnd-clampedStart)/totalMin*100;
                    // A percentage width alone can shrink to almost nothing
                    // (e.g. a same-minute clock in/out) — floor it with a
                    // real pixel minimum wide enough to hold the label
                    // ("No se presentó" is the longest case across locales),
                    // instead of letting the bar and its text both collapse
                    // to an unreadable dot.
                    const barMinPx=gridTight?(isMobile?84:104):(isMobile?92:116);
                    const label=dragging?`${minToHHMM(rawStart)}–${minToHHMM(rawEnd)}`
                      :isNoShow?t('emp.noShow')
                      :hasActual?`${realA.actualStart||seg.startStr}–${realA.actualEnd||'…'}${actOngoing?' ●':' ✓'}`
                      :`${seg.startStr}–${seg.endStr}`;
                    // A dashed outline at the ORIGINAL scheduled position, drawn
                    // behind the real bar, only when actual time genuinely
                    // differs — lets a manager see at a glance how early/late/
                    // long a shift ran compared to plan.
                    const showGhost=hasActual&&(actStart!==seg.start||actEnd!==seg.end);
                    const ghostLeftPct=(seg.start-rangeStart)/totalMin*100,ghostWidthPct=(seg.end-seg.start)/totalMin*100;
                    // No-show is the one state worth a color change (nothing
                    // actually happened) — an ordinary clocked shift just uses
                    // the role's own color same as always, only resized; the
                    // ✓/● in the label is what signals "this already
                    // happened" rather than a background tint.
                    const barColor=isNoShow?T.danger:rs.dot;
                    // A Fragment (not a wrapping div) — the drag handles below
                    // walk up two parentElements to find the row "rail" for
                    // computing drag position, which only works if the bar
                    // div is still a DIRECT child of the row container.
                    return(<Fragment key={si}>
                      {showGhost&&<div style={{position:'absolute',left:`${ghostLeftPct}%`,width:`${ghostWidthPct}%`,top:0,bottom:0,minWidth:14,border:`1.5px dashed ${rs.dot}88`,borderRadius:6,pointerEvents:'none',zIndex:0}}/>}
                      <div onClick={()=>{if(ganttJustDraggedRef.current)return;openEditSlot(effectiveDay,seg.blockId,segIdx);}} title={t('week.editShift')} style={{position:'absolute',left:`${leftPct}%`,width:`max(${widthPct}%, ${barMinPx}px)`,top:0,bottom:0,background:isDark()?barColor+'40':barColor+'30',border:`1.5px solid ${barColor}`,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',zIndex:dragging?5:1,boxShadow:dragging?'0 2px 8px rgba(0,0,0,0.25)':'none',cursor:'pointer'}}>
                        <span style={{fontSize:gridTight?(isMobile?9:10):(isMobile?11:13),fontWeight:600,color:isDark()?barColor:isNoShow?barColor:rs.text,whiteSpace:'nowrap',padding:'0 5px',pointerEvents:'none'}}>{label}</span>
                        <div onMouseDown={e=>beginGanttDrag(e,{day:effectiveDay,blockId:seg.blockId,empId:row.empId,edge:'start',origStart:seg.start,origEnd:seg.end,railEl:e.currentTarget.parentElement.parentElement,rangeStart,totalMin})} onTouchStart={e=>beginGanttDrag(e,{day:effectiveDay,blockId:seg.blockId,empId:row.empId,edge:'start',origStart:seg.start,origEnd:seg.end,railEl:e.currentTarget.parentElement.parentElement,rangeStart,totalMin})} onClick={e=>e.stopPropagation()} style={{position:'absolute',left:0,top:0,bottom:0,width:8,cursor:'ew-resize',touchAction:'none'}}/>
                        <div onMouseDown={e=>beginGanttDrag(e,{day:effectiveDay,blockId:seg.blockId,empId:row.empId,edge:'end',origStart:seg.start,origEnd:seg.end,railEl:e.currentTarget.parentElement.parentElement,rangeStart,totalMin})} onTouchStart={e=>beginGanttDrag(e,{day:effectiveDay,blockId:seg.blockId,empId:row.empId,edge:'end',origStart:seg.start,origEnd:seg.end,railEl:e.currentTarget.parentElement.parentElement,rangeStart,totalMin})} onClick={e=>e.stopPropagation()} style={{position:'absolute',right:0,top:0,bottom:0,width:8,cursor:'ew-resize',touchAction:'none'}}/>
                      </div>
                    </Fragment>);
                  })}
                </div>);
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }
  return(<div style={{display:'flex',flexDirection:'column',gap:16}}>
  {selected&&(
    <div style={{position:'fixed',bottom:20,left:isMobile?14:20,right:isMobile?14:'auto',maxWidth:isMobile?'calc(100% - 28px)':340,zIndex:210,background:T.surface,border:`1px solid ${T.accent}55`,borderRadius:12,padding:'12px 14px',display:'flex',alignItems:'flex-start',gap:10,boxShadow:'0 12px 30px -10px rgba(33,27,21,0.35)'}}>
      <span style={{fontSize:14}}>✥</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:12,fontWeight:600,color:T.text,marginBottom:2}}>{t('week.moving',{name:selected.name})}</div>
        <div style={{fontSize:11,color:T.text3,marginBottom:8}}>{t('week.movingHint')}</div>
        <div style={{display:'flex',gap:6}}>
          <Btn small variant="danger" onClick={()=>{removeFromSlot(selected.day,selected.blockId,selected.idx);setSelected(null);}}>{t('common.remove')}</Btn>
          <Btn small variant="ghost" onClick={()=>setSelected(null)}>{t('common.cancel')}</Btn>
        </div>
      </div>
    </div>
  )}
  {timeline}
  {blocks.map(block=>{
    const isCollapsed=!!collapsedBlocks[block.id];
    const blockWarnings=warnings.filter(w=>w.includes(block.name));
    return(
    <div key={block.id} style={s.cardFlush}>
      <div onClick={()=>setCollapsedBlocks(p=>({...p,[block.id]:!p[block.id]}))} style={{padding:'12px 20px',borderBottom:isCollapsed?'none':`1px solid ${T.border}`,background:T.surfaceWarm,display:'flex',alignItems:'center',gap:12,cursor:'pointer',userSelect:'none'}}>
        <span style={{fontSize:11,color:T.text3,transform:isCollapsed?'rotate(-90deg)':'none',transition:'transform 0.15s',display:'inline-block'}}>▾</span>
        <div style={{flex:1}}><span style={{fontFamily:'Fraunces, Georgia, serif',fontSize:15,fontWeight:500}}>{block.name}</span><span style={{fontSize:12,color:T.text3,marginLeft:10}}>{block.start} – {block.end} · {blockHours(block).toFixed(1)}h</span></div>
        {/* Drag hint lives in the header rather than as its own full-width
            band between the header and the table — as a band it read like a
            stray strip of UI. Desktop only: there's no dragging on touch, and
            it would crowd a narrow header. */}
        {dropAssignment&&!effectiveDay&&!isCollapsed&&!isMobile&&(
          <span style={{fontSize:10,color:T.text3,fontStyle:'italic',whiteSpace:'nowrap'}}>{t('week.dragToMove')}</span>
        )}
        {blockWarnings.length>0&&<span style={{fontSize:10,color:T.danger,background:T.dangerLight,border:`1px solid ${T.danger}33`,padding:'2px 8px',borderRadius:999,fontWeight:500}}>! {blockWarnings.length}</span>}
        <span style={{fontSize:10,color:T.success,background:T.successLight,border:`1px solid ${T.success}33`,padding:'2px 8px',borderRadius:999,fontWeight:500}}>{t('week.managerEnforced')}</span>
      </div>
      {!isCollapsed&&<div style={{overflowX:'auto'}}>
        {/* tableLayout:'fixed' is what actually keeps the 7 day columns equal.
            Without it a cell sizes to its widest child, so adding a single
            open shift (or a long name) visibly widened that whole day
            relative to the others. minWidth rises with it so each fixed
            column still has room for a card — narrower viewports scroll
            horizontally, which the wrapper already handles. */}
        <table style={{width:'100%',borderCollapse:'collapse',tableLayout:effectiveDay?'auto':'fixed',minWidth:effectiveDay?580:972}}>
          <thead><tr>
            <th style={{width:132,textAlign:'left',padding:'10px 14px',fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em',background:T.surfaceWarm,borderBottom:`1px solid ${T.border}`}}>{t('week.role')}</th>
            {filterDays.map(day=>{
              const i=DAYS.indexOf(day),isActive=effectiveDay===day,isHover=hoverDay===day;
              // Today gets a marked header (accent text + a solid underline)
              // so you can find where you are in the week at a glance. Kept
              // distinct from the "isolated day" state, which uses a filled
              // background — the two can be true at once.
              const isToday=weekDates[i]&&dateToISO(weekDates[i])===dateToISO(now);
              return(<th key={day} onClick={()=>setDayFilter(f=>f===day?null:day)} onMouseEnter={()=>setHoverDay(day)} onMouseLeave={()=>setHoverDay(null)} style={{textAlign:'left',padding:'10px 10px',fontSize:11,fontWeight:isToday?700:500,color:isActive||isToday?T.accent:T.text,background:isActive?T.accentLight:isHover?T.accent+'12':T.surfaceWarm,borderBottom:isToday?`2px solid ${T.accent}`:`1px solid ${T.border}`,cursor:'pointer',userSelect:'none',transition:'background 0.12s'}} title={t('week.isolateDay')}>{t('day.'+day)}<div style={{fontSize:10,fontWeight:400,color:isActive||isToday?T.accent:T.text3}}>{fmt(weekDates[i])}</div></th>);})}
          </tr></thead>
          <tbody>
            {allRoles.map(role=>{
              const anyDay=filterDays.some(day=>{const r=getBlockRoles(block,day)[role]||0,g=(schedule[day]?.[block.id]||[]).filter(a=>a.role===role).length;return r>0||g>0;});
              if(!anyDay)return null;
              const rs=roleStyles[role]||DEFAULT_ROLE_STYLES.Other;
              return(<tr key={role} style={{borderBottom:`1px solid ${T.border}`}}>
                <td style={{padding:'10px 14px',verticalAlign:'top',background:T.surface,overflow:'hidden'}}><RoleBadge role={role} rs={rs}/></td>
                {filterDays.map(day=>{
                  const allA=schedule[day]?.[block.id]||[],assigned=allA.filter(a=>a.role===role),req=getBlockRoles(block,day)[role]||0,gap=Math.max(0,req-assigned.length),isTarget=selected&&selectedRoles.includes(role)&&selected.day!==day;
                  // Hovering anywhere in a day's column (not just its header)
                  // lights up that whole column together — a subtle tint
                  // plus an inset ring, so the grid reads as a set of
                  // separate day "cards" side by side instead of one flat
                  // sheet of cells.
                  const dayHover=hoverDay===day;
                  // Today's column carries a faint tint the whole way down, so
                  // the header marker doesn't strand itself at the top of a
                  // long block. Weaker than hover on purpose: hover is a
                  // response to what you're doing right now and should win.
                  const dayIsToday=weekDates[DAYS.indexOf(day)]&&dateToISO(weekDates[DAYS.indexOf(day)])===dateToISO(now);
                  // Dropping onto empty space in this cell moves whoever is
                  // being dragged into this role/day/block. Dropping onto a
                  // person instead swaps the two (handled per-card below,
                  // which stops propagation so it doesn't also fire this).
                  const cellKey=`${day}|${block.id}|${role}`;
                  const isDropCell=!!dragSrc&&dropKey===cellKey;
                  const onCellDragOver=e=>{ if(!dragSrc)return; e.preventDefault(); e.dataTransfer.dropEffect='move'; if(dropKey!==cellKey)setDropKey(cellKey); };
                  const onCellDrop=e=>{ if(!dragSrc)return; e.preventDefault(); dropAssignment&&dropAssignment(dragSrc,{day,blockId:block.id,role}); endDrag(); };
                  return(<td key={day} onMouseEnter={()=>setHoverDay(day)} onMouseLeave={()=>setHoverDay(null)}
                    onDragOver={onCellDragOver} onDrop={onCellDrop}
                    onDragLeave={()=>{if(dropKey===cellKey)setDropKey(null);}}
                    // Hover is a plain background tint, nothing more. It used
                    // to also draw `inset 0 0 0 1px` on every cell, which
                    // outlined each one individually and read as a stray
                    // nested box rather than one highlighted column. The ring
                    // is kept ONLY for an active drop target, where a hard
                    // edge is the point.
                    style={{padding:'8px 10px',verticalAlign:'top',borderLeft:`1px solid ${T.border}`,background:isDropCell?T.accentLight:dayHover?T.surfaceWarm:dayIsToday?T.accent+'0A':T.surface,boxShadow:isDropCell?`inset 0 0 0 2px ${T.accent}`:'none',transition:'background 0.12s'}}>
                    <div style={{display:'flex',flexDirection:effectiveDay?'row':'column',flexWrap:effectiveDay?'wrap':'nowrap',gap:effectiveDay?14:3,alignItems:effectiveDay?'flex-start':'stretch'}}>
                      {assigned.map((a,idx)=>{
                        const emp=employees.find(e=>e.id===a.empId),realIdx=allA.findIndex(x=>x.empId===a.empId),isSel=selected?.empId===a.empId&&selected?.day===day&&selected?.blockId===block.id;
                        const clocked=a.noShow||a.actualStart||a.actualEnd;
                        const statusInfo=clocked?{text:a.noShow?t('emp.noShow'):`${t('week.clockedLabel')} ${a.actualStart||'—'}–${a.actualEnd||'…'}`,tone:a.noShow?'bad':'good'}:null;
                        const onClick=()=>{if(selected){handleSlotClick(day,block.id,realIdx);}else{openEditSlot(day,block.id,realIdx);}};
                        // Drag handlers live on a wrapper rather than on
                        // EmpCard itself — it renders a
                        // <button>, and a draggable button swallows the drag
                        // in some browsers. The wrapper also gives the
                        // swap-target highlight something to sit on.
                        const meKey=`${day}|${block.id}|${realIdx}`;
                        const isBeingDragged=dragSrc&&dragSrc.day===day&&dragSrc.blockId===block.id&&dragSrc.idx===realIdx;
                        const isSwapTarget=!!dragSrc&&!isBeingDragged&&dropKey===meKey;
                        // Search dim. A dragged card's own 0.35 fade wins, so
                        // the two never fight over the same property.
                        const dimmed=!matchesSearch(emp?.name||a.name);
                        const dragProps={
                          draggable:!!dropAssignment,
                          onDragStart:e=>{ setDragSrc({day,blockId:block.id,idx:realIdx,empId:a.empId}); e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain',a.empId||''); },
                          onDragEnd:endDrag,
                          onDragOver:e=>{ if(!dragSrc||isBeingDragged)return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect='move'; if(dropKey!==meKey)setDropKey(meKey); },
                          onDrop:e=>{ if(!dragSrc)return; e.preventDefault(); e.stopPropagation(); if(!isBeingDragged&&dropAssignment)dropAssignment(dragSrc,{day,blockId:block.id,role,idx:realIdx}); endDrag(); },
                          style:{opacity:isBeingDragged?0.35:(dimmed?0.22:1),filter:dimmed&&!isBeingDragged?'grayscale(1)':'none',borderRadius:9,cursor:dropAssignment?'grab':'default',boxShadow:isSwapTarget?`0 0 0 2px ${T.accent}`:'none',transition:'opacity 0.15s,filter 0.15s,box-shadow 0.12s'},
                        };
                        // Isolated-day view keeps the compact chip (it lays
                        // people out in a horizontal row, where a full-width
                        // card would look wrong); the 7-day grid uses the
                        // taller card, which has room for the shift time and
                        // clocked status inline instead of as loose text
                        // hanging under a pill.
                        // Same card either way now — the isolated-day view just
                        // uses the auto-width variant, since it lays people out
                        // across a row rather than stacked in a narrow cell.
                        // The time and clocked status live inside the card in
                        // both cases instead of as loose text hanging under it.
                        return(
                          <div key={idx} {...dragProps}>
                            <EmpCard emp={emp||{name:a.name,palIdx:0}} selected={isSel} onClick={onClick}
                              inline={!!effectiveDay}
                              title={emp?.name||a.name}
                              time={`${a.start||block.start}–${a.end||block.end}`}
                              status={statusInfo}/>
                          </div>
                        );
                      })}
                      {/* Open shifts posted for this exact slot — a shift
                          nobody holds yet that any eligible employee can
                          claim from their own app. Shown as a dashed
                          placeholder card so it reads as "not filled" at a
                          glance, with its claim state underneath. */}
                      {openShiftsFor&&openShiftsFor(day,block.id,role).map(sw=>{
                        const claimant=sw.claimedByEmpId?employees.find(e=>e.id===sw.claimedByEmpId):null;
                        // minWidth:0 on both the card and its text column, plus
                        // ellipsis on the labels, so a long claim status can
                        // never push the whole day column wider than the
                        // person cards next to it — a table cell otherwise
                        // sizes to its widest child, which made adding one
                        // open shift visibly widen that entire day.
                        return(<div key={sw.id} title={t('open.claimable')} style={{padding:'6px 8px',borderRadius:9,border:`1.5px dashed ${T.accent}77`,background:T.accentLight,display:'flex',alignItems:'center',gap:7,minWidth:0,boxSizing:'border-box'}}>
                          <span style={{width:22,height:22,borderRadius:'50%',background:T.accent+'22',color:T.accent,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,flexShrink:0}}>?</span>
                          <div style={{minWidth:0,flex:1}}>
                            <div style={{fontSize:11,fontWeight:600,color:T.accentText,lineHeight:1.25,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t('open.posted')}</div>
                            {claimant&&<div style={{fontSize:9,color:T.accentText,opacity:0.85,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t('swap.statusClaimed',{name:claimant.name})}</div>}
                          </div>
                          {cancelOpenShift&&sw.status==='open'&&<button onClick={()=>cancelOpenShift(sw)} title={t('open.cancel')} style={{background:'none',border:'none',cursor:'pointer',color:T.accentText,opacity:0.6,fontSize:12,padding:2,fontFamily:'inherit',flexShrink:0}}>✕</button>}
                        </div>);
                      })}
                      {(()=>{
                        const pickerOpen=openPicker?.day===day&&openPicker?.blockId===block.id&&openPicker?.role===role&&!selected;
                        // A centered modal, not an anchored popover — an anchored popup kept
                        // failing because the page could still scroll behind/away from it,
                        // leaving it stranded over unrelated content. A modal with a
                        // scroll-locked backdrop can't drift like that.
                        const reasonLabels={role:t('week.reasonRole',{role}),leave:t('week.reasonLeave'),working:t('week.reasonWorking'),hours:t('week.reasonHours'),rest:t('week.reasonRest'),avail:t('week.reasonAvail')};
                        const personRow=(emp,dim)=>{const p=pal(emp),rate=effectiveHourlyRate(emp);return(<button key={emp.id} onClick={()=>{addToSlot(day,block.id,role,emp);closePicker();}} style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'10px 12px',marginBottom:6,borderRadius:12,background:isDark()?T.surfaceWarm:'#fff',border:`1px solid ${T.border}`,boxShadow:isDark()?'none':'0 1px 3px -1px rgba(33,27,21,0.08)',cursor:'pointer',fontFamily:"'Hanken Grotesk',sans-serif",textAlign:'left',opacity:dim?0.75:1,transition:'border-color 0.15s,box-shadow 0.15s,transform 0.15s'}} onMouseEnter={e=>{e.currentTarget.style.borderColor=p.dot+'88';e.currentTarget.style.boxShadow=isDark()?'0 0 0 1px '+p.dot+'44':'0 4px 12px -4px rgba(33,27,21,0.18)';e.currentTarget.style.transform='translateY(-1px)';}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.boxShadow=isDark()?'none':'0 1px 3px -1px rgba(33,27,21,0.08)';e.currentTarget.style.transform='none';}}><div style={{width:32,height:32,borderRadius:'50%',background:isDark()?p.dot+'25':p.bg,color:isDark()?p.dot:p.text,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,flexShrink:0}}>{initials(emp.name)}</div><div style={{minWidth:0,flex:1}}><div style={{display:'flex',alignItems:'baseline',gap:6}}><div style={{fontSize:13,fontWeight:500,color:T.text}}>{emp.name}</div>{rate!=null&&<div style={{fontSize:11,fontWeight:600,color:T.accent,whiteSpace:'nowrap'}}>{currency} {Math.round(rate).toLocaleString(LOCALE)}/h</div>}</div><div style={{fontSize:11,color:T.text3}}>{empHours(emp.id)}h / {emp.maxHours}h</div>{(emp.roles||[]).length>0&&<div style={{display:'flex',gap:3,flexWrap:'wrap',marginTop:3}}>{(emp.roles||[]).map(r=>{const rs=roleStyles[r]||DEFAULT_ROLE_STYLES.Other;return<span key={r} style={{fontSize:9,fontWeight:600,color:isDark()?rs.dot:rs.text,background:isDark()?rs.dot+'22':rs.bg,border:`1px solid ${isDark()?rs.dot+'55':rs.border}`,padding:'1px 5px',borderRadius:999}}>{r}</span>;})}</div>}</div>{emp._reasons?.length>0&&<div style={{flexShrink:0,alignSelf:'center',display:'flex',flexDirection:'column',alignItems:'flex-end',gap:2,maxWidth:100}}>{emp._reasons.map(rc=><span key={rc} style={{fontSize:9,fontWeight:600,color:T.warning,background:T.warningLight,border:`1px solid ${T.warning}33`,padding:'2px 7px',borderRadius:999,whiteSpace:'nowrap'}}>{reasonLabels[rc]}</span>)}</div>}</button>);};
                        const picker=pickerOpen&&(()=>{
                          const{available,unavailable}=candidatesForSlot(day,block.id,role);
                          const rolesPresent=allRoles.filter(r=>available.some(e=>(e.roles||[]).includes(r))||unavailable.some(e=>(e.roles||[]).includes(r)));
                          const q=pickerSearch.trim().toLowerCase();
                          const matchesFilter=emp=>(pickerRoleFilter.length===0||(emp.roles||[]).some(r=>pickerRoleFilter.includes(r)))&&(!q||emp.name.toLowerCase().includes(q));
                          const filteredAvailable=available.filter(matchesFilter);
                          const filteredUnavailable=[...unavailable.filter(matchesFilter)].sort((a,b)=>pickerSortBy==='avail'?((a._reasons?.length||0)-(b._reasons?.length||0))||a.name.localeCompare(b.name):a.name.localeCompare(b.name));
                          const toggleRoleFilter=r=>setPickerRoleFilter(p=>p.includes(r)?p.filter(x=>x!==r):[...p,r]);
                          return createPortal(
                          <div onClick={closePicker} style={{position:'fixed',inset:0,zIndex:300,background:'rgba(20,16,13,0.5)',display:'flex',alignItems:'center',justifyContent:'center',padding:20,fontFamily:"'Hanken Grotesk',sans-serif"}}>
                            <div onClick={e=>e.stopPropagation()} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,width:'min(440px,100%)',maxHeight:'min(78vh,620px)',display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 24px 60px -16px rgba(0,0,0,0.5)'}}>
                              <div style={{fontSize:11,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em',padding:'16px 18px 10px',flexShrink:0}}>{t('week.addRoleDay',{role,day:t('day.'+day)})}</div>
                              <div style={{padding:'0 18px 10px',flexShrink:0}}>
                                <input autoFocus value={pickerSearch} onChange={e=>setPickerSearch(e.target.value)} placeholder={t('week.searchStaff')} style={{...s.input,width:'100%'}}/>
                              </div>
                              {rolesPresent.length>1&&<div style={{display:'flex',gap:4,flexWrap:'wrap',padding:'0 18px 10px',flexShrink:0}}>
                                <button onClick={()=>setPickerRoleFilter([])} style={{padding:'3px 9px',borderRadius:999,fontSize:10,fontWeight:600,border:`1px solid ${pickerRoleFilter.length===0?T.accent:T.border}`,background:pickerRoleFilter.length===0?T.accent+'15':'transparent',color:pickerRoleFilter.length===0?T.accent:T.text2,cursor:'pointer',fontFamily:'inherit'}}>{t('week.allRoles')}</button>
                                {rolesPresent.map(r=>{const rs=roleStyles[r]||DEFAULT_ROLE_STYLES.Other,active=pickerRoleFilter.includes(r);return(<button key={r} onClick={()=>toggleRoleFilter(r)} style={{padding:'3px 9px',borderRadius:999,fontSize:10,fontWeight:600,border:`1px solid ${active?rs.dot:T.border}`,background:active?(isDark()?rs.dot+'22':rs.bg):'transparent',color:active?(isDark()?rs.dot:rs.text):T.text2,cursor:'pointer',fontFamily:'inherit'}}>{r}</button>);})}
                              </div>}
                              <div style={{overflowY:'auto',padding:'0 10px',flex:1,minHeight:0}}>
                                {filteredAvailable.length===0&&filteredUnavailable.length===0?<div style={{fontSize:12,color:T.text3,padding:'10px 8px',fontStyle:'italic'}}>{t('week.noneAvailable')}</div>:<>
                                  {filteredAvailable.length===0?<div style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:T.danger,padding:'10px 8px',fontStyle:'italic'}}>{t('week.noOneAvailableForRole')}</div>:filteredAvailable.map(emp=>personRow(emp,false))}
                                  {filteredUnavailable.length>0&&<>
                                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap',padding:'10px 8px 6px',borderTop:filteredAvailable.length>0?`1px solid ${T.border}`:'none',marginTop:filteredAvailable.length>0?6:0}}>
                                      <span style={{fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.05em'}}>{t('week.allStaff')}</span>
                                      <div style={{display:'flex',background:T.surfaceWarm,border:`1px solid ${T.border}`,borderRadius:7,padding:2,gap:1}}>
                                        {[['name',t('week.sortByName')],['avail',t('week.sortByAvail')]].map(([k,l])=><button key={k} onClick={()=>setPickerSortBy(k)} style={{padding:'3px 8px',borderRadius:5,fontSize:10,fontWeight:pickerSortBy===k?600:400,background:pickerSortBy===k?T.bg:'transparent',border:pickerSortBy===k?`1px solid ${T.border}`:'1px solid transparent',color:pickerSortBy===k?T.text:T.text3,cursor:'pointer',fontFamily:'inherit'}}>{l}</button>)}
                                      </div>
                                    </div>
                                    {filteredUnavailable.map(emp=>personRow(emp,true))}
                                  </>}
                                </>}
                              </div>
                              <div style={{borderTop:`1px solid ${T.border}`,padding:12,flexShrink:0}}><Btn variant="ghost" onClick={closePicker}>{t('common.cancel')}</Btn></div>
                            </div>
                          </div>
                        ,document.body);})();
                        const blocked=selected&&!isTarget; // mid-move, but this isn't a valid destination
                        const noAvail=gap>0&&!isTarget&&candidatesForSlot(day,block.id,role).available.length===0;
                        // A slot can always be thrown open to the team, not
                        // just when it's short — a fully-staffed day might
                        // still want an extra pair of hands, and there's no
                        // reason "post an open shift" should require first
                        // creating a gap.
                        //
                        // Multiple open shifts per slot are allowed: a busy
                        // Saturday might need three more waiters, and each
                        // one is a separate thing for a separate person to
                        // claim. This used to hide the button once one
                        // existed, which capped every slot at exactly one.
                        // Only suppressed mid-move, when the whole cell means
                        // "drop here" instead.
                        const canPostOpen=postOpenShift&&!selected;
                        const openBtn=(label)=><button onClick={()=>postOpenShift(day,block.id,role)} title={t('open.post')} style={{display:'inline-flex',alignItems:'center',gap:3,padding:'4px 9px',borderRadius:9,fontSize:10,fontWeight:500,background:'transparent',color:T.accent,border:`1px dashed ${T.accent}55`,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}>{label}</button>;
                        if(gap>0)return(<div style={{position:'relative',marginLeft:effectiveDay&&assigned.length>0?'auto':0,display:'flex',flexDirection:'column',gap:3,alignItems:'flex-start'}}>
                          <button onClick={()=>{if(selected&&isTarget){handleEmptySlotClick(day,block.id,role);return;}if(!selected)openPickerFor(day,block.id,role);}} disabled={blocked} title={noAvail?t('week.noOneAvailable'):undefined} style={{display:'inline-flex',alignItems:'center',gap:3,padding:'4px 9px',borderRadius:9,fontSize:10,fontWeight:500,background:isTarget?T.successLight:T.dangerLight,color:isTarget?T.success:T.danger,border:`1px dashed ${isTarget?T.success:T.danger}55`,cursor:blocked?'default':'pointer',opacity:blocked?0.35:1,fontFamily:'inherit'}}>{isTarget?t('week.moveHere'):t('week.shortCount',{n:gap})}</button>
                          {canPostOpen&&openBtn(t('open.post'))}
                          {picker}
                        </div>);
                        return(<div style={{position:'relative',marginLeft:effectiveDay&&assigned.length>0?'auto':0,display:'flex',flexWrap:'wrap',gap:3,alignItems:'center'}}>
                          <button onClick={()=>{if(selected&&isTarget){handleEmptySlotClick(day,block.id,role);return;}if(!selected)openPickerFor(day,block.id,role);}} disabled={blocked} title={isTarget?t('week.moveHere'):t('week.addExtra')} style={{display:'inline-flex',alignItems:'center',gap:3,padding:'4px 9px',borderRadius:9,fontSize:10,fontWeight:500,lineHeight:1.6,background:isTarget?T.successLight:'transparent',color:isTarget?T.success:T.text3,border:`1px dashed ${isTarget?T.success+'55':T.border}`,cursor:blocked?'default':'pointer',opacity:blocked?0.35:1,fontFamily:'inherit',whiteSpace:'nowrap'}}>{isTarget?t('week.moveHere'):`+ ${t('common.add')}`}</button>
                          {/* Short label here — a fully-staffed cell is the
                              common case, so this button appears in most
                              cells and the full "Post as open shift" wording
                              would dominate the grid. Full text is the
                              tooltip. */}
                          {canPostOpen&&openBtn(t('open.postShort'))}
                          {picker}
                        </div>);
                      })()}
                    </div>
                  </td>);})}
              </tr>);
            })}
          </tbody>
        </table>
      </div>}
    </div>
    );})}
  <div style={s.card}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:8}}>
      <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:15,fontWeight:500}}>{t('week.weeklyHours')}</div>
      <div style={{display:'flex',background:T.surfaceWarm,border:`1px solid ${T.border}`,borderRadius:8,padding:3,gap:2}}>
        {[['name',t('grid.byName')],['role',t('grid.byRole')]].map(([k,l])=><button key={k} onClick={()=>setGridGroupBy(k)} style={{padding:'3px 10px',borderRadius:6,background:gridGroupBy===k?T.bg:'transparent',border:gridGroupBy===k?`1px solid ${T.border}`:'1px solid transparent',cursor:'pointer',fontSize:11,fontWeight:gridGroupBy===k?500:400,color:gridGroupBy===k?T.text:T.text2,fontFamily:'inherit'}}>{l}</button>)}
      </div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:10}}>
      {[...employees].sort((a,b)=>gridGroupBy==='role'?(allRoles.indexOf((a.roles||[])[0]||'')-allRoles.indexOf((b.roles||[])[0]||''))||a.name.localeCompare(b.name):a.name.localeCompare(b.name)).map(emp=>{const h=empHours(emp.id),pct=Math.min(100,(h/emp.maxHours)*100),over=h>emp.maxHours,rs=roleStyles[(emp.roles||[])[0]]||DEFAULT_ROLE_STYLES.Other,dim=!matchesSearch(emp.name);return(<div key={emp.id} style={{padding:'10px 12px',borderRadius:10,border:`1px solid ${over?T.danger+'55':T.border}`,background:over?T.dangerLight:T.surfaceWarm,opacity:dim?0.28:1,filter:dim?'grayscale(1)':'none',transition:'opacity 0.15s,filter 0.15s'}}>
        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}><Avatar emp={emp} size={24}/><span style={{fontSize:12,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{emp.name.split(' ')[0]}</span></div>
        {gridGroupBy==='role'&&(emp.roles||[])[0]&&<div style={{marginBottom:6}}><RoleBadge role={(emp.roles||[])[0]} rs={rs}/></div>}
        <div style={{fontSize:13,fontWeight:500,color:over?T.danger:T.text,marginBottom:4}}>{h}h <span style={{fontSize:11,color:T.text3,fontWeight:400}}>/ {emp.maxHours}h</span></div>
        <div style={{height:3,borderRadius:999,background:T.border,overflow:'hidden'}}><div style={{height:'100%',width:`${pct}%`,borderRadius:999,background:over?T.danger:pct>80?T.warning:T.success}}/></div>
      </div>);})}
    </div>
  </div>
</div>);
}
