import { useState, useEffect, Suspense, lazy } from 'react';
import { T, styles, THEMES, computeStyles } from './lib/constants';
import { load, save } from './lib/storage';
import { supabase } from './lib/supabase';
import { retryChunkLoad } from './lib/chunkReload';
import { listOrgs, acceptPendingInvitations } from './lib/org';
import { makeT, detectLang } from './i18n';
import { LoadingScreen } from './components/ui';
import Auth from './components/Auth';
import RestaurantPicker from './components/RestaurantPicker';

// Lazy — a session is exactly one of employee / kiosk / manager, so the other
// two never need downloading. Dashboard only became splittable once it moved
// out of App.jsx; while it lived here every employee downloaded the entire
// manager app (the largest thing in the bundle) to render a read-only rota.
// Wrapped in retryChunkLoad, not bare lazy(): after a deploy the service
// worker swaps in and purges the old precache, so an already-open tab asks for
// chunk hashes that no longer exist and white-screens. See lib/chunkReload.js.
const Dashboard    = lazy(() => retryChunkLoad(() => import('./components/Dashboard')));
const EmployeeView = lazy(() => retryChunkLoad(() => import('./components/EmployeeView')));
const KioskView    = lazy(() => retryChunkLoad(() => import('./components/KioskView')));

// ─── Outer App — auth gate ────────────────────────────────────────────────────
export default function App(){
  const [theme,setThemeRaw]=useState(()=>load('sa2_theme','light'));
  Object.assign(T,THEMES[theme]||THEMES.light);
  Object.assign(styles,computeStyles());
  const toggleTheme=()=>{const next=theme==='dark'?'light':'dark';setThemeRaw(next);save('sa2_theme',next);};

  // Rendered above every screen below (Auth, RestaurantPicker, loading,
  // Dashboard, EmployeeView alike) rather than inside any one of them, so it
  // shows up no matter where someone is when their connection drops. Only
  // reflects the browser's own connectivity signal — it doesn't mean the
  // Supabase calls themselves are failing (a captive portal or a server
  // outage wouldn't flip this), just that the device itself has no network.
  const [isOffline,setIsOffline]=useState(()=>typeof navigator!=='undefined'&&!navigator.onLine);
  useEffect(()=>{
    const goOnline=()=>setIsOffline(false);
    const goOffline=()=>setIsOffline(true);
    window.addEventListener('online',goOnline);
    window.addEventListener('offline',goOffline);
    return()=>{window.removeEventListener('online',goOnline);window.removeEventListener('offline',goOffline);};
  },[]);
  // App() itself doesn't otherwise track a language (each screen below picks
  // its own independently) — this banner needs one anyway, so it reads the
  // same stored preference they all do.
  const bannerT=makeT(load('sa2_lang',detectLang()));

  const [session,setSession]    =useState(undefined);
  const [orgs,setOrgs]          =useState(undefined);
  const [orgTick,setOrgTick]    =useState(0);
  const [activeOrg,setActiveOrg]=useState(null); // always starts null — user picks on login

  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{
      setSession(data.session);
      // Accept any pending invitations when user logs in. The orgs list is
      // fetched by a separate effect keyed on [session, orgTick] — setSession
      // above fires that fetch immediately, racing ahead of this async call,
      // so without bumping orgTick afterward here too (like the
      // onAuthStateChange branch below already does), a newly-accepted
      // invite would silently never show up: the org list is fetched once
      // too early (before acceptance lands) and nothing ever triggers it to
      // refetch. This is exactly the path taken on a normal page load with
      // an already-established session (e.g. right after signing up/logging
      // in), which is the common case for someone accepting an invite.
      if(data.session) acceptPendingInvitations().then(()=>setOrgTick(t=>t+1)).catch(err=>{console.error(err);alert(err.message||'Failed to accept a pending team invitation. Please refresh and try again.');});
    });
    const{data:sub}=supabase.auth.onAuthStateChange((_e,s)=>{
      setSession(s);
      if(s) acceptPendingInvitations().then(()=>setOrgTick(t=>t+1)).catch(err=>{console.error(err);alert(err.message||'Failed to accept a pending team invitation. Please refresh and try again.');});
    });
    return()=>sub.subscription.unsubscribe();
  },[]);

  useEffect(()=>{
    if(!session){setOrgs(undefined);return;}
    let alive=true;
    listOrgs().then(list=>{if(alive)setOrgs(list);}).catch(e=>{console.error(e);if(alive)setOrgs([]);});
    return()=>{alive=false;};
  },[session,orgTick]);

  // Don't auto-select — let user pick from RestaurantPicker

  const switchOrg =id=>{setActiveOrg(id);try{localStorage.setItem('sa2_active_org',id);}catch{}};
  const reloadOrgs=async()=>{setOrgs(undefined);setOrgTick(t=>t+1);};

  // Kiosk mode is just a URL flag (?kiosk=1) — see KioskView.jsx and the
  // isManager branch below for why that's an adequate gate rather than a
  // second login system.
  const isKiosk = typeof window!=='undefined' && new URLSearchParams(window.location.search).get('kiosk')==='1';

  let content;
  if(session===undefined) content=<LoadingScreen/>;
  else if(!session) content=<Auth toggleTheme={toggleTheme}/>;
  else if(orgs===undefined) content=<LoadingScreen/>;
  // Show restaurant picker if no active org selected or user has no orgs yet
  else if(!activeOrg||!orgs.find(o=>o.id===activeOrg)){
    content=<RestaurantPicker
      orgs={orgs}
      onSelect={id=>switchOrg(id)}
      onCreated={async id=>{await reloadOrgs();switchOrg(id);}}
      toggleTheme={toggleTheme}
    />;
  } else {
    const active=orgs.find(o=>o.id===activeOrg);
    if(!active){
      content=<LoadingScreen/>;
    } else {
      // A missing/unrecognized role must NOT grant manager access — default
      // to least privilege (employee view) rather than silently trusting a
      // blank role, which is what let invited members land in the manager
      // dashboard whenever their membership role failed to come through as
      // expected.
      const isManager=(active.role==='owner'||active.role==='manager');
      const isOwner=(active.role==='owner');
      // Kiosk mode (?kiosk=1) is a separate, shared-device screen for
      // clocking in/out — see KioskView.jsx. It only ever activates for a
      // manager/owner login (that login IS the access gate for reaching
      // kiosk mode at all); a plain employee login ignores the flag and
      // always gets the normal EmployeeView regardless.
      content=!isManager
        ? <Suspense fallback={<LoadingScreen/>}><EmployeeView orgId={active.id} key={active.id} orgName={active.name} role={active.role||'employee'} theme={theme} toggleTheme={toggleTheme} onBack={()=>setActiveOrg(null)}/></Suspense>
        : isKiosk
        ? <Suspense fallback={<LoadingScreen/>}><KioskView orgId={active.id} key={active.id+'-kiosk'} orgName={active.name} toggleTheme={toggleTheme} onExitKiosk={()=>{ const url=new URL(window.location.href); url.searchParams.delete('kiosk'); window.location.href=url.toString(); }}/></Suspense>
        : <Suspense fallback={<LoadingScreen/>}><Dashboard orgId={active.id} key={active.id} orgName={active.name} isOwner={isOwner} role={active.role} theme={theme} toggleTheme={toggleTheme} onBack={()=>setActiveOrg(null)}/></Suspense>;
    }
  }

  return(
    <>
      {isOffline && (
        <div style={{position:'fixed',top:0,left:0,right:0,zIndex:500,background:T.warningLight,color:T.warning,fontSize:12,fontWeight:600,textAlign:'center',padding:'6px 12px',fontFamily:"'Hanken Grotesk',sans-serif"}}>
          {bannerT('offline.banner')}
        </div>
      )}
      {content}
    </>
  );
}
