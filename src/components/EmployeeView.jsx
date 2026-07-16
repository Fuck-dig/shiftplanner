import { useState, useEffect } from 'react';
import { T, styles, DAYS, pal, initials, isDark } from '../lib/constants';
import { getWeekDates, weekKey, fmt, dateToISO, todayISO } from '../lib/dates';
import { blockHours, isOnTimeOff } from '../lib/schedule';
import { fetchEmployees, fetchBlocks, fetchSchedules, fetchTimeOff } from '../lib/data';
import { supabase } from '../lib/supabase';

function LoadingScreen(){
  return <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:T.bg,color:T.text3,fontFamily:"'Hanken Grotesk',sans-serif",fontSize:26}}><span style={{fontFamily:'Fraunces, Georgia, serif',opacity:0.5}}>Rorota</span></div>;
}

export default function EmployeeView({ orgId, orgName, theme, toggleTheme }){
  const [loading, setLoading]     = useState(true);
  const [employees, setEmployees] = useState([]);
  const [blocks, setBlocks]       = useState([]);
  const [schedules, setSchedules] = useState({});
  const [timeOff, setTimeOff]     = useState([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [myId, setMyId]           = useState(null); // current user's employee record id

  useEffect(()=>{
    let alive = true;
    // Get current user's email to match to employee record
    supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      const email = data?.user?.email;
      // Load all data
      Promise.all([
        fetchEmployees(orgId),
        fetchBlocks(orgId),
        fetchTimeOff(orgId),
        fetchSchedules(orgId),
      ]).then(([emps, blks, to, scheds]) => {
        if (!alive) return;
        setEmployees(emps);
        setBlocks(blks);
        setTimeOff(to);
        setSchedules(scheds);
        // Try to find the current user's employee record by email
        const me = emps.find(e => e.email && e.email.toLowerCase() === (email||'').toLowerCase());
        if (me) setMyId(me.id);
        setLoading(false);
      }).catch(err => { console.error(err); if(alive) setLoading(false); });
    });
    return () => { alive = false; };
  }, [orgId]);

  // Re-inject global styles when theme changes
  useEffect(()=>{
    const s = document.createElement('style');
    s.textContent = `html,body,#root{width:100%;margin:0;padding:0}*{box-sizing:border-box}body{background:${T.bg};-webkit-font-smoothing:antialiased}input,select{font-family:'Hanken Grotesk',sans-serif!important}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-thumb{background:${T.border};border-radius:3px}`;
    document.head.appendChild(s);
    document.body.style.background = T.bg;
    return () => { try{ document.head.removeChild(s); }catch{} };
  }, [theme]);

  if (loading) return <LoadingScreen/>;

  const weekDates  = getWeekDates(weekOffset);
  const wKey       = weekKey(weekOffset);
  const schedule   = schedules[wKey]?.schedule || null;
  const s          = styles;

  const empHoursMap = employees.reduce((acc, e) => {
    if (!schedule) { acc[e.id] = 0; return acc; }
    let h = 0;
    DAYS.forEach(day => blocks.forEach(b => {
      if ((schedule[day]?.[b.id]||[]).some(a => a.empId === e.id)) h += blockHours(b);
    }));
    acc[e.id] = h; return acc;
  }, {});

  return (
    <div style={{minHeight:'100vh',width:'100%',background:T.bg,fontFamily:"'Hanken Grotesk',sans-serif",color:T.text,fontSize:13}}>
      {/* Nav */}
      <div style={{background:T.surface,borderBottom:`1px solid ${T.border}`,padding:'0 24px',display:'flex',alignItems:'center',height:56,position:'sticky',top:0,zIndex:100,boxShadow:'0 2px 14px -8px rgba(33,27,21,0.15)'}}>
        <div style={{display:'flex',alignItems:'baseline',gap:9,flex:1}}>
          <span style={{fontFamily:'Fraunces, Georgia, serif',fontSize:21,fontWeight:600,color:T.text,letterSpacing:'-0.02em'}}>Rorota</span>
          <span style={{fontSize:11,color:T.text3,fontWeight:500,letterSpacing:'0.03em',textTransform:'uppercase'}}>{orgName}</span>
        </div>
        <button onClick={toggleTheme} style={{width:34,height:34,marginRight:10,borderRadius:8,border:`1px solid ${T.border}`,background:T.surface,color:T.text2,cursor:'pointer',fontSize:15,display:'flex',alignItems:'center',justifyContent:'center'}}>{isDark()?'☀':'☾'}</button>
        <button onClick={()=>supabase.auth.signOut()} style={{padding:'6px 14px',borderRadius:8,border:`1px solid ${T.border}`,background:T.surface,color:T.text2,cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>Log out</button>
      </div>

      <div style={{padding:'24px 28px'}}>
        {/* Week nav */}
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:20,flexWrap:'wrap'}}>
          <div style={{display:'flex',alignItems:'center',gap:4,background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:3}}>
            <button onClick={()=>setWeekOffset(w=>w-1)} style={{padding:'4px 12px',borderRadius:6,background:'none',border:'none',cursor:'pointer',color:T.text2,fontFamily:'inherit',fontSize:14}}>‹</button>
            <span style={{fontSize:14,fontWeight:500,minWidth:160,textAlign:'center',color:T.text,padding:'0 4px'}}>{fmt(weekDates[0])} – {fmt(weekDates[6])}</span>
            <button onClick={()=>setWeekOffset(w=>w+1)} style={{padding:'4px 12px',borderRadius:6,background:'none',border:'none',cursor:'pointer',color:T.text2,fontFamily:'inherit',fontSize:14}}>›</button>
          </div>
          <button onClick={()=>setWeekOffset(0)} style={{padding:'5px 12px',borderRadius:8,background:T.surface,border:`1px solid ${T.border}`,cursor:'pointer',fontSize:12,color:T.text2,fontFamily:'inherit'}}>Today</button>
          {schedules[wKey]?.confirmed && <span style={{fontSize:12,color:T.success,fontWeight:500,background:T.successLight,padding:'2px 10px',borderRadius:999,border:`1px solid ${T.success}33`}}>✓ Published</span>}
        </div>

        {!schedule ? (
          <div style={{...s.card,textAlign:'center',padding:'52px 32px',position:'relative',overflow:'hidden'}}>
            <div style={{position:'absolute',inset:0,backgroundImage:`radial-gradient(circle, ${T.border} 1px, transparent 1px)`,backgroundSize:'24px 24px',opacity:0.5,pointerEvents:'none'}}/>
            <div style={{position:'relative'}}>
              <div style={{fontSize:36,marginBottom:12,opacity:0.25}}>📅</div>
              <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:22,fontWeight:500,color:T.text,marginBottom:8}}>No schedule yet</div>
              <div style={{fontSize:13,color:T.text2}}>The manager hasn't published a rota for this week yet. Check back soon.</div>
            </div>
          </div>
        ) : (
          <div style={{...s.cardFlush,overflowX:'auto'}}>
            {/* Header */}
            <div style={{display:'grid',gridTemplateColumns:'180px repeat(7,1fr)',minWidth:700,borderBottom:`2px solid ${T.border}`,background:T.surfaceWarm}}>
              <div style={{padding:'14px 20px',fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.08em',borderRight:`1px solid ${T.border}`}}>Team</div>
              {DAYS.map((day,i)=>{
                const date=weekDates[i],isToday=dateToISO(date)===dateToISO(new Date());
                return(<div key={day} style={{padding:'14px 12px',textAlign:'center',borderRight:i<6?`1px solid ${T.border}`:'none',background:isToday?`linear-gradient(90deg, transparent, ${T.accentLight}, transparent)`:'transparent'}}>
                  <div style={{fontSize:13,fontWeight:600,color:isToday?T.accent:T.text}}>{day}</div>
                  <div style={{fontSize:11,color:isToday?T.accent:T.text3,marginTop:1}}>{date.getDate()} {date.toLocaleDateString('en-GB',{month:'short'})}</div>
                </div>);
              })}
            </div>
            {/* Employee rows */}
            {employees.map((emp,ri)=>{
              const p=pal(emp),isMe=emp.id===myId,h=empHoursMap[emp.id]||0;
              return(
                <div key={emp.id} style={{display:'grid',gridTemplateColumns:'180px repeat(7,1fr)',minWidth:700,borderBottom:`1px solid ${T.border}`,background:isMe?(isDark()?T.accent+'18':T.accentLight):ri%2===1?T.surfaceWarm:T.surface,transition:'background 0.2s'}}>
                  {/* Name */}
                  <div style={{padding:'12px 16px',borderRight:`1px solid ${T.border}`,display:'flex',alignItems:'center',gap:10,minHeight:72,position:'relative'}}>
                    {isMe&&<div style={{position:'absolute',left:0,top:0,bottom:0,width:3,background:T.accent,borderRadius:'0 2px 2px 0'}}/>}
                    <div style={{width:36,height:36,borderRadius:'50%',background:isMe?T.accent:(isDark()?p.dot+'25':p.bg),color:isMe?'#fff':(isDark()?p.dot:p.text),display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,flexShrink:0,border:isMe?'none':`2px solid ${p.dot}33`}}>{initials(emp.name)}</div>
                    <div>
                      <div style={{fontSize:13,fontWeight:isMe?700:500,color:isMe?T.accent:T.text}}>{emp.name}{isMe&&<span style={{fontSize:10,marginLeft:5,color:T.accent,fontWeight:400}}>(you)</span>}</div>
                      <div style={{fontSize:10,color:T.text3,marginTop:1}}>{h}h this week</div>
                    </div>
                  </div>
                  {/* Days */}
                  {DAYS.map((day,di)=>{
                    const date=weekDates[di],onTO=isOnTimeOff(emp.id,date,timeOff);
                    const assignedBlocks=blocks.filter(b=>(schedule[day]?.[b.id]||[]).some(a=>a.empId===emp.id));
                    const isToday=dateToISO(date)===dateToISO(new Date());
                    return(<div key={day} style={{padding:'8px 7px',borderRight:di<6?`1px solid ${T.border}`:'none',display:'flex',flexDirection:'column',gap:4,justifyContent:'center',minHeight:72,background:isToday?`linear-gradient(90deg, transparent, ${T.accentLight}, transparent)`:'transparent'}}>
                      {onTO?(
                        <div style={{padding:'7px 9px',borderRadius:7,background:T.warningLight,border:`1px solid ${T.warning}44`,textAlign:'center'}}>
                          <div style={{fontSize:13}}>🌴</div>
                          <div style={{fontSize:10,fontWeight:500,color:T.warning,marginTop:1}}>Leave</div>
                        </div>
                      ):assignedBlocks.length>0?assignedBlocks.map(b=>(
                        <div key={b.id} style={{padding:'8px 10px',borderRadius:8,background:isMe?(isDark()?T.accent+'33':T.accentLight):isDark()?p.dot+'25':p.bg,border:`2px solid ${isMe?T.accent:p.dot}55`,position:'relative'}}>
                          <div style={{position:'absolute',top:6,right:6,width:6,height:6,borderRadius:'50%',background:isMe?T.accent:p.dot}}/>
                          <div style={{fontSize:13,fontWeight:700,color:isMe?T.accent:isDark()?p.dot:p.text}}>{b.name}</div>
                          <div style={{fontSize:11,color:isMe?T.accentText:isDark()?p.dot+'CC':p.text,opacity:0.85,marginTop:2}}>{b.start}–{b.end}</div>
                          <div style={{fontSize:10,color:isMe?T.accentText:isDark()?p.dot+'88':p.text,opacity:0.65,marginTop:1}}>{blockHours(b).toFixed(1)}h</div>
                        </div>
                      )):(
                        <div style={{height:46,borderRadius:7,border:`1.5px dashed ${T.border}`,display:'flex',alignItems:'center',justifyContent:'center',opacity:0.3}}>
                          <span style={{fontSize:16,color:T.text3}}>—</span>
                        </div>
                      )}
                    </div>);
                  })}
                </div>
              );
            })}
            {/* Footer */}
            <div style={{display:'grid',gridTemplateColumns:'180px repeat(7,1fr)',minWidth:700,background:T.surfaceWarm,borderTop:`2px solid ${T.border}`}}>
              <div style={{padding:'10px 20px',fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em',borderRight:`1px solid ${T.border}`,display:'flex',alignItems:'center'}}>Total</div>
              {DAYS.map((day,di)=>{
                const count=[...new Set(blocks.flatMap(b=>(schedule[day]?.[b.id]||[]).map(a=>a.empId)))].length;
                const onLeave=employees.filter(e=>isOnTimeOff(e.id,weekDates[di],timeOff)).length;
                return(<div key={day} style={{padding:'10px 12px',textAlign:'center',borderRight:di<6?`1px solid ${T.border}`:'none'}}>
                  <div style={{fontSize:15,fontWeight:700,color:count===0?T.text3:T.text}}>{count}</div>
                  <div style={{fontSize:10,color:T.text3}}>working</div>
                  {onLeave>0&&<div style={{fontSize:10,color:T.warning,marginTop:2}}>🌴 {onLeave}</div>}
                </div>);
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
