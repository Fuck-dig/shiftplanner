import { useState } from 'react';
import { T } from '../../lib/constants';
import { actualAssignmentHours } from '../../lib/schedule';
import { RoleBadge, Btn } from '../ui';

// The employee-facing "punch clock" landing screen (EmployeeView's default
// tab) — shows today's shift(s) with Clock In / Clock Out controls, and,
// when nothing's scheduled today, lets the employee add themselves to one of
// today's blocks so an unplanned shift shows up on the schedule instead of
// only existing as an actual-hours correction after the fact. Clock in/out
// writes go straight to the shared assignment object (actualStart/actualEnd/
// clockNote) via EmployeeView's applyAssignmentPatch — actualAssignmentHours
// (lib/schedule.js) is what turns actualStart/actualEnd into the hours shown
// once clocked out, same helper the Costs tab and Profile page already use.
export default function PunchClockView({ me, myId, blocks, todayLabel, daySchedule, roleStyles, roleColorFor, busy, onClockIn, onClockOut, onAddShift, s, t }){
  const [addingShift, setAddingShift] = useState(false);
  const [addBlockId, setAddBlockId]   = useState('');
  const [addRole, setAddRole]         = useState('');
  const [clockingOut, setClockingOut] = useState(null); // blockId currently showing the note field, or null
  const [note, setNote]               = useState('');

  const myRoles = me?.roles || [];
  const myShifts = blocks
    .map(b => ({ block: b, assignment: (daySchedule?.[b.id]||[]).find(a=>a.empId===myId) }))
    .filter(x => x.assignment);
  const addableBlocks = blocks.filter(b => !(daySchedule?.[b.id]||[]).some(a=>a.empId===myId));

  const startAdd = () => {
    setAddingShift(true);
    setAddBlockId(addableBlocks[0]?.id || '');
    setAddRole(myRoles[0] || '');
  };
  const submitAdd = () => {
    if (!addBlockId || !addRole) return;
    onAddShift(addBlockId, addRole);
    setAddingShift(false);
  };

  const startClockOut  = (blockId) => { setClockingOut(blockId); setNote(''); };
  const submitClockOut = (blockId) => { onClockOut(blockId, note); setClockingOut(null); setNote(''); };

  return (
    <div style={{maxWidth:560,margin:'0 auto'}}>
      <div style={{marginBottom:16}}>
        <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:22,fontWeight:500,color:T.text}}>{t('clock.title')}</div>
        <div style={{fontSize:13,color:T.text3,marginTop:2}}>{todayLabel}</div>
      </div>

      {myShifts.length===0 && !addingShift && (
        <div style={{...s.card,textAlign:'center',padding:'36px 24px'}}>
          <div style={{fontSize:14,color:T.text2,marginBottom:16}}>{t('clock.noShiftToday')}</div>
          {addableBlocks.length>0 && myRoles.length>0
            ? <Btn onClick={startAdd}>{t('clock.addShift')}</Btn>
            : <div style={{fontSize:12,color:T.text3}}>{t('clock.noAddableShift')}</div>}
        </div>
      )}

      {addingShift && (
        <div style={{...s.card,marginBottom:14}}>
          <div style={{fontSize:13,fontWeight:600,color:T.text,marginBottom:12}}>{t('clock.addShift')}</div>
          <div style={{marginBottom:10}}>
            <div style={{fontSize:11,color:T.text3,marginBottom:4}}>{t('clock.selectBlock')}</div>
            <select value={addBlockId} onChange={e=>setAddBlockId(e.target.value)} style={s.select}>
              {addableBlocks.map(b=><option key={b.id} value={b.id}>{b.name} · {b.start}–{b.end}</option>)}
            </select>
          </div>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,color:T.text3,marginBottom:4}}>{t('clock.selectRole')}</div>
            <select value={addRole} onChange={e=>setAddRole(e.target.value)} style={s.select}>
              {myRoles.map(r=><option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div style={{display:'flex',gap:8}}>
            <Btn onClick={submitAdd} disabled={busy || !addBlockId || !addRole}>{t('clock.confirmAdd')}</Btn>
            <Btn variant="ghost" onClick={()=>setAddingShift(false)}>{t('common.cancel')}</Btn>
          </div>
        </div>
      )}

      {myShifts.map(({block,assignment}) => {
        const hrs = actualAssignmentHours(assignment, block);
        const startTime = assignment.start || block.start, endTime = assignment.end || block.end;
        return (
          <div key={block.id} style={{...s.card,marginBottom:12}}>
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:10,marginBottom:10}}>
              <div>
                <div style={{fontSize:15,fontWeight:600,color:T.text}}>{block.name}</div>
                <div style={{fontSize:12,color:T.text3,marginTop:2}}>{startTime}–{endTime}</div>
              </div>
              {assignment.role && <RoleBadge role={assignment.role} rs={roleStyles[assignment.role]||roleColorFor(assignment.role)}/>}
            </div>
            {assignment.selfAdded && <div style={{fontSize:11,color:T.accentText,marginBottom:8}}>{t('clock.selfAddedTag')}</div>}

            {assignment.noShow ? (
              <div style={{fontSize:12,color:T.text3}}>{t('clock.noShowNotice')}</div>
            ) : !assignment.actualStart ? (
              <Btn onClick={()=>onClockIn(block.id)} disabled={busy}>{t('clock.clockIn')}</Btn>
            ) : !assignment.actualEnd ? (
              <div>
                <div style={{fontSize:12,color:T.success,marginBottom:8}}>{t('clock.clockedInAt',{time:assignment.actualStart})}</div>
                {clockingOut===block.id ? (<>
                  <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder={t('clock.notePlaceholder')} rows={2} style={{...s.input,resize:'vertical',marginBottom:10}}/>
                  <div style={{display:'flex',gap:8}}>
                    <Btn onClick={()=>submitClockOut(block.id)} disabled={busy}>{t('clock.confirmClockOut')}</Btn>
                    <Btn variant="ghost" onClick={()=>setClockingOut(null)}>{t('common.cancel')}</Btn>
                  </div>
                </>) : (
                  <Btn variant="secondary" onClick={()=>startClockOut(block.id)} disabled={busy}>{t('clock.clockOut')}</Btn>
                )}
              </div>
            ) : (
              <div>
                <div style={{fontSize:12,color:T.text2}}>{t('clock.clockedOutAt',{time:assignment.actualEnd,h:hrs.toFixed(1)})}</div>
                {assignment.clockNote && <div style={{fontSize:12,color:T.text3,marginTop:6,fontStyle:'italic'}}>&ldquo;{assignment.clockNote}&rdquo;</div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
