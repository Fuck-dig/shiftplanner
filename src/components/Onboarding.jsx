import { useState } from 'react';
import { T, styles } from '../lib/constants';
import { createOrg } from '../lib/org';

export default function Onboarding({ onCreated }){
  const [name, setName]   = useState('');
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!name.trim()) return;
    setError(''); setBusy(true);
    try {
      const id = await createOrg(name.trim());
      onCreated(id);
    } catch (e) {
      setError(e.message || 'Could not create the restaurant.');
      setBusy(false);
    }
  };

  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:T.bg,padding:20}}>
      <div style={{...styles.card, width:'min(420px,100%)'}}>
        <div style={{textAlign:'center',marginBottom:22}}>
          <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:28,fontWeight:600,color:T.text}}>Welcome to Rorota</div>
          <div style={{fontSize:13,color:T.text3,marginTop:6}}>Let's set up your first restaurant. You can add more anytime.</div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <input placeholder="Restaurant name" value={name} autoFocus
            onChange={e=>setName(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') submit(); }} style={styles.input}/>
          {error && <div style={{fontSize:12,color:T.danger,background:T.dangerLight,border:`1px solid ${T.danger}33`,borderRadius:8,padding:'8px 10px'}}>{error}</div>}
          <button onClick={submit} disabled={busy||!name.trim()}
            style={{padding:'10px',borderRadius:8,background:T.accent,color:'#fff',border:'none',fontSize:14,fontWeight:500,cursor:busy?'wait':'pointer',fontFamily:'inherit',opacity:(busy||!name.trim())?0.6:1}}>
            {busy ? 'Creating…' : 'Create restaurant'}
          </button>
        </div>
      </div>
    </div>
  );
}
