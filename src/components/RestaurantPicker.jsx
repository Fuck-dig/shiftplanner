import { useState } from 'react';
import { T } from '../lib/constants';
import { supabase } from '../lib/supabase';
import { createOrg } from '../lib/org';

function isDark(){ return T.bg === '#1A1714'; }

const roleColors = {
  owner:    { bg: '#F5E2E2', text: '#963030', border: '#E8BABA' },
  manager:  { bg: '#F5EAE2', text: '#7A3318', border: '#E8C0A0' },
  employee: { bg: '#E5F0E9', text: '#236040', border: '#9FD8B8' },
};

export default function RestaurantPicker({ orgs, onSelect, onCreated, theme, toggleTheme }) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName]             = useState('');
  const [busy, setBusy]             = useState(false);
  const [error, setError]           = useState('');

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true); setError('');
    try {
      const id = await createOrg(name.trim());
      setName(''); setShowCreate(false);
      await onCreated(id);
    } catch(e) {
      setError(e.message || 'Could not create restaurant.');
    } finally { setBusy(false); }
  };

  return (
    <div style={{minHeight:'100vh',width:'100%',background:T.bg,backgroundImage:isDark()?'radial-gradient(circle at 20% 10%, rgba(217,122,74,0.08), transparent 40%), radial-gradient(circle at 80% 90%, rgba(95,174,122,0.07), transparent 40%)':'radial-gradient(circle at 20% 10%, rgba(191,90,44,0.05), transparent 40%), radial-gradient(circle at 80% 90%, rgba(61,122,82,0.04), transparent 40%)',fontFamily:"'Hanken Grotesk',sans-serif",color:T.text,display:'flex',flexDirection:'column'}}>

      {/* Top bar */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'20px 32px'}}>
        <span style={{fontFamily:'Fraunces, Georgia, serif',fontSize:22,fontWeight:600,color:T.text,letterSpacing:'-0.02em'}}>Rorota</span>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <button onClick={toggleTheme} style={{width:32,height:32,borderRadius:8,border:`1px solid ${T.border}`,background:T.surface,color:T.text2,cursor:'pointer',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center'}}>{isDark()?'☀':'☾'}</button>
          <button onClick={()=>supabase.auth.signOut()} style={{padding:'6px 14px',borderRadius:8,border:`1px solid ${T.border}`,background:T.surface,color:T.text2,cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>Log out</button>
        </div>
      </div>

      {/* Main content */}
      <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'32px 24px'}}>
        <div style={{width:'100%',maxWidth:520}}>
          <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:28,fontWeight:500,color:T.text,marginBottom:8,textAlign:'center'}}>
            {orgs.length === 0 ? 'Welcome to Rorota' : 'Your restaurants'}
          </div>
          <div style={{fontSize:13,color:T.text2,marginBottom:32,textAlign:'center'}}>
            {orgs.length === 0 ? 'Create your first restaurant to get started.' : 'Select a restaurant to continue.'}
          </div>

          {/* Restaurant cards */}
          <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:16}}>
            {orgs.map(org => {
              const rc = roleColors[org.role] || roleColors.employee;
              return (
                <button key={org.id} onClick={() => onSelect(org.id)}
                  style={{display:'flex',alignItems:'center',gap:16,padding:'16px 20px',borderRadius:14,background:T.surface,border:`1px solid ${T.border}`,cursor:'pointer',fontFamily:'inherit',textAlign:'left',transition:'all 0.15s',boxShadow:'0 1px 2px rgba(33,27,21,0.04), 0 8px 20px -12px rgba(33,27,21,0.12)'}}
                  onMouseEnter={e=>{e.currentTarget.style.border=`1px solid ${T.accent}66`;e.currentTarget.style.transform='translateY(-1px)';}}
                  onMouseLeave={e=>{e.currentTarget.style.border=`1px solid ${T.border}`;e.currentTarget.style.transform='translateY(0)';}}>
                  {/* Restaurant avatar */}
                  <div style={{width:44,height:44,borderRadius:12,background:isDark()?T.accent+'22':T.accentLight,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:700,color:T.accent,flexShrink:0,fontFamily:'Fraunces, Georgia, serif'}}>
                    {org.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:15,fontWeight:600,color:T.text,marginBottom:3}}>{org.name}</div>
                    <div style={{fontSize:11,color:T.text3}}>Click to open</div>
                  </div>
                  <span style={{fontSize:11,fontWeight:500,padding:'3px 10px',borderRadius:999,background:isDark()?rc.text+'22':rc.bg,color:rc.text,border:`1px solid ${isDark()?rc.text+'44':rc.border}`,flexShrink:0}}>
                    {org.role}
                  </span>
                  <span style={{fontSize:18,color:T.text3}}>›</span>
                </button>
              );
            })}
          </div>

          {/* Create new */}
          {!showCreate ? (
            <button onClick={() => setShowCreate(true)}
              style={{width:'100%',padding:'14px 20px',borderRadius:14,background:'transparent',border:`1.5px dashed ${T.border}`,cursor:'pointer',fontFamily:'inherit',fontSize:13,color:T.text2,display:'flex',alignItems:'center',justifyContent:'center',gap:8,transition:'all 0.15s'}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=T.accent;e.currentTarget.style.color=T.accent;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.color=T.text2;}}>
              <span style={{fontSize:18,lineHeight:1}}>+</span> Create new restaurant
            </button>
          ) : (
            <div style={{padding:'16px 20px',borderRadius:14,background:T.surface,border:`1px solid ${T.border}`}}>
              <div style={{fontSize:13,fontWeight:500,color:T.text,marginBottom:12}}>New restaurant</div>
              <div style={{display:'flex',gap:8}}>
                <input autoFocus placeholder="Restaurant name" value={name} onChange={e=>setName(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&create()}
                  style={{flex:1,padding:'8px 12px',borderRadius:8,border:`1px solid ${T.border}`,background:T.surfaceWarm,color:T.text,fontSize:13,fontFamily:'inherit',outline:'none'}}
                  disabled={busy}/>
                <button onClick={create} disabled={busy||!name.trim()}
                  style={{padding:'8px 16px',borderRadius:8,background:T.accent,color:'#fff',border:'none',cursor:'pointer',fontSize:13,fontFamily:'inherit',fontWeight:500,opacity:busy||!name.trim()?0.6:1}}>
                  {busy ? 'Creating…' : 'Create'}
                </button>
                <button onClick={()=>{setShowCreate(false);setName('');setError('');}}
                  style={{padding:'8px 12px',borderRadius:8,background:T.surfaceWarm,color:T.text2,border:`1px solid ${T.border}`,cursor:'pointer',fontSize:13,fontFamily:'inherit'}}>
                  Cancel
                </button>
              </div>
              {error && <div style={{marginTop:8,fontSize:12,color:T.danger}}>{error}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
