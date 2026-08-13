import { Component } from 'react';
import { T } from '../lib/constants';
import { makeT, detectLang } from '../i18n';
import { reportError } from '../lib/monitoring';

// Last-resort safety net. Must be a class component — componentDidCatch/
// getDerivedStateFromError have no hook equivalent. Wraps the whole app from
// outside (see main.jsx) so a render error anywhere no longer blanks the
// screen with nothing but a white page and a console stack trace.
//
// This can't reach into App's own state (that's exactly what just crashed),
// so it picks a language from the browser locale via detectLang() rather
// than whatever the org/user had saved — a reasonable fallback for a screen
// that only appears when everything else has already failed.
export default class ErrorBoundary extends Component {
  constructor(props){
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error){
    return { error };
  }

  componentDidCatch(error, info){
    // This is the app's last catch, so it is the last chance to report. Until
    // 13 Aug it only reached the console, which nobody reads on a customer's
    // laptop — the screen you are looking at right now was the entire signal.
    reportError(error, { componentStack: info?.componentStack });
  }

  render(){
    if(!this.state.error) return this.props.children;
    const t = makeT(detectLang());
    return (
      <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:T.bg,padding:24,fontFamily:"'Hanken Grotesk',sans-serif"}}>
        <div style={{maxWidth:420,textAlign:'center'}}>
          <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:22,fontWeight:500,color:T.text,marginBottom:10}}>{t('error.title')}</div>
          <div style={{fontSize:13,color:T.text2,lineHeight:1.6,marginBottom:24}}>{t('error.desc')}</div>
          <button onClick={()=>window.location.reload()} style={{padding:'10px 22px',borderRadius:8,border:'none',background:T.accent,color:'#fff',fontSize:14,fontWeight:500,cursor:'pointer',fontFamily:'inherit'}}>{t('error.reload')}</button>
        </div>
      </div>
    );
  }
}
