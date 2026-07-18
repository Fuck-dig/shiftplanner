import { useState } from 'react';
import { T, styles } from '../lib/constants';
import { supabase } from '../lib/supabase';
import { LANGUAGES, makeT, detectLang } from '../i18n';
import { load, save } from '../lib/storage';

const linkBtn = { background:'none', border:'none', color:T.accent, cursor:'pointer', fontFamily:'inherit', fontSize:12, padding:0, textDecoration:'underline' };

export default function Auth(){
  const [mode, setMode]         = useState('login'); // 'login' | 'signup'
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState('');
  const [notice, setNotice]     = useState('');
  const [lang, setLangRaw]      = useState(()=>load('sa2_lang', detectLang()));
  const setLang = v => { setLangRaw(v); save('sa2_lang', v); };
  const t = makeT(lang);

  const submit = async () => {
    if (!email || !password) return;
    setError(''); setNotice(''); setBusy(true);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setNotice(t('auth.signupSuccess'));
        setMode('login');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // success: the App auth gate picks up the new session automatically
      }
    } catch (e) {
      setError(e.message || t('auth.genericError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:T.bg,padding:20}}>
      <div style={{...styles.card,width:'min(380px,100%)'}}>
        <div style={{display:'flex',justifyContent:'center',marginBottom:14}}>
          <select value={lang} onChange={e=>setLang(e.target.value)} style={{fontFamily:'inherit',fontSize:12,color:T.text2,background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:'6px 8px',cursor:'pointer',outline:'none'}}>{LANGUAGES.map(L=><option key={L.code} value={L.code}>{L.flag} {L.label}</option>)}</select>
        </div>
        <div style={{textAlign:'center',marginBottom:22}}>
          <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:30,fontWeight:600,color:T.text}}>Rorota</div>
          <div style={{fontSize:13,color:T.text3,marginTop:4}}>{mode==='login' ? t('auth.loginSubtitle') : t('auth.signupSubtitle')}</div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <input type="email" autoComplete="email" placeholder={t('auth.emailPlaceholder')} value={email}
            onChange={e=>setEmail(e.target.value)} style={styles.input}/>
          <input type="password" autoComplete={mode==='login'?'current-password':'new-password'} placeholder={t('auth.passwordPlaceholder')} value={password}
            onChange={e=>setPassword(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') submit(); }} style={styles.input}/>
          {error  && <div style={{fontSize:12,color:T.danger, background:T.dangerLight, border:`1px solid ${T.danger}33`,  borderRadius:8,padding:'8px 10px'}}>{error}</div>}
          {notice && <div style={{fontSize:12,color:T.success,background:T.successLight,border:`1px solid ${T.success}33`, borderRadius:8,padding:'8px 10px'}}>{notice}</div>}
          <button onClick={submit} disabled={busy||!email||!password}
            style={{padding:'10px',borderRadius:8,background:T.accent,color:'#fff',border:'none',fontSize:14,fontWeight:500,cursor:busy?'wait':'pointer',fontFamily:'inherit',opacity:(busy||!email||!password)?0.6:1,transition:'opacity 0.15s'}}>
            {busy ? '…' : (mode==='login' ? t('auth.logIn') : t('auth.signUp'))}
          </button>
        </div>
        <div style={{textAlign:'center',marginTop:16,fontSize:12,color:T.text3}}>
          {mode==='login'
            ? <>{t('auth.noAccountYet')} <button onClick={()=>{ setMode('signup'); setError(''); setNotice(''); }} style={linkBtn}>{t('auth.signUp')}</button></>
            : <>{t('auth.alreadyHaveOne')} <button onClick={()=>{ setMode('login'); setError(''); setNotice(''); }} style={linkBtn}>{t('auth.logIn')}</button></>}
        </div>
      </div>
    </div>
  );
}
