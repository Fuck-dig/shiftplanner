import { useState } from 'react';
import { T } from '../lib/constants';
import { supabase } from '../lib/supabase';
import { createOrg } from '../lib/org';

// Temporary floating control for switching restaurants + logging out.
// We'll fold this into the main nav / an account menu once the data layer is wired.
export default function AccountBar({ orgs, active, onSwitch, onReload }){
  const [adding, setAdding] = useState(false);
  const [name, setName]     = useState('');
  const [busy, setBusy]     = useState(false);

  const addOrg = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const id = await createOrg(name.trim());
      setName(''); setAdding(false);
      await onReload();
      onSwitch(id);
    } catch (e) {
      alert(e.message || 'Could not create the restaurant.');
    } finally { setBusy(false); }
  };

  const wrap = { position:'fixed', bottom:14, left:14, zIndex:100, display:'flex', alignItems:'center', gap:8,
    background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:'6px 8px',
    boxShadow:'0 2px 10px rgba(33,27,21,0.14)', fontFamily:'inherit' };
  const sel = { fontFamily:'inherit', fontSize:13, color:T.text, background:'transparent', border:'none', cursor:'pointer', maxWidth:300 };
  const btn = { fontFamily:'inherit', fontSize:12, color:T.text2, background:'transparent', border:`1px solid ${T.border}`, borderRadius:7, padding:'4px 8px', cursor:'pointer' };
  const inp = { fontFamily:'inherit', fontSize:13, border:`1px solid ${T.border}`, borderRadius:7, padding:'4px 8px', outline:'none' };

  return (
    <div style={wrap}>
      {!adding ? (
        <>
          <select value={active.id} onChange={e=>onSwitch(e.target.value)} style={sel} title="Switch restaurant">
            {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <button style={btn} onClick={()=>setAdding(true)}>+ New</button>
          <button style={btn} onClick={()=>supabase.auth.signOut()}>Log out</button>
        </>
      ) : (
        <>
          <input autoFocus placeholder="Restaurant name" value={name} style={inp}
            onChange={e=>setName(e.target.value)}
            onKeyDown={e=>{ if(e.key==='Enter') addOrg(); if(e.key==='Escape'){ setAdding(false); setName(''); } }}/>
          <button style={btn} disabled={busy||!name.trim()} onClick={addOrg}>{busy?'…':'Add'}</button>
          <button style={btn} onClick={()=>{ setAdding(false); setName(''); }}>Cancel</button>
        </>
      )}
    </div>
  );
}
