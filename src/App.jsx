import { useState } from "react";

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

const colorMap = {
  blue:   { bg:'#E6F1FB', text:'#185FA5', border:'#B5D4F4' },
  teal:   { bg:'#E1F5EE', text:'#0F6E56', border:'#9FE1CB' },
  coral:  { bg:'#FAECE7', text:'#993C1D', border:'#F5C4B3' },
  purple: { bg:'#EEEDFE', text:'#534AB7', border:'#CECBF6' },
  amber:  { bg:'#FAEEDA', text:'#854F0B', border:'#FAC775' },
  green:  { bg:'#EAF3DE', text:'#3B6D11', border:'#C0DD97' },
  pink:   { bg:'#FBEAF0', text:'#993556', border:'#F4C0D1' },
};
const COLORS = ['blue','teal','coral','purple','amber','green','pink'];

const initShifts = [
  { id:'morning',   name:'Morning',   start:'07:00', end:'13:00', required:2 },
  { id:'afternoon', name:'Afternoon', start:'13:00', end:'19:00', required:2 },
  { id:'evening',   name:'Evening',   start:'19:00', end:'23:00', required:1 },
];

const initEmployees = [
  {
    id:'1', name:'Anna Jensen', role:'Manager', salaryPct:100, color:'blue',
    availability:{ Mon:['morning','afternoon'], Tue:['morning','afternoon'], Wed:['morning'], Thu:['afternoon','evening'], Fri:['morning','afternoon'], Sat:[], Sun:[] },
    offDays:[]
  },
  {
    id:'2', name:'Lars Nielsen', role:'Full-time', salaryPct:80, color:'teal',
    availability:{ Mon:['afternoon','evening'], Tue:['afternoon'], Wed:['afternoon','evening'], Thu:['morning','afternoon'], Fri:['evening'], Sat:['morning','afternoon'], Sun:['morning'] },
    offDays:[]
  },
  {
    id:'3', name:'Mia Sørensen', role:'Part-time', salaryPct:50, color:'coral',
    availability:{ Mon:['morning'], Tue:['morning','afternoon'], Wed:[], Thu:[], Fri:['morning','afternoon'], Sat:['afternoon','evening'], Sun:['afternoon'] },
    offDays:[]
  },
];

function getWeekDates(offset=0) {
  const now = new Date('2026-05-11');
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + (day===0 ? -6 : 1) + offset*7);
  return DAYS.map((_,i) => { const d=new Date(monday); d.setDate(monday.getDate()+i); return d; });
}

function fmt(d) {
  return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
}

export default function App() {
  const [view,         setView]         = useState('schedule');
  const [employees,    setEmployees]    = useState(initEmployees);
  const [shifts,       setShifts]       = useState(initShifts);
  const [schedule,     setSchedule]     = useState(null);
  const [generating,   setGenerating]   = useState(false);
  const [aiNotes,      setAiNotes]      = useState('');
  const [weekOffset,   setWeekOffset]   = useState(0);
  const [expandedEmp,  setExpandedEmp]  = useState(null);
  const [showAddEmp,   setShowAddEmp]   = useState(false);
  const [newEmp,       setNewEmp]       = useState({name:'',role:'',salaryPct:100});

  const weekDates = getWeekDates(weekOffset);

  const generate = async () => {
    setGenerating(true); setAiNotes('');
    try {
      const weekStr = weekDates.map((d,i)=>`${DAYS[i]} ${fmt(d)}`).join(', ');
      const prompt = `You are a shift scheduling assistant. Generate an optimal weekly shift plan.

EMPLOYEES:
${employees.map(e=>`${e.name} (${e.role}, ${e.salaryPct}% salary)\n  Availability: ${DAYS.map(d=>`${d}=[${(e.availability[d]||[]).join(',')}]`).join(' ')}\n  Off days: ${e.offDays.join(',')||'none'}`).join('\n\n')}

SHIFT TYPES (id: name start-end, needN staff):
${shifts.map(s=>`${s.id}: ${s.name} ${s.start}-${s.end}, need ${s.required} staff`).join('\n')}

WEEK: ${weekStr}

RULES:
1. Only assign employee to a shift if that shift's id appears in their availability for that day
2. Respect off days
3. One shift per employee per day
4. Max 5 shifts per employee per week
5. Try to meet required staff counts; prefer lower salary% employees when coverage is met
6. Return ONLY valid JSON (no markdown, no explanation outside JSON):
{"schedule":{"Mon":{"morning":["Full Name"],"afternoon":[],"evening":[]},"Tue":{...},"Wed":{...},"Thu":{...},"Fri":{...},"Sat":{...},"Sun":{...}},"notes":"2 sentences about coverage and cost","costLevel":"low|medium|high"}`;

      const res = await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "x-api-key":"sk-ant-YOUR_KEY_HERE",
          "anthropic-version":"2023-06-01",
          "anthropic-dangerous-direct-browser-access":"true"
        },
        body:JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:1200, messages:[{role:"user",content:prompt}] })
      });
      const data = await res.json();
      const txt  = data.content.filter(c=>c.type==='text').map(c=>c.text).join('');
      const parsed = JSON.parse(txt.replace(/```json|```/g,'').trim());
      setSchedule(parsed.schedule);
      setAiNotes(parsed.notes||'');
    } catch(e) {
      setAiNotes('Could not generate schedule — please try again.');
    }
    setGenerating(false);
  };

  const toggleAvail = (empId,day,shiftId) =>
    setEmployees(prev=>prev.map(e=>{
      if(e.id!==empId) return e;
      const cur=e.availability[day]||[];
      const upd=cur.includes(shiftId)?cur.filter(s=>s!==shiftId):[...cur,shiftId];
      return {...e,availability:{...e.availability,[day]:upd}};
    }));

  const updateEmp = (id,field,val) =>
    setEmployees(prev=>prev.map(e=>e.id===id?{...e,[field]:val}:e));

  const removeEmp = id => { setEmployees(p=>p.filter(e=>e.id!==id)); if(expandedEmp===id) setExpandedEmp(null); };

  const addEmployee = () => {
    if(!newEmp.name.trim()) return;
    setEmployees(prev=>[...prev,{
      ...newEmp, id:String(Date.now()),
      color:COLORS[prev.length%COLORS.length],
      availability:Object.fromEntries(DAYS.map(d=>[d,[]])),
      offDays:[]
    }]);
    setNewEmp({name:'',role:'',salaryPct:100}); setShowAddEmp(false);
  };

  const empByName = name => employees.find(e=>e.name===name);

  const scheduleStats = () => {
    if(!schedule) return null;
    let total=0, gaps=0;
    DAYS.forEach(d=>shifts.forEach(s=>{
      const a=(schedule[d]?.[s.id]||[]).length;
      total+=a; if(a<s.required) gaps+=(s.required-a);
    }));
    return {total,gaps};
  };

  // ─── style helpers ────────────────────────────────────────────────────────
  const card   = {background:'var(--color-background-primary)',border:'0.5px solid var(--color-border-tertiary)',borderRadius:'var(--border-radius-lg)',padding:'16px'};
  const pill   = active=>({padding:'6px 14px',borderRadius:'var(--border-radius-md)',fontSize:'13px',fontWeight:active?'500':'400',background:active?'var(--color-background-secondary)':'transparent',border:active?'0.5px solid var(--color-border-secondary)':'0.5px solid transparent',cursor:'pointer',color:active?'var(--color-text-primary)':'var(--color-text-secondary)'});
  const badge  = color=>({display:'inline-block',padding:'2px 8px',borderRadius:'999px',fontSize:'12px',fontWeight:'500',background:colorMap[color]?.bg||'#eee',color:colorMap[color]?.text||'#555',border:`0.5px solid ${colorMap[color]?.border||'#ccc'}`});
  const genBtn = {padding:'7px 18px',borderRadius:'var(--border-radius-md)',fontSize:'13px',fontWeight:'500',cursor:generating?'wait':'pointer',background:'var(--color-text-primary)',color:'var(--color-background-primary)',border:'none',opacity:generating?0.65:1};
  const label  = {fontSize:'11px',color:'var(--color-text-tertiary)',marginBottom:'4px',textTransform:'uppercase',letterSpacing:'0.06em'};

  const stats  = scheduleStats();

  return (
    <div style={{fontFamily:'var(--font-sans)',color:'var(--color-text-primary)'}}>
      <h2 className="sr-only">ShiftAI — AI-powered employee shift planner</h2>

      {/* ── Top Bar ── */}
      <div style={{display:'flex',alignItems:'center',gap:'10px',paddingBottom:'14px',borderBottom:'0.5px solid var(--color-border-tertiary)',marginBottom:'16px'}}>
        <div style={{flex:1}}>
          <span style={{fontWeight:'500',fontSize:'15px'}}>ShiftAI</span>
          <span style={{fontSize:'12px',color:'var(--color-text-tertiary)',marginLeft:'8px'}}>AI shift planner</span>
        </div>
        <div style={{display:'flex',gap:'3px'}}>
          {[{k:'schedule',l:'Schedule'},{k:'employees',l:'Employees'},{k:'shifts',l:'Shifts'}].map(({k,l})=>(
            <button key={k} onClick={()=>setView(k)} style={pill(view===k)}>{l}</button>
          ))}
        </div>
        <button onClick={generate} disabled={generating} style={genBtn}>
          {generating?'Generating…':'✦ Generate'}
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SCHEDULE VIEW
      ══════════════════════════════════════════════════════════════════════ */}
      {view==='schedule' && (
        <div>
          {/* Week nav */}
          <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'14px'}}>
            <button onClick={()=>setWeekOffset(w=>w-1)} style={pill(false)}>←</button>
            <span style={{fontSize:'14px',fontWeight:'500',minWidth:'140px',textAlign:'center'}}>
              {fmt(weekDates[0])} – {fmt(weekDates[6])}
            </span>
            <button onClick={()=>setWeekOffset(w=>w+1)} style={pill(false)}>→</button>
            <button onClick={()=>setWeekOffset(0)} style={{...pill(false),fontSize:'12px',color:'var(--color-text-tertiary)'}}>This week</button>
            {stats && (
              <div style={{marginLeft:'auto',display:'flex',gap:'10px'}}>
                <span style={{fontSize:'12px',color:'var(--color-text-secondary)'}}>{stats.total} shifts assigned</span>
                {stats.gaps>0 && <span style={{fontSize:'12px',color:'#A32D2D',fontWeight:'500'}}>{stats.gaps} coverage gaps</span>}
                {stats.gaps===0 && <span style={{fontSize:'12px',color:'#3B6D11',fontWeight:'500'}}>Full coverage ✓</span>}
              </div>
            )}
          </div>

          {/* AI notes */}
          {aiNotes && (
            <div style={{...card,marginBottom:'12px',background:'var(--color-background-secondary)',fontSize:'13px',color:'var(--color-text-secondary)',display:'flex',gap:'8px',padding:'12px 14px'}}>
              <span aria-hidden="true">💡</span><span>{aiNotes}</span>
            </div>
          )}

          {/* Empty state */}
          {!schedule ? (
            <div style={{...card,textAlign:'center',padding:'52px 24px'}}>
              <div style={{fontSize:'36px',marginBottom:'12px',opacity:0.4}}>📅</div>
              <div style={{fontSize:'15px',fontWeight:'500',marginBottom:'8px'}}>No schedule yet</div>
              <div style={{fontSize:'13px',color:'var(--color-text-secondary)',marginBottom:'20px',maxWidth:'340px',margin:'0 auto 20px'}}>
                Configure your employees, their availability, and shift types — then click Generate to let AI create an optimized schedule.
              </div>
              <button onClick={generate} disabled={generating} style={genBtn}>
                {generating?'Generating…':'✦ Generate schedule with AI'}
              </button>
            </div>
          ) : (
            <>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',tableLayout:'fixed',minWidth:'560px'}}>
                  <thead>
                    <tr>
                      <th style={{width:'80px',textAlign:'left',fontSize:'10px',color:'var(--color-text-tertiary)',fontWeight:'400',padding:'0 8px 10px 0',textTransform:'uppercase',letterSpacing:'0.06em'}}>Shift</th>
                      {DAYS.map((day,i)=>(
                        <th key={day} style={{textAlign:'left',padding:'0 4px 10px',fontSize:'12px',fontWeight:'500'}}>
                          <div style={{color:'var(--color-text-primary)'}}>{day}</div>
                          <div style={{fontSize:'10px',fontWeight:'400',color:'var(--color-text-tertiary)'}}>{fmt(weekDates[i])}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shifts.map(shift=>(
                      <tr key={shift.id}>
                        <td style={{padding:'10px 8px 10px 0',verticalAlign:'top',borderTop:'0.5px solid var(--color-border-tertiary)'}}>
                          <div style={{fontSize:'12px',fontWeight:'500'}}>{shift.name}</div>
                          <div style={{fontSize:'10px',color:'var(--color-text-tertiary)',marginTop:'1px'}}>{shift.start}–{shift.end}</div>
                          <div style={{fontSize:'10px',color:'var(--color-text-tertiary)'}}>≥{shift.required} staff</div>
                        </td>
                        {DAYS.map(day=>{
                          const assigned = schedule[day]?.[shift.id]||[];
                          const gap = Math.max(0, shift.required-assigned.length);
                          return (
                            <td key={day} style={{padding:'10px 4px',verticalAlign:'top',borderTop:'0.5px solid var(--color-border-tertiary)'}}>
                              <div style={{display:'flex',flexDirection:'column',gap:'3px'}}>
                                {assigned.map(name=>{
                                  const emp=empByName(name);
                                  return <span key={name} style={badge(emp?.color||'gray')}>{name.split(' ')[0]}</span>;
                                })}
                                {gap>0 && <span style={{fontSize:'10px',color:'#A32D2D',fontWeight:'500'}}>−{gap} short</span>}
                                {assigned.length===0 && gap===0 && <span style={{fontSize:'11px',color:'var(--color-text-tertiary)'}}>—</span>}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Team legend */}
              <div style={{marginTop:'14px',paddingTop:'12px',borderTop:'0.5px solid var(--color-border-tertiary)',display:'flex',gap:'6px',flexWrap:'wrap',alignItems:'center'}}>
                <span style={{fontSize:'10px',color:'var(--color-text-tertiary)',textTransform:'uppercase',letterSpacing:'0.06em',marginRight:'2px'}}>Team</span>
                {employees.map(e=>(
                  <span key={e.id} style={badge(e.color)}>{e.name} · {e.salaryPct}%</span>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          EMPLOYEES VIEW
      ══════════════════════════════════════════════════════════════════════ */}
      {view==='employees' && (
        <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>

          {employees.map(emp=>(
            <div key={emp.id} style={card}>
              {/* Employee row */}
              <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                <div style={{width:'36px',height:'36px',borderRadius:'50%',background:colorMap[emp.color]?.bg,color:colorMap[emp.color]?.text,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',fontWeight:'500',flexShrink:0}}>
                  {emp.name.split(' ').map(n=>n[0]).join('')}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:'14px',fontWeight:'500'}}>{emp.name}</div>
                  <div style={{fontSize:'12px',color:'var(--color-text-secondary)'}}>{emp.role} · {emp.salaryPct}% salary</div>
                </div>
                <button onClick={()=>setExpandedEmp(expandedEmp===emp.id?null:emp.id)} style={pill(expandedEmp===emp.id)}>
                  {expandedEmp===emp.id?'Collapse':'Edit'}
                </button>
                <button onClick={()=>removeEmp(emp.id)} style={{...pill(false),color:'#A32D2D',fontSize:'13px'}}>✕</button>
              </div>

              {/* Expanded editor */}
              {expandedEmp===emp.id && (
                <div style={{marginTop:'16px',paddingTop:'16px',borderTop:'0.5px solid var(--color-border-tertiary)'}}>
                  {/* Fields */}
                  <div style={{display:'flex',gap:'8px',marginBottom:'16px',flexWrap:'wrap'}}>
                    <div style={{flex:'2 1 120px'}}>
                      <div style={label}>Name</div>
                      <input value={emp.name} onChange={e=>updateEmp(emp.id,'name',e.target.value)} style={{width:'100%',boxSizing:'border-box'}} />
                    </div>
                    <div style={{flex:'2 1 100px'}}>
                      <div style={label}>Role</div>
                      <input value={emp.role} onChange={e=>updateEmp(emp.id,'role',e.target.value)} style={{width:'100%',boxSizing:'border-box'}} />
                    </div>
                    <div style={{flex:'1 1 70px'}}>
                      <div style={label}>Salary %</div>
                      <input type="number" min="10" max="200" step="5" value={emp.salaryPct} onChange={e=>updateEmp(emp.id,'salaryPct',Number(e.target.value))} style={{width:'100%',boxSizing:'border-box'}} />
                    </div>
                  </div>

                  {/* Availability grid */}
                  <div style={label}>Availability — click to toggle</div>
                  <div style={{overflowX:'auto',marginTop:'6px'}}>
                    <table style={{borderCollapse:'collapse',minWidth:'400px'}}>
                      <thead>
                        <tr>
                          <th style={{width:'90px',textAlign:'left',fontSize:'11px',color:'var(--color-text-tertiary)',fontWeight:'400',padding:'0 8px 8px 0'}}></th>
                          {DAYS.map(d=>(
                            <th key={d} style={{fontSize:'11px',fontWeight:'500',color:'var(--color-text-secondary)',padding:'0 6px 8px',textAlign:'center'}}>{d}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {shifts.map(shift=>(
                          <tr key={shift.id}>
                            <td style={{fontSize:'12px',color:'var(--color-text-secondary)',padding:'3px 8px 3px 0',verticalAlign:'middle'}}>
                              {shift.name}
                              <div style={{fontSize:'10px',color:'var(--color-text-tertiary)'}}>{shift.start}–{shift.end}</div>
                            </td>
                            {DAYS.map(day=>{
                              const active=(emp.availability[day]||[]).includes(shift.id);
                              return (
                                <td key={day} style={{padding:'3px 6px',textAlign:'center'}}>
                                  <button
                                    onClick={()=>toggleAvail(emp.id,day,shift.id)}
                                    aria-label={`${active?'Remove':'Add'} ${shift.name} on ${day}`}
                                    style={{width:'30px',height:'30px',borderRadius:'var(--border-radius-md)',border:active?`1.5px solid ${colorMap[emp.color]?.border}`:'0.5px solid var(--color-border-tertiary)',background:active?colorMap[emp.color]?.bg:'transparent',cursor:'pointer',fontSize:'13px',color:active?colorMap[emp.color]?.text:'var(--color-text-tertiary)'}}
                                  >
                                    {active?'✓':''}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Off days */}
                  <div style={{marginTop:'14px'}}>
                    <div style={label}>Off days (dates this week)</div>
                    <div style={{display:'flex',gap:'6px',flexWrap:'wrap',marginTop:'6px'}}>
                      {weekDates.map((d,i)=>{
                        const ds=fmt(d);
                        const isOff=emp.offDays.includes(ds);
                        return (
                          <button key={ds}
                            onClick={()=>updateEmp(emp.id,'offDays',isOff?emp.offDays.filter(x=>x!==ds):[...emp.offDays,ds])}
                            style={{padding:'4px 10px',borderRadius:'999px',fontSize:'12px',border:isOff?'1.5px solid #F09595':'0.5px solid var(--color-border-tertiary)',background:isOff?'#FCEBEB':'transparent',color:isOff?'#A32D2D':'var(--color-text-secondary)',cursor:'pointer',fontWeight:isOff?'500':'400'}}
                          >
                            {DAYS[i]} {ds}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Add employee form */}
          {showAddEmp && (
            <div style={card}>
              <div style={{fontSize:'13px',fontWeight:'500',marginBottom:'12px'}}>New employee</div>
              <div style={{display:'flex',gap:'8px',marginBottom:'10px',flexWrap:'wrap'}}>
                <input placeholder="Full name" value={newEmp.name} onChange={e=>setNewEmp(p=>({...p,name:e.target.value}))} style={{flex:'2 1 120px',boxSizing:'border-box'}} />
                <input placeholder="Role / title" value={newEmp.role} onChange={e=>setNewEmp(p=>({...p,role:e.target.value}))} style={{flex:'2 1 100px',boxSizing:'border-box'}} />
                <div style={{flex:'1 1 70px'}}>
                  <input type="number" placeholder="100" min="10" max="200" step="5" value={newEmp.salaryPct} onChange={e=>setNewEmp(p=>({...p,salaryPct:Number(e.target.value)}))} style={{width:'100%',boxSizing:'border-box'}} />
                </div>
              </div>
              <div style={{display:'flex',gap:'8px'}}>
                <button onClick={addEmployee} style={{...genBtn,padding:'7px 16px'}}>Add employee</button>
                <button onClick={()=>{setShowAddEmp(false);setNewEmp({name:'',role:'',salaryPct:100});}} style={pill(false)}>Cancel</button>
              </div>
            </div>
          )}
          {!showAddEmp && (
            <button onClick={()=>setShowAddEmp(true)} style={{...pill(false),alignSelf:'flex-start',padding:'8px 16px'}}>
              + Add employee
            </button>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          SHIFTS VIEW
      ══════════════════════════════════════════════════════════════════════ */}
      {view==='shifts' && (
        <div>
          <p style={{fontSize:'13px',color:'var(--color-text-secondary)',marginTop:0,marginBottom:'14px'}}>
            Define the shift types at your workplace. The AI uses these when generating the schedule.
          </p>
          <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
            {shifts.map(shift=>(
              <div key={shift.id} style={{...card,display:'flex',alignItems:'flex-end',gap:'12px',flexWrap:'wrap'}}>
                <div style={{flex:'2 1 100px'}}>
                  <div style={label}>Name</div>
                  <input value={shift.name} onChange={e=>setShifts(p=>p.map(s=>s.id===shift.id?{...s,name:e.target.value}:s))} style={{width:'100%',boxSizing:'border-box'}} />
                </div>
                <div style={{flex:'1 1 80px'}}>
                  <div style={label}>Start</div>
                  <input type="time" value={shift.start} onChange={e=>setShifts(p=>p.map(s=>s.id===shift.id?{...s,start:e.target.value}:s))} style={{width:'100%',boxSizing:'border-box'}} />
                </div>
                <div style={{flex:'1 1 80px'}}>
                  <div style={label}>End</div>
                  <input type="time" value={shift.end} onChange={e=>setShifts(p=>p.map(s=>s.id===shift.id?{...s,end:e.target.value}:s))} style={{width:'100%',boxSizing:'border-box'}} />
                </div>
                <div style={{flex:'1 1 70px'}}>
                  <div style={label}>Staff needed</div>
                  <input type="number" min="1" max="20" value={shift.required} onChange={e=>setShifts(p=>p.map(s=>s.id===shift.id?{...s,required:Number(e.target.value)}:s))} style={{width:'100%',boxSizing:'border-box'}} />
                </div>
                <button onClick={()=>setShifts(p=>p.filter(s=>s.id!==shift.id))} style={{...pill(false),color:'#A32D2D',padding:'7px 12px',marginBottom:'1px'}}>✕ Remove</button>
              </div>
            ))}
            <button onClick={()=>setShifts(p=>[...p,{id:`s${Date.now()}`,name:'New Shift',start:'09:00',end:'17:00',required:1}])} style={{...pill(false),alignSelf:'flex-start',padding:'8px 16px'}}>
              + Add shift type
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
