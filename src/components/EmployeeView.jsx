import { useState, useEffect, useRef, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { T, styles, DAYS, pal, initials, isDark, ROLE_COLOR_PALETTE, MEMBERSHIP_ROLE_COLORS, TIMEOFF_TYPES } from '../lib/constants';
import { getWeekDates, weekKey, weekKeyToMonday, fmt, fmtLong, dateToISO, todayISO, getMonthOffsets, toMin, weekOffsetFromDate, setLocale, LOCALE } from '../lib/dates';
import { assignmentHours, actualAssignmentHours, actualTimeRange, isOnTimeOff, effectiveRolesFor, hasRestConflict } from '../lib/schedule';
import { fetchEmployees, fetchBlocks, fetchSchedules, fetchTimeOff, fetchShiftSwaps, createShiftSwap, updateShiftSwap, deleteShiftSwap, createNotification, createTimeOffRequest, deleteTimeOffRequest, updateEmployeeSelfProfile, fetchRoleStyles, sendNotificationEmail, fetchMessages } from '../lib/data';
import MessageThreadModal from './MessageThreadModal';
import { supabase } from '../lib/supabase';
import { LANGUAGES, makeT, detectLang, LOCALES } from '../i18n';
import { load, save, migrateEmployee } from '../lib/storage';
import { mergeRoleOrder, reorderRoleList } from '../lib/roles';
import NotificationBell from './NotificationBell';
import ProfileSettings from './ProfileSettings';
import MonthView from './views/MonthView';
import { Btn, RoleBadge, GripDots, WeekPicker, EmpCard, LoadingScreen, StatusBadge, SectionLabel, RequestRow } from './ui';


export default function EmployeeView({ orgId, orgName, role='employee', theme, toggleTheme }){
  const [loading, setLoading]     = useState(true);
  const [employees, setEmployees] = useState([]);
  const [blocks, setBlocks]       = useState([]);
  const [schedules, setSchedules] = useState({});
  const [timeOff, setTimeOff]     = useState([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [myId, setMyId]           = useState(null); // current user's employee record id
  const [lang, setLangRaw]        = useState(()=>load('sa2_lang', detectLang()));
  const setLang = v => { setLangRaw(v); save('sa2_lang', v); };
  const t = makeT(lang);
  // Keep date formatting (fmt/fmtLong) following the selected language —
  // was defaulting to en-GB regardless (see App.jsx for the manager-side
  // equivalent of this fix).
  useEffect(()=>{ setLocale(LOCALES[lang]||'en-GB'); },[lang]);
  const [isMobile,setIsMobile]    = useState(()=>typeof window!=='undefined'&&window.innerWidth<860);
  const [swaps, setSwaps]         = useState([]);       // all shift_swaps for this org, any week/status
  const [swapModal, setSwapModal] = useState(null);      // {day,blockId,blockName,role} while the give-away modal is open
  // Claiming a shift that clashes with something (you're on leave, too
  // little rest, over your hours) is allowed but confirmed first:
  // {swap, reasons} while that dialog is open.
  const [claimWarn, setClaimWarn] = useState(null);
  const [requestModal, setRequestModal] = useState(null); // {emp,day,blockId,blockName,role} while the "request this shift" modal is open (proactively asking a coworker for their shift)
  const [swapBusy, setSwapBusy]   = useState(false);
  const [timeOffModalOpen, setTimeOffModalOpen] = useState(false);
  const [toBusy, setToBusy]       = useState(false);
  const [view, setView]           = useState('schedule'); // 'schedule' | 'employees' | 'profile' — top-level nav tabs
  const [calMode, setCalMode]     = useState('team');     // 'team' | 'week' | 'month' — which layout the schedule tab shows
  const [staffSearch, setStaffSearch] = useState('');     // dims non-matching people, same as the manager's staff search
  // Measured height of the sticky week/month nav bar, so the "Your Shifts"
  // strip can dock directly beneath it rather than under it. Declared here
  // (after view/calMode, which the effect depends on) and well above the
  // `if (loading) return <LoadingScreen/>` guard further down — a hook below
  // that guard runs on some renders and not others, which crashes React.
  const navBarRef = useRef(null);
  const [navBarH, setNavBarH] = useState(0);
  useEffect(()=>{
    const el=navBarRef.current;
    if(!el) return;
    const ro=new ResizeObserver(entries=>{
      const h=entries[0]?.contentRect?.height;
      if(h) setNavBarH(h);
    });
    ro.observe(el);
    return ()=>ro.disconnect();
  },[view,calMode]);
  const [displayMonth, setDisplayMonth] = useState(()=>{const n=new Date();return {y:n.getFullYear(),m:n.getMonth()};});
  const [dayFilter, setDayFilter] = useState(()=>{const jsDay=new Date().getDay();return DAYS[jsDay===0?6:jsDay-1];}); // which day the read-only 'week' tab isolates
  const [gridGroupBy, setGridGroupBy] = useState('name'); // 'name' | 'role' — shared sort/group toggle for the Team and Week tabs
  // Personal, per-browser role display/group order — each person arranges
  // their own Team tab; not shared with the manager or other employees.
  const [roleOrder, setRoleOrder] = useState(()=>load('sa2_roleOrder_'+orgId, []));
  const [collapsedRoles, setCollapsedRoles] = useState(()=>new Set()); // role names currently collapsed in the Team tab's "By role" grouping
  const [dragRole, setDragRole] = useState(null); // drag-and-drop reordering of role groups in the Team tab
  const [dragOverRole, setDragOverRole] = useState(null);
  const [roleStyles, setRoleStyles] = useState({}); // the manager's actual role colours, read-only here — shared org-wide, unlike order above

  const reloadSwaps = () => { if(orgId) fetchShiftSwaps(orgId).then(setSwaps).catch(err=>console.error('Load swaps failed:',err)); };
  useEffect(()=>{
    reloadSwaps();
    const iv=setInterval(reloadSwaps,45000); // no realtime subscription yet — light polling instead
    return ()=>clearInterval(iv);
  },[orgId]);

  // Direct messages addressed to this employee (see ComposeMessageModal),
  // surfaced through the same NotificationBell as system notifications.
  // Only meaningful once myId resolves, since messages are always addressed
  // to a specific employees row.
  const [messages, setMessages] = useState([]);
  const [openMessage, setOpenMessage] = useState(null); // the message shown in MessageThreadModal, or null
  const reloadMessages = () => { if(myId) fetchMessages(myId).then(setMessages).catch(err=>console.error('Load messages failed:',err)); };
  useEffect(()=>{
    reloadMessages();
    const iv=setInterval(reloadMessages,45000); // fallback in case the realtime subscription below ever drops
    return ()=>clearInterval(iv);
  },[myId]);
  // Realtime subscription — new messages (and existing ones flipping back
  // to unread when a manager replies) show up immediately instead of
  // waiting for the next 45s poll. Requires `messages` to be added to the
  // `supabase_realtime` publication (see the direct-messages migration's
  // follow-up note) — falls back to the poll above if that hasn't been run
  // yet or the socket drops.
  useEffect(()=>{
    if(!myId) return;
    const channel=supabase.channel(`messages-emp-${myId}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'messages',filter:`recipient_emp_id=eq.${myId}`},reloadMessages)
      .subscribe();
    return ()=>{ supabase.removeChannel(channel); };
  },[myId]);
  // Optimistic — the modal itself also calls markMessageRead, this just
  // avoids waiting for the next poll to clear the unread dot.
  const handleOpenMessage = (m) => {
    setMessages(p=>p.map(x=>x.id===m.id?{...x,read:true}:x));
    setOpenMessage(m);
  };

  useEffect(()=>{
    const onResize=()=>setIsMobile(window.innerWidth<860);
    window.addEventListener('resize',onResize);
    return ()=>window.removeEventListener('resize',onResize);
  },[]);

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
        fetchRoleStyles(orgId).catch(err => { console.error('Load role colours failed:', err); return {}; }),
      ]).then(([emps, blks, to, scheds, rStyles]) => {
        if (!alive) return;
        // Same defaulting App.jsx applies to its own fetch — without it, an
        // employee record missing newer fields (targetHours, contractType,
        // etc.) would show as undefined here even though the manager's own
        // session already sees it defaulted.
        setEmployees(emps.map(migrateEmployee));
        setBlocks(blks);
        setTimeOff(to);
        setSchedules(scheds);
        setRoleStyles(rStyles || {});
        // Try to find the current user's employee record by email
        const me = emps.find(e => e.email && e.email.toLowerCase() === (email||'').toLowerCase());
        if (me) setMyId(me.id);
        setLoading(false);
      }).catch(err => { console.error(err); if(alive) setLoading(false); });
    });
    return () => { alive = false; };
  }, [orgId]);

  // Employees (names, roles, colours) are edited by a manager in a
  // completely separate session — like swaps and time off above, poll
  // instead of loading once, otherwise a rename or role change made after
  // this tab was opened just sits unseen until the page is manually
  // reloaded (exactly what happened when a manager renamed the signed-in
  // test account and this view kept showing the old name).
  useEffect(()=>{
    let alive=true;
    const iv=setInterval(()=>{
      fetchEmployees(orgId).then(emps=>{ if(alive) setEmployees(emps.map(migrateEmployee)); }).catch(err=>console.error('Poll employees failed:',err));
    },45000);
    return ()=>{alive=false;clearInterval(iv);};
  },[orgId]);

  // Schedules were previously fetched once at mount and never refreshed —
  // so a shift clocked in/out via the Kiosk (or a manager's own edit) sat
  // invisible here until a manual page reload. This session never writes
  // the whole schedules object back to the server (no debounced sync to
  // worry about clobbering), so it's safe to just poll and overwrite.
  useEffect(()=>{
    let alive=true;
    const iv=setInterval(()=>{
      fetchSchedules(orgId).then(scheds=>{ if(alive) setSchedules(scheds); }).catch(err=>console.error('Poll schedules failed:',err));
    },45000);
    return ()=>{alive=false;clearInterval(iv);};
  },[orgId]);

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
  const monthOff   = getMonthOffsets(calMode==='month'?displayMonth:weekOffset);
  // Steps the isolated-day Gantt (Week tab, dayFilter set) forward/back one
  // day at a time — crossing a week boundary if needed — instead of the ‹ ›
  // arrows always jumping a whole week regardless of what's isolated. Same
  // behaviour as the manager's own nav arrows.
  const shiftDay = (delta) => {
    const cur = weekDates[DAYS.indexOf(dayFilter||DAYS[0])];
    const nd = new Date(cur); nd.setDate(cur.getDate()+delta);
    setWeekOffset(weekOffsetFromDate(nd));
    const dow = nd.getDay();
    setDayFilter(DAYS[dow===0?6:dow-1]);
  };
  // Coverage math (dayCoverage, inside MonthView) needs the universe of role
  // names blocks actually require staffing for — roleStyles itself isn't
  // synced to employees' sessions, so fall back to whatever's configured on
  // blocks (plus any role an employee happens to be tagged with) rather than
  // a manager-only source of truth.
  const discoveredRoles = [...new Set([
    ...blocks.flatMap(b=>[...Object.keys(b.roles||{}), ...Object.values(b.overrides||{}).flatMap(o=>Object.keys(o||{}))]),
    ...employees.flatMap(e=>e.roles||[]),
  ])];
  // Display/group order: the manager's saved order (from Coverage), plus any
  // role that shows up here but isn't in that saved order yet, appended at
  // the end — same self-healing merge Dashboard uses for its own allRoles
  // (mergeRoleOrder, shared via lib/roles.js).
  const allRoles = mergeRoleOrder(roleOrder, discoveredRoles);
  // Team tab row order — mirrors the manager's TeamView grouping: sorted by
  // name, or bucketed by role. Each employee appears in exactly ONE role
  // group (their first effective role, in Coverage's role order) rather
  // than once per role they have — showing someone's whole week duplicated
  // under every one of their roles was more confusing than useful; which
  // role a given shift is actually for is one tap away (open the shift).
  // "Effective" roles means configured roles OR whatever they're actually
  // scheduled as this week (effectiveRolesFor), so someone covering a
  // one-off shift outside their usual role still groups sensibly. Your own
  // row also gets pinned in a sticky "Your Shifts" strip above the list
  // (see the Team tab JSX below) instead of being sorted to the top here —
  // that way the full list stays in its normal order.
  const effRoles = new Map(employees.map(e=>[e.id, effectiveRolesFor(e,schedule,blocks)]));
  const primaryRoleFor = new Map(employees.map(e=>{
    const eff=effRoles.get(e.id);
    const first=allRoles.find(r=>eff.has(r));
    return [e.id, first||null];
  }));
  const gridRows = gridGroupBy==='role'
    ? allRoles.filter(role=>employees.some(e=>primaryRoleFor.get(e.id)===role))
        .flatMap(role=>[...employees].filter(e=>primaryRoleFor.get(e.id)===role).sort((a,b)=>a.name.localeCompare(b.name)).map(emp=>({emp,role})))
    : [...employees].sort((a,b)=>a.name.localeCompare(b.name)).map(emp=>({emp,role:null}));
  const toggleRoleCollapse = (role) => setCollapsedRoles(prev=>{ const next=new Set(prev); if(next.has(role)) next.delete(role); else next.add(role); return next; });
  // roleStyles (the manager's real, Supabase-synced colours) covers most
  // roles, but a role can exist here before it's ever been styled in
  // Coverage (or the fetch simply hasn't resolved yet) — this hash-based
  // stand-in is the fallback for that gap only. Keyed by a hash of the
  // role's own name — NOT its position in allRoles — so dragging roles into
  // a new order doesn't shuffle an unstyled role's stand-in colour too.
  const hashRole = (role) => { let h=0; for(let i=0;i<role.length;i++) h=(h*31+role.charCodeAt(i))>>>0; return h; };
  const roleColorFor = (role) => ROLE_COLOR_PALETTE[hashRole(role)%ROLE_COLOR_PALETTE.length];
  // Drag a role group to reorder it relative to the others — personal to
  // this browser (see roleOrder's init above), not shared with anyone else.
  const reorderRoles = (draggedRole, targetRole) => {
    const next = reorderRoleList(allRoles, draggedRole, targetRole);
    if (next===allRoles) return;
    setRoleOrder(next);
    save('sa2_roleOrder_'+orgId, next);
  };

  // "Hours worked" — actual hours where corrected after the fact, scheduled
  // hours everywhere else (actualAssignmentHours falls back automatically).
  const empHoursMap = employees.reduce((acc, e) => {
    if (!schedule) { acc[e.id] = 0; return acc; }
    let h = 0;
    DAYS.forEach(day => blocks.forEach(b => {
      const a=(schedule[day]?.[b.id]||[]).find(a => a.empId === e.id);
      if (a) h += actualAssignmentHours(a,b);
    }));
    acc[e.id] = h; return acc;
  }, {});

  // Parallel map: how many of this week's shifts are clocked/corrected
  // rather than a bare schedule estimate — same flag Costs shows managers,
  // surfaced here too so an employee's own Profile hours card is equally
  // honest about what's an estimate vs. an actual.
  const empCorrectedMap = employees.reduce((acc, e) => {
    if (!schedule) { acc[e.id] = 0; return acc; }
    let c = 0;
    DAYS.forEach(day => blocks.forEach(b => {
      const a=(schedule[day]?.[b.id]||[]).find(a => a.empId === e.id);
      if (a && (a.noShow || a.actualStart || a.actualEnd)) c++;
    }));
    acc[e.id] = c; return acc;
  }, {});

  // Hours across an arbitrary [startISO,endISO] range (inclusive) — unlike
  // empHoursMap above, which only ever looks at the single week currently
  // loaded into `schedule`. `schedules` already holds every week's data for
  // the org (fetched once on load), so a longer lookback like
  // "month-to-date" needs no extra fetch — just walk every week key we
  // already have and pick out the days that fall in range.
  const hoursInRange = (empId, startISO, endISO) => {
    let total = 0;
    Object.entries(schedules).forEach(([wk, entry]) => {
      const sched = entry?.schedule;
      if (!sched) return;
      const monday = weekKeyToMonday(wk);
      DAYS.forEach((day,i) => {
        const d = new Date(monday); d.setDate(monday.getDate()+i);
        const iso = dateToISO(d);
        if (iso < startISO || iso > endISO) return;
        blocks.forEach(b => {
          const a = (sched[day]?.[b.id]||[]).find(x=>x.empId===empId);
          if (a) total += actualAssignmentHours(a,b);
        });
      });
    });
    return total;
  };
  const myMonthHours = myId ? (() => {
    const now = new Date();
    const startISO = dateToISO(new Date(now.getFullYear(), now.getMonth(), 1));
    return hoursInRange(myId, startISO, todayISO());
  })() : 0;

  // Same [startISO,endISO] walk as hoursInRange, counting clocked/corrected
  // shifts instead of summing hours.
  const correctedInRange = (empId, startISO, endISO) => {
    let count = 0;
    Object.entries(schedules).forEach(([wk, entry]) => {
      const sched = entry?.schedule;
      if (!sched) return;
      const monday = weekKeyToMonday(wk);
      DAYS.forEach((day,i) => {
        const d = new Date(monday); d.setDate(monday.getDate()+i);
        const iso = dateToISO(d);
        if (iso < startISO || iso > endISO) return;
        blocks.forEach(b => {
          const a = (sched[day]?.[b.id]||[]).find(x=>x.empId===empId);
          if (a && (a.noShow || a.actualStart || a.actualEnd)) count++;
        });
      });
    });
    return count;
  };
  const myMonthCorrected = myId ? (() => {
    const now = new Date();
    const startISO = dateToISO(new Date(now.getFullYear(), now.getMonth(), 1));
    return correctedInRange(myId, startISO, todayISO());
  })() : 0;

  const me = employees.find(e=>e.id===myId);

  const saveMyName = (newName) => {
    updateEmployeeSelfProfile(myId, { name: newName })
      .then(()=>setEmployees(p=>p.map(e=>e.id===myId?{...e,name:newName}:e)))
      .catch(err=>alert(err.message||'Failed to save'));
  };
  const saveMyColor = (palIdx) => {
    updateEmployeeSelfProfile(myId, { palIdx })
      .then(()=>setEmployees(p=>p.map(e=>e.id===myId?{...e,palIdx}:e)))
      .catch(err=>alert(err.message||'Failed to save'));
  };
  const saveMyPhone = (phone) => {
    updateEmployeeSelfProfile(myId, { phone })
      .then(()=>setEmployees(p=>p.map(e=>e.id===myId?{...e,phone}:e)))
      .catch(err=>alert(err.message||'Failed to save'));
  };
  const saveMyAvailability = (availability) => {
    updateEmployeeSelfProfile(myId, { availability })
      .then(()=>setEmployees(p=>p.map(e=>e.id===myId?{...e,availability}:e)))
      .catch(err=>alert(err.message||'Failed to save'));
  };
  const saveMyEmailNotifications = (emailNotifications) => {
    updateEmployeeSelfProfile(myId, { emailNotifications })
      .then(()=>setEmployees(p=>p.map(e=>e.id===myId?{...e,emailNotifications}:e)))
      .catch(err=>alert(err.message||'Failed to save'));
  };
  const saveMyPushPrefs = (pushPrefs) => {
    updateEmployeeSelfProfile(myId, { pushPrefs })
      .then(()=>setEmployees(p=>p.map(e=>e.id===myId?{...e,pushPrefs}:e)))
      .catch(err=>alert(err.message||'Failed to save'));
  };

  // Single choke point for every employee-to-employee notification (swap
  // requests, claims, accept/decline) — the in-app row is always created;
  // the email is a best-effort companion sent alongside it whenever the
  // recipient has an email on file, reusing the exact same translated text
  // so the two never say different things.
  const notify = (targetEmpId, messageKey, messageVars) => {
    // A manager-posted open shift has no original owner, so claiming one
    // legitimately has nobody to notify — bail rather than attempting an
    // insert against notifications.emp_id, which is NOT NULL.
    if (!targetEmpId) return;
    createNotification(orgId, targetEmpId, { type: messageKey.replace('notif.',''), messageKey, messageVars })
      .catch(err=>console.error('Notify failed:',err));
    const target = employees.find(e=>e.id===targetEmpId);
    // emailNotifications defaults to true (opt-out, not opt-in) — only skip
    // when the person has explicitly turned it off from their Profile page.
    if (target?.email && target.emailNotifications!==false) {
      const text = t(messageKey, messageVars);
      sendNotificationEmail({ to: target.email, subject: text, body: text });
    }
  };

  const openGiveAway = (day, blockId, blockName, role) => setSwapModal({ day, blockId, blockName, role });

  const submitGiveAway = async ({ toEmpId, note }) => {
    if (!swapModal || !myId) return;
    setSwapBusy(true);
    try{
      await createShiftSwap(orgId, { weekKey: wKey, day: swapModal.day, blockId: swapModal.blockId, role: swapModal.role, fromEmpId: myId, toEmpId: toEmpId||null, note });
      if (toEmpId) notify(toEmpId, 'notif.swapRequestReceived', { name: me?.name||'', role: swapModal.role, day: t('day.'+swapModal.day) });
      setSwapModal(null);
      reloadSwaps();
    }catch(err){ alert(err.message||'Failed to post request'); }
    finally{ setSwapBusy(false); }
  };

  // Covers both "claim an open-to-anyone release" and "accept a direct
  // request" — mechanically identical (I become the claimant, the original
  // requester is notified, a manager still has to approve before the real
  // schedule changes).
  const claimSwap = async (swap) => {
    setSwapBusy(true);
    try{
      await updateShiftSwap(swap.id, { status:'claimed', claimedByEmpId: myId });
      notify(swap.fromEmpId, 'notif.swapClaimed', { name: me?.name||'', role: swap.role, day: t('day.'+swap.day) });
      reloadSwaps();
    }catch(err){ alert(err.message||'Failed'); }
    finally{ setSwapBusy(false); }
  };

  const declineSwap = async (swap) => {
    setSwapBusy(true);
    try{
      await updateShiftSwap(swap.id, { status:'declined' });
      notify(swap.fromEmpId, 'notif.swapDeclined', { day: t('day.'+swap.day) });
      reloadSwaps();
    }catch(err){ alert(err.message||'Failed'); }
    finally{ setSwapBusy(false); }
  };

  const cancelSwap = async (swap) => {
    setSwapBusy(true);
    try{ await deleteShiftSwap(swap.id); reloadSwaps(); }
    catch(err){ alert(err.message||'Failed'); }
    finally{ setSwapBusy(false); }
  };

  // Proactively asking a coworker for a shift they haven't offered up —
  // the mirror image of give-away (which is initiated by the shift's
  // owner). Lands as status 'requested' so the owner gets a chance to
  // accept/decline before it ever reaches the manager's approval queue;
  // accepting just promotes it to 'claimed', which is the same status the
  // existing give-away/claim flow already produces, so it plugs straight
  // into the manager's existing swap-approval pipeline.
  const openRequestShift = (emp, day, blockId, blockName, role) => setRequestModal({ emp, day, blockId, blockName, role });

  const submitShiftRequest = async ({ note }) => {
    if (!requestModal || !myId) return;
    setSwapBusy(true);
    try{
      await createShiftSwap(orgId, { weekKey: wKey, day: requestModal.day, blockId: requestModal.blockId, role: requestModal.role, fromEmpId: requestModal.emp.id, claimedByEmpId: myId, status: 'requested', note });
      notify(requestModal.emp.id, 'notif.shiftRequestReceived', { name: me?.name||'', role: requestModal.role, day: t('day.'+requestModal.day) });
      setRequestModal(null);
      reloadSwaps();
    }catch(err){ alert(err.message||'Failed to send request'); }
    finally{ setSwapBusy(false); }
  };

  const acceptShiftRequest = async (swap) => {
    setSwapBusy(true);
    try{
      await updateShiftSwap(swap.id, { status:'claimed' });
      notify(swap.claimedByEmpId, 'notif.shiftRequestAccepted', { name: me?.name||'', role: swap.role, day: t('day.'+swap.day) });
      reloadSwaps();
    }catch(err){ alert(err.message||'Failed'); }
    finally{ setSwapBusy(false); }
  };

  const declineShiftRequest = async (swap) => {
    setSwapBusy(true);
    try{
      await updateShiftSwap(swap.id, { status:'declined' });
      notify(swap.claimedByEmpId, 'notif.shiftRequestDeclined', { day: t('day.'+swap.day) });
      reloadSwaps();
    }catch(err){ alert(err.message||'Failed'); }
    finally{ setSwapBusy(false); }
  };

  const submitTimeOffRequest = async ({ type, startDate, endDate, note }) => {
    if (!myId) return;
    setToBusy(true);
    try{
      const row = await createTimeOffRequest(orgId, { empId: myId, type, startDate, endDate, note });
      setTimeOff(p=>[...p, row]);
      setTimeOffModalOpen(false);
    }catch(err){ alert(err.message||'Failed to submit request'); }
    finally{ setToBusy(false); }
  };

  // Withdraw one of my own still-Pending requests — the UI only ever calls
  // this while status is 'Pending' (see myTimeOff render below), so there's
  // no risk of retracting something a manager already acted on.
  const cancelMyTimeOff = async (id) => {
    setToBusy(true);
    try{
      await deleteTimeOffRequest(id);
      setTimeOff(p=>p.filter(to=>to.id!==id));
    }catch(err){ alert(err.message||'Failed to cancel request'); }
    finally{ setToBusy(false); }
  };

  // Download an .ics file of my own upcoming shifts (this week onward,
  // across every week already loaded into `schedules`) so it can be
  // imported into Google/Apple/Outlook calendar. A live auto-syncing feed
  // would need a public server endpoint (a Supabase Edge Function serving
  // ICS over an unauthenticated URL) — a bigger lift than a one-off
  // download, so this covers the common case for now.
  const exportMyScheduleICS = () => {
    if (!myId) return;
    const fmtDT = (d) => `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}00`;
    const escapeText = (str) => String(str).replace(/[\\,;]/g, m=>'\\'+m);
    const todayIso = todayISO();
    const events = [];
    Object.entries(schedules).forEach(([wk, entry]) => {
      const sched = entry?.schedule;
      if (!sched) return;
      const monday = weekKeyToMonday(wk);
      DAYS.forEach((day,i) => {
        const d = new Date(monday); d.setDate(monday.getDate()+i);
        if (dateToISO(d) < todayIso) return; // upcoming only, not history
        blocks.forEach(b => {
          const a = (sched[day]?.[b.id]||[]).find(x=>x.empId===myId);
          if (!a) return;
          const st = a.start||b.start, en = a.end||b.end;
          const [sh,sm] = st.split(':').map(Number);
          const [eh,em] = en.split(':').map(Number);
          const start = new Date(d.getFullYear(),d.getMonth(),d.getDate(),sh,sm);
          const end = new Date(d.getFullYear(),d.getMonth(),d.getDate(),eh,em);
          if (end<=start) end.setDate(end.getDate()+1); // shift rolls past midnight
          events.push({ uid:`${wk}-${day}-${b.id}-${myId}@rorota.net`, start, end, summary: b.name+(a.role?' · '+a.role:'') });
        });
      });
    });
    events.sort((x,y)=>x.start-y.start);
    const nowStamp = fmtDT(new Date())+'Z';
    const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Rorota//Schedule//EN','CALSCALE:GREGORIAN'];
    events.forEach(ev=>{
      lines.push('BEGIN:VEVENT',`UID:${ev.uid}`,`DTSTAMP:${nowStamp}`,`DTSTART:${fmtDT(ev.start)}`,`DTEND:${fmtDT(ev.end)}`,`SUMMARY:${escapeText(ev.summary)}`,'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    const blob = new Blob([lines.join('\r\n')], { type:'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'my-shifts.ics';
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // A swap references a week by its key, not the currently-viewed offset —
  // reconstruct the actual calendar date so we can check time-off and show
  // a real date, regardless of which week the viewer currently has open.
  const dateForSwap = (swap) => { const mon=weekKeyToMonday(swap.weekKey); const d=new Date(mon); d.setDate(mon.getDate()+DAYS.indexOf(swap.day)); return d; };

  const myOpenRequests  = myId ? swaps.filter(sw=>sw.fromEmpId===myId && (sw.status==='open'||sw.status==='claimed')) : [];
  const requestsForMe   = myId ? swaps.filter(sw=>sw.toEmpId===myId && sw.status==='open') : [];
  // Someone else wants to take over one of MY shifts (proactive request,
  // not something I put up for grabs myself) — needs my accept/decline
  // before it ever becomes a 'claimed' swap the manager sees.
  const shiftRequestsToApprove = myId ? swaps.filter(sw=>sw.fromEmpId===myId && sw.status==='requested') : [];
  // Requests I've sent asking for someone ELSE's shift, still awaiting
  // their answer.
  const myShiftRequests = myId ? swaps.filter(sw=>sw.claimedByEmpId===myId && sw.status==='requested') : [];
  // My own time-off/vacation requests, most recent first — lets me see
  // whether a manager has approved/rejected it yet instead of it being a
  // black box after I submit.
  const myTimeOff = myId ? [...timeOff].filter(to=>to.empId===myId).sort((a,b)=>b.startDate.localeCompare(a.startDate)) : [];
  // Shifts I could take. Being on leave used to disqualify me outright —
  // that's now a warning at claim time instead (claimWarningsFor below), so
  // someone whose plans changed can pick up a shift on a day they'd booked
  // off rather than having to get a manager to cancel the leave first. The
  // two genuinely hard filters stay: a role I don't have, and a block I'm
  // already on (I can't be in two places).
  const openToAnyone    = myId && me ? swaps.filter(sw=>{
    if (sw.status!=='open' || sw.toEmpId || sw.fromEmpId===myId) return false;
    if (!(me.roles||[]).includes(sw.role)) return false;
    const sameWeekSched = schedules[sw.weekKey]?.schedule;
    if (sameWeekSched && (sameWeekSched[sw.day]?.[sw.blockId]||[]).some(a=>a.empId===myId)) return false; // already on that block
    // A slot can now carry several open shifts at once (a busy Saturday
    // needing three waiters). Without this you could claim two of them and
    // sign yourself up to work the same shift twice — one pending claim on a
    // given day+block is enough, the rest stay for other people.
    if (swaps.some(o=>o.claimedByEmpId===myId && o.status==='claimed' && o.weekKey===sw.weekKey && o.day===sw.day && o.blockId===sw.blockId)) return false;
    return true;
  }) : [];

  // What's awkward about me taking this shift — shown as a confirm dialog
  // rather than used to hide it. Same reason codes (and translated labels)
  // the manager's own drag-and-drop warning uses, so both sides of the app
  // describe the same clash identically.
  const claimWarningsFor = (sw) => {
    if(!myId||!me) return [];
    const w=[];
    if(isOnTimeOff(myId,dateForSwap(sw),timeOff)) w.push('leave');
    const wkSched=schedules[sw.weekKey]?.schedule;
    if(wkSched && hasRestConflict(myId,sw.day,sw.blockId,wkSched,blocks)) w.push('rest');
    const b=blocks.find(x=>x.id===sw.blockId);
    if(b&&me.maxHours){
      let h=0;DAYS.forEach(d=>blocks.forEach(bb=>{const a=(wkSched?.[d]?.[bb.id]||[]).find(x=>x.empId===myId);if(a)h+=assignmentHours(a,bb);}));
      if(h+assignmentHours({},b)>me.maxHours) w.push('hours');
    }
    return w;
  };
  // Route every claim through the warning check — the button in the open
  // shifts row, the one in the requests panel, and any future caller.
  const requestClaim = (sw) => {
    const reasons=claimWarningsFor(sw);
    if(reasons.length===0){ claimSwap(sw); return; }
    setClaimWarn({swap:sw,reasons});
  };

  // Badge on the Requests tab — only things needing MY action right now, not
  // a total. A decided time-off request or a claim already waiting on a
  // manager isn't something I can do anything about, so counting those would
  // make the badge nag permanently and stop meaning anything.
  // Everything needing MY decision, as one list, so the nav badge and the
  // "Needs you" card count are the same expression rather than two that can
  // silently drift apart.
  const needsYou = myId ? [...shiftRequestsToApprove, ...requestsForMe, ...openToAnyone] : [];
  const actionableRequests = needsYou.length;

  // Extracted from the Team tab's requests panel so the same markup can also
  // sit above the Week view. Open shifts are first-come-first-served, so
  // burying them in one tab means whoever happens to be on the Team tab wins;
  // showing them on Week too gives everyone the same shot at seeing them.
  // What/when for a swap, in the one format every request row uses:
  // "Thu 14 Aug · Dinner 17:00-23:00" over "Waiter". A weekday alone is
  // ambiguous once a request has sat in the queue for a few days, and
  // without the block you can't tell a lunch from a dinner.
  const swapWhen = (sw) => {
    const b=blocks.find(x=>x.id===sw.blockId);
    return `${t('day.'+sw.day)} ${fmt(dateForSwap(sw))}${b?` \u00b7 ${b.name} ${b.start}\u2013${b.end}`:''}`;
  };

  const openShiftsSection = openToAnyone.length>0 ? (
    <div>
      <SectionLabel>{t('swap.availableToYou')}</SectionLabel>
      <div style={{display:'flex',flexDirection:'column',gap:6}}>
        {openToAnyone.map(sw=>{
          // No fromEmpId = a manager-posted OPEN shift (nobody held it),
          // rather than a coworker giving one away — say so instead of
          // rendering "Given up by ?".
          const isOpenShift=!sw.fromEmpId;
          const from=isOpenShift?null:employees.find(e=>e.id===sw.fromEmpId);
          return(
            <RequestRow key={sw.id} emp={from} accent={isOpenShift}
              badge={isOpenShift?t('swap.badgeOpen'):t('swap.badgeSwap')}
              title={swapWhen(sw)}
              subtitle={`${isOpenShift?t('open.fromManager'):t('swap.by',{name:from?.name||'?'})} \u00b7 ${sw.role}`}>
              <Btn small onClick={()=>requestClaim(sw)} disabled={swapBusy}>{t('swap.take')}</Btn>
            </RequestRow>
          );})}
      </div>
    </div>
  ) : null;

  // Shifts I've claimed that a manager hasn't decided on yet. Without this
  // the shift simply vanished from "open shifts you can take" the moment I
  // took it, with nothing anywhere confirming I'd actually got it — leaving
  // me unsure whether the click registered at all.
  const myPendingClaims = myId ? swaps.filter(sw=>sw.claimedByEmpId===myId && sw.status==='claimed') : [];
  const myPendingClaimsSection = myPendingClaims.length>0 ? (
    <div>
      <SectionLabel>{t('claim.awaitingHeading')}</SectionLabel>
      <div style={{display:'flex',flexDirection:'column',gap:6}}>
        {myPendingClaims.map(sw=>(
          <RequestRow key={sw.id} emp={me} title={swapWhen(sw)} subtitle={sw.role}>
            <span style={{fontSize:11,fontWeight:600,color:T.warning,background:T.warningLight,border:`1px solid ${T.warning}33`,borderRadius:999,padding:'3px 10px',whiteSpace:'nowrap'}}>{t('claim.awaiting')}</span>
          </RequestRow>
        ))}
      </div>
    </div>
  ) : null;

  // The mirror of needsYou: things I've asked for that someone else has to
  // decide. Nothing here is actionable by me, which is exactly why it's
  // separated out rather than interleaved with the list above.
  const waitingOn = myId ? [...myPendingClaims, ...myOpenRequests, ...myShiftRequests] : [];

  // One employee's row in the Team tab's day grid — name cell + day cells
  // with shift chips / time-off / give-away button. Shared between the
  // normal (sortable, role-grouped) list and the sticky "Your Shifts"
  // strip pinned above it, so the pinned copy of your own row renders
  // identically to how it looks in the full list.
  const renderTeamRow = (emp, ri=0, {ignoreSearch=false}={}) => {
    const p=pal(emp), isMe=emp.id===myId, h=empHoursMap[emp.id]||0;
    // Your own pinned "Your Shifts" strip never dims — it's your row, and
    // greying it out while searching for a colleague would be confusing.
    const dim=!ignoreSearch&&!!staffSearch.trim()&&!emp.name.toLowerCase().includes(staffSearch.trim().toLowerCase());
    return (
      <div style={{display:'grid',gridTemplateColumns:`${isMobile?130:180}px repeat(7,1fr)`,minWidth:isMobile?550:700,borderBottom:`1px solid ${T.border}`,background:isMe?(isDark()?T.accent+'18':T.accentLight):ri%2===1?T.surfaceWarm:T.surface,opacity:dim?0.25:1,filter:dim?'grayscale(1)':'none',transition:'background 0.2s,opacity 0.15s,filter 0.15s'}}>
        {/* Name */}
        <div style={{padding:isMobile?'10px 10px':'12px 16px',borderRight:`1px solid ${T.border}`,display:'flex',alignItems:'center',gap:isMobile?6:10,minHeight:72,position:'relative'}}>
          {isMe&&<div style={{position:'absolute',left:0,top:0,bottom:0,width:3,background:T.accent,borderRadius:'0 2px 2px 0'}}/>}
          <div style={{width:36,height:36,borderRadius:'50%',background:isMe?T.accent:(isDark()?p.dot+'25':p.bg),color:isMe?'#fff':(isDark()?p.dot:p.text),display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,flexShrink:0,border:isMe?'none':`2px solid ${p.dot}33`}}>{initials(emp.name)}</div>
          <div>
            <div style={{fontSize:13,fontWeight:isMe?700:500,color:isMe?T.accent:T.text}}>{emp.name}</div>
            {isMe&&<div style={{fontSize:10,color:T.text3,marginTop:1}}>{t('emp.hoursThisWeek',{h})}</div>}
          </div>
        </div>
        {/* Days */}
        {DAYS.map((day,di)=>{
          const date=weekDates[di],onTO=isOnTimeOff(emp.id,date,timeOff);
          const assignedBlocks=blocks.filter(b=>(schedule[day]?.[b.id]||[]).some(a=>a.empId===emp.id));
          return(<div key={day} style={{padding:'8px 7px',borderRight:di<6?`1px solid ${T.border}`:'none',display:'flex',flexDirection:'column',gap:4,justifyContent:'center',minHeight:72}}>
            {/* Leave and shifts shown together rather than either/or — same as
                the manager's Team grid. Someone rostered on a day they booked
                off needs to SEE that, not have the shift hidden behind a
                leave card. */}
            {onTO&&(
              <div style={{padding:'7px 9px',borderRadius:7,background:T.warningLight,border:`1px solid ${T.warning}44`,textAlign:'center'}}>
                <div style={{fontSize:11,fontWeight:600,color:T.warning}}>{t('staff.leave')}</div>
              </div>
            )}
            {assignedBlocks.length>0?assignedBlocks.map(b=>{
              const shiftEntry=(schedule[day]?.[b.id]||[]).find(a=>a.empId===emp.id);
              const dispStart=shiftEntry?.start||b.start,dispEnd=shiftEntry?.end||b.end;
              const pendingSwap=isMe&&swaps.find(sw=>sw.weekKey===wKey&&sw.day===day&&sw.blockId===b.id&&sw.fromEmpId===myId&&(sw.status==='open'||sw.status==='claimed'));
              // Same "what actually happened" treatment as the manager's Team
              // tab (TeamView.jsx) — a colored border/dot plus an explicit
              // "Clocked HH:MM–HH:MM" line once someone's punched in, so this
              // isn't only visible from the manager side.
              const clockedInfo=shiftEntry&&(shiftEntry.noShow||shiftEntry.actualStart||shiftEntry.actualEnd);
              const clockStatusColor=shiftEntry?.noShow?T.danger:T.success;
              return(
              <div key={b.id} style={{padding:'8px 10px',borderRadius:8,background:isMe?(isDark()?T.accent+'33':T.accentLight):isDark()?p.dot+'25':p.bg,border:`2px solid ${clockedInfo?clockStatusColor+'99':(isMe?T.accent:p.dot)+'55'}`,position:'relative'}}>
                <div style={{position:'absolute',top:6,right:6,width:6,height:6,borderRadius:'50%',background:clockedInfo?clockStatusColor:(isMe?T.accent:p.dot)}}/>
                <div style={{fontSize:13,fontWeight:700,color:isMe?T.accent:isDark()?p.dot:p.text}}>{b.name}</div>
                <div style={{fontSize:11,color:isMe?T.accentText:isDark()?p.dot+'CC':p.text,opacity:0.85,marginTop:2}}>{dispStart}–{dispEnd}</div>
                <div style={{fontSize:10,color:isMe?T.accentText:isDark()?p.dot+'88':p.text,opacity:0.65,marginTop:1}}>{actualAssignmentHours(shiftEntry||{},b).toFixed(1)}h</div>
                {clockedInfo&&(
                  <div style={{fontSize:10,fontWeight:600,color:clockStatusColor,marginTop:2}}>
                    {shiftEntry.noShow?t('emp.noShow'):`${t('week.clockedLabel')} ${shiftEntry.actualStart||'—'}–${shiftEntry.actualEnd||t('week.clockedOngoing')}`}
                  </div>
                )}
                {isMe&&(pendingSwap?(
                  <div style={{fontSize:9,color:T.accentText,marginTop:4,fontStyle:'italic'}}>{pendingSwap.status==='claimed'?t('swap.statusClaimed',{name:employees.find(e=>e.id===pendingSwap.claimedByEmpId)?.name||'?'}):t('swap.statusOpen')}</div>
                ):(
                  <button onClick={()=>openGiveAway(day,b.id,b.name,shiftEntry.role)} style={{marginTop:5,padding:'3px 8px',borderRadius:6,fontSize:10,fontWeight:500,background:'transparent',border:`1px solid ${T.accent}55`,color:T.accentText,cursor:'pointer',fontFamily:'inherit'}}>{t('swap.giveAway')}</button>
                ))}
                {/* Asking a coworker for THEIR shift — only offered for a
                    role I actually have, and only if nothing's already in
                    flight for this exact shift (it's already offered up,
                    already claimed, or I've already asked for it). */}
                {!isMe&&myId&&shiftEntry?.role&&(()=>{
                  const existingSwap=swaps.find(sw=>sw.weekKey===wKey&&sw.day===day&&sw.blockId===b.id&&sw.fromEmpId===emp.id&&['open','claimed','requested'].includes(sw.status));
                  if(existingSwap) return existingSwap.status==='requested'&&existingSwap.claimedByEmpId===myId
                    ?<div style={{fontSize:9,color:T.accentText,marginTop:4,fontStyle:'italic'}}>{t('swap.requestSent')}</div>
                    :null;
                  if(!(me?.roles||[]).includes(shiftEntry.role)) return null;
                  return <button onClick={()=>openRequestShift(emp,day,b.id,b.name,shiftEntry.role)} style={{marginTop:5,padding:'3px 8px',borderRadius:6,fontSize:10,fontWeight:500,background:'transparent',border:`1px solid ${p.dot}55`,color:isDark()?p.dot:p.text,cursor:'pointer',fontFamily:'inherit'}}>{t('swap.requestShift')}</button>;
                })()}
              </div>
            );}):onTO?null:(
              <div style={{height:46,borderRadius:7,border:`1.5px dashed ${T.border}`,display:'flex',alignItems:'center',justifyContent:'center',opacity:0.3}}>
                <span style={{fontSize:16,color:T.text3}}>—</span>
              </div>
            )}
          </div>);
        })}
      </div>
    );
  };

  // A day-by-day row of shifts nobody holds yet, laid out on exactly the same
  // 7-column grid as renderTeamRow so it lines up with the employee rows
  // beneath it — same idea as the pinned "Your Shifts" strip, but for work
  // that's up for grabs. Covers both manager-posted open shifts (no
  // fromEmpId) and coworker release-to-anyone offers, since from the reader's
  // point of view both are "a shift you could take".
  //
  // A day can hold several at once, so each cell stacks them rather than
  // showing only the first — the whole point is seeing that Thursday needs
  // three people, not one.
  const openShiftsThisWeek = swaps.filter(sw=>sw.weekKey===wKey && !sw.toEmpId && (sw.status==='open'||sw.status==='claimed'));
  const claimableIds = new Set(openToAnyone.map(sw=>sw.id));
  const renderOpenShiftsRow = () => (
    <div style={{display:'grid',gridTemplateColumns:`${isMobile?130:180}px repeat(7,1fr)`,minWidth:isMobile?550:700,background:T.surface}}>
      <div style={{padding:isMobile?'10px 10px':'12px 16px',borderRight:`1px solid ${T.border}`,display:'flex',alignItems:'center',gap:isMobile?6:10,minHeight:72}}>
        <div style={{width:36,height:36,borderRadius:'50%',background:T.accent+'22',color:T.accent,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,fontWeight:700,flexShrink:0,border:`2px dashed ${T.accent}55`}}>?</div>
        <div style={{fontSize:13,fontWeight:700,color:T.accentText}}>{t('open.rowLabel')}</div>
      </div>
      {DAYS.map((day,di)=>{
        const forDay=openShiftsThisWeek.filter(sw=>sw.day===day);
        return(<div key={day} style={{padding:'8px 7px',borderRight:di<6?`1px solid ${T.border}`:'none',display:'flex',flexDirection:'column',gap:4,justifyContent:'center',minHeight:72}}>
          {forDay.length===0?(
            <div style={{height:46,borderRadius:7,border:`1.5px dashed ${T.border}`,display:'flex',alignItems:'center',justifyContent:'center',opacity:0.3}}>
              <span style={{fontSize:16,color:T.text3}}>—</span>
            </div>
          ):forDay.map(sw=>{
            const b=blocks.find(x=>x.id===sw.blockId);
            const claimant=sw.claimedByEmpId?employees.find(e=>e.id===sw.claimedByEmpId):null;
            const canTake=claimableIds.has(sw.id);
            return(
              <div key={sw.id} style={{padding:'8px 10px',borderRadius:8,background:T.accentLight,border:`2px dashed ${T.accent}66`,position:'relative'}}>
                <div style={{fontSize:13,fontWeight:700,color:T.accentText}}>{b?.name||t('open.posted')}</div>
                {b&&<div style={{fontSize:11,color:T.accentText,opacity:0.85,marginTop:2}}>{b.start}–{b.end}</div>}
                <div style={{fontSize:10,color:T.accentText,opacity:0.7,marginTop:1}}>{sw.role}</div>
                {sw.status==='claimed'?(
                  // "Claimed by <my own name>" reads oddly when it's me —
                  // say it's mine and pending instead.
                  <div style={{fontSize:9,fontWeight:600,marginTop:4,color:sw.claimedByEmpId===myId?T.warning:T.accentText,fontStyle:sw.claimedByEmpId===myId?'normal':'italic'}}>
                    {sw.claimedByEmpId===myId?t('claim.awaiting'):t('swap.statusClaimed',{name:claimant?.name||'?'})}
                  </div>
                ):canTake?(
                  <button onClick={()=>requestClaim(sw)} disabled={swapBusy} style={{marginTop:5,padding:'3px 8px',borderRadius:6,fontSize:10,fontWeight:600,background:T.accent,border:'none',color:'#fff',cursor:swapBusy?'wait':'pointer',fontFamily:'inherit'}}>{t('swap.take')}</button>
                ):null}
              </div>
            );
          })}
        </div>);
      })}
    </div>
  );

  return (<>
    <div style={{minHeight:'100vh',width:'100%',background:T.bg,backgroundImage:isDark()?'radial-gradient(circle at 12% 6%, rgba(217,122,74,0.07), transparent 38%), radial-gradient(circle at 88% 94%, rgba(95,174,122,0.06), transparent 42%)':'radial-gradient(circle at 12% 6%, rgba(191,90,44,0.045), transparent 38%), radial-gradient(circle at 88% 94%, rgba(61,122,82,0.04), transparent 42%)',backgroundAttachment:'fixed',fontFamily:"'Hanken Grotesk',sans-serif",color:T.text,fontSize:13}}>
      {/* Nav */}
      <div style={{background:T.surface,borderBottom:`1px solid ${T.border}`,padding:isMobile?'0 12px':'0 24px',display:'flex',alignItems:'center',gap:isMobile?6:0,height:56,position:'sticky',top:0,zIndex:100,boxShadow:'0 2px 14px -8px rgba(33,27,21,0.15)'}}>
        <div style={{display:'flex',alignItems:'baseline',gap:9,flex:1,minWidth:0,overflow:'hidden'}}>
          {/* Logo doubles as a home button, same as the manager view — back to
              the schedule with nothing isolated. Doesn't change which week
              you're looking at. */}
          <button onClick={()=>{setView('schedule');setCalMode('team');setDayFilter(null);}} title={t('nav.schedule')} style={{fontFamily:'Fraunces, Georgia, serif',fontSize:isMobile?18:21,fontWeight:600,color:T.text,letterSpacing:'-0.02em',flexShrink:0,background:'none',border:'none',padding:0,cursor:'pointer',transition:'opacity 0.15s'}} onMouseEnter={e=>e.currentTarget.style.opacity=0.7} onMouseLeave={e=>e.currentTarget.style.opacity=1}>Rorota</button>
          <span style={{fontSize:11,color:T.text3,fontWeight:500,letterSpacing:'0.03em',textTransform:'uppercase',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{orgName}</span>
        </div>
        {!isMobile&&(()=>{const rc=MEMBERSHIP_ROLE_COLORS[role]||MEMBERSHIP_ROLE_COLORS.employee;return(<span style={{fontSize:11,fontWeight:600,padding:'3px 10px',borderRadius:999,marginRight:8,background:isDark()?rc.text+'22':rc.bg,color:rc.text,border:`1px solid ${isDark()?rc.text+'44':rc.border}`,flexShrink:0}}>{t('team.role'+(role.charAt(0).toUpperCase()+role.slice(1)))}</span>);})()}
        {/* Underline tabs, matching the manager Dashboard's primary nav
            (App.jsx) — was previously a segmented pill, the same visual
            pattern this app already uses for secondary filters (Week/Team/
            Month toggles below), which made the two top-level experiences
            read as differently-designed apps rather than one product. */}
        <div style={{display:'flex',alignItems:'center',height:56,marginRight:isMobile?4:16,flexShrink:0}}>
          {/* Requests gets its own tab, same as the manager's — open shifts,
              swap requests and time off used to be one tall stacked card
              sitting on top of the schedule, which pushed the actual rota
              down the page and showed open shifts a third time (they're
              already a row in the grid below and a section on Week). The
              count badge is only for things needing YOUR action, so it
              doesn't nag about requests already decided. */}
          {[['schedule',t('nav.schedule')],['requests',t('nav.timeoff')],['employees',t('sched.directory')],['profile',t('nav.profile')]].map(([k,l])=>{const active=view===k;const badge=k==='requests'?actionableRequests:0;return(
            <button key={k} onClick={()=>setView(k)} style={{fontFamily:'inherit',padding:isMobile?'0 10px':'0 16px',height:56,background:'none',border:'none',cursor:'pointer',fontSize:isMobile?12:13,fontWeight:active?500:400,color:active?T.text:T.text2,position:'relative',transition:'color 0.15s',whiteSpace:'nowrap'}}>{l}{badge>0&&<span style={{marginLeft:5,fontSize:10,fontWeight:700,color:'#fff',background:T.accent,borderRadius:999,padding:'1px 6px'}}>{badge}</span>}{active&&<div style={{position:'absolute',bottom:0,left:isMobile?10:16,right:isMobile?10:16,height:2,background:T.accent,borderRadius:'2px 2px 0 0'}}/>}</button>
          );})}
        </div>
        <span style={{marginRight:isMobile?6:10}}><Btn small variant="ghost" onClick={()=>setTimeOffModalOpen(true)}>{t('to.request')}</Btn></span>
        <select value={lang} onChange={e=>setLang(e.target.value)} style={{fontFamily:'inherit',fontSize:12,color:T.text2,background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:'6px 8px',marginRight:isMobile?0:8,cursor:'pointer',outline:'none',flexShrink:0}}>{LANGUAGES.map(L=><option key={L.code} value={L.code}>{isMobile?L.code.toUpperCase():L.label}</option>)}</select>
        <span style={{marginRight:isMobile?0:10}}><NotificationBell empId={myId} t={t} lang={lang} onNavigate={link=>{setView('schedule');setCalMode('team');if(link?.weekOffset!=null)setWeekOffset(link.weekOffset);}} messages={myId?messages:undefined} onOpenMessage={handleOpenMessage}/></span>
        <button onClick={toggleTheme} style={{width:34,height:34,marginRight:isMobile?0:10,borderRadius:8,border:`1px solid ${T.border}`,background:T.surface,color:T.text2,cursor:'pointer',fontSize:15,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{isDark()?'☀':'☾'}</button>
        <button onClick={()=>supabase.auth.signOut()} style={{padding:isMobile?'6px 10px':'6px 14px',borderRadius:8,border:`1px solid ${T.border}`,background:T.surface,color:T.text2,cursor:'pointer',fontSize:12,fontFamily:'inherit',flexShrink:0,whiteSpace:'nowrap'}}>{t('common.logout')}</button>
      </div>

      <div style={{padding:isMobile?'16px 12px':'24px 28px'}}>
      {view==='profile' ? (
        <ProfileSettings role={role} myEmp={me} orgId={orgId} onSaveName={saveMyName} onSaveColor={saveMyColor} onSavePhone={saveMyPhone} onSaveAvailability={saveMyAvailability} onSaveEmailNotifications={saveMyEmailNotifications} onSavePushPrefs={saveMyPushPrefs} weekHours={empHoursMap[myId]||0} weekCorrected={empCorrectedMap[myId]||0} monthHours={myMonthHours} monthCorrected={myMonthCorrected} s={s} t={t}/>
      ) : view==='employees' ? (
        <Directory employees={employees} myId={myId} roleStyles={roleStyles} roleColorFor={roleColorFor} s={s} t={t}/>
      ) : view==='requests' ? (
        <>
          {/* Page header. "Request time off" belongs up here beside the title,
              not floating below the card — as a trailing button it read as
              unrelated to anything above it. */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginBottom:12}}>
            <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:18,fontWeight:500,color:T.text}}>{t('nav.timeoff')}</div>
            <Btn small onClick={()=>setTimeOffModalOpen(true)}>{t('to.request')}</Btn>
          </div>
          {/* Three cards, not one. Previously all six lists were stacked
              inside a single card separated only by small grey labels, so
              things waiting on YOU sat in the same visual box as things you
              were waiting on SOMEONE ELSE for. Those demand opposite
              reactions, and the first is the only reason to open this page —
              it now comes first, in its own card, with a count. */}
          {myId && (needsYou.length>0 || waitingOn.length>0 || myTimeOff.length>0) ? (<>
            {needsYou.length>0 && (
              <div style={{...s.card,marginBottom:12,display:'flex',flexDirection:'column',gap:14,borderLeft:`3px solid ${T.accent}`}}>
                <div style={{display:'flex',alignItems:'baseline',gap:8}}>
                  <span style={{fontFamily:'Fraunces, Georgia, serif',fontSize:15,fontWeight:500,color:T.text}}>{t('req.needsYou')}</span>
                  <span style={{fontSize:11,fontWeight:700,color:'#fff',background:T.accent,borderRadius:999,padding:'1px 7px'}}>{needsYou.length}</span>
                </div>
                {shiftRequestsToApprove.length>0 && (<div>
                  <SectionLabel>{t('swap.requestsForYourShifts')}</SectionLabel>
                  <div style={{display:'flex',flexDirection:'column',gap:6}}>
                    {shiftRequestsToApprove.map(sw=>{const asker=employees.find(e=>e.id===sw.claimedByEmpId);return(
                      <RequestRow key={sw.id} emp={asker} badge={t('swap.badgeSwap')} title={swapWhen(sw)}
                        subtitle={`${t('swap.wantsYourShift',{name:asker?.name||'?'})} \u00b7 ${sw.role}`}>
                        <Btn small onClick={()=>acceptShiftRequest(sw)} disabled={swapBusy}>{t('swap.accept')}</Btn>
                        <Btn small variant="ghost" onClick={()=>declineShiftRequest(sw)} disabled={swapBusy}>{t('swap.decline')}</Btn>
                      </RequestRow>
                    );})}
                  </div>
                </div>)}
                {requestsForMe.length>0 && (<div>
                  <SectionLabel>{t('swap.requestsForYou')}</SectionLabel>
                  <div style={{display:'flex',flexDirection:'column',gap:6}}>
                    {requestsForMe.map(sw=>{const from=employees.find(e=>e.id===sw.fromEmpId);return(
                      <RequestRow key={sw.id} emp={from} badge={t('swap.badgeSwap')} title={swapWhen(sw)}
                        subtitle={`${t('swap.by',{name:from?.name||'?'})} \u00b7 ${sw.role}`}>
                        <Btn small onClick={()=>claimSwap(sw)} disabled={swapBusy}>{t('swap.accept')}</Btn>
                        <Btn small variant="ghost" onClick={()=>declineSwap(sw)} disabled={swapBusy}>{t('swap.decline')}</Btn>
                      </RequestRow>
                    );})}
                  </div>
                </div>)}
                {openShiftsSection}
              </div>
            )}
            {waitingOn.length>0 && (
              <div style={{...s.card,marginBottom:12,display:'flex',flexDirection:'column',gap:14}}>
                <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:15,fontWeight:500,color:T.text}}>{t('req.waiting')}</div>
                {myPendingClaimsSection}
                {myOpenRequests.length>0 && (<div>
                  <SectionLabel>{t('swap.myRequests')}</SectionLabel>
                  <div style={{display:'flex',flexDirection:'column',gap:6}}>
                    {myOpenRequests.map(sw=>{const to=sw.toEmpId?employees.find(e=>e.id===sw.toEmpId):null,claimant=sw.claimedByEmpId?employees.find(e=>e.id===sw.claimedByEmpId):null;return(
                      <RequestRow key={sw.id} emp={me} badge={to?t('swap.badgeSwap'):t('swap.badgeOpen')} title={swapWhen(sw)}
                        subtitle={`${sw.role} \u00b7 ${to?t('swap.requestedTo',{name:to.name}):t('swap.openToAnyone')}`}>
                        <span style={{fontSize:11,color:sw.status==='claimed'?T.success:T.text3,whiteSpace:'nowrap'}}>{sw.status==='claimed'?t('swap.statusClaimed',{name:claimant?.name||'?'}):t('swap.statusOpen')}</span>
                        {sw.status==='open' && <Btn small variant="danger" onClick={()=>cancelSwap(sw)} disabled={swapBusy}>{t('swap.cancel')}</Btn>}
                      </RequestRow>
                    );})}
                  </div>
                </div>)}
                {myShiftRequests.length>0 && (<div>
                  <SectionLabel>{t('swap.myShiftRequests')}</SectionLabel>
                  <div style={{display:'flex',flexDirection:'column',gap:6}}>
                    {myShiftRequests.map(sw=>{const owner=employees.find(e=>e.id===sw.fromEmpId);return(
                      <RequestRow key={sw.id} emp={owner} badge={t('swap.badgeSwap')} title={swapWhen(sw)}
                        subtitle={`${t('swap.askedFor',{name:owner?.name||'?'})} \u00b7 ${sw.role}`}>
                        <span style={{fontSize:11,color:T.text3,whiteSpace:'nowrap'}}>{t('swap.requestSent')}</span>
                      </RequestRow>
                    );})}
                  </div>
                </div>)}
              </div>
            )}
            {myTimeOff.length>0 && (
              <div style={{...s.card,display:'flex',flexDirection:'column',gap:8}}>
                <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:15,fontWeight:500,color:T.text}}>{t('to.yourRequests')}</div>
                {myTimeOff.map(to=>(
                  <RequestRow key={to.id} emp={me}
                    title={`${fmtLong(to.startDate)}${to.endDate!==to.startDate?' \u2013 '+fmtLong(to.endDate):''}`}
                    subtitle={to.type}>
                    {/* StatusBadge instead of bare coloured text: the same
                        approved/pending/rejected treatment the manager sees,
                        so a status means the same thing on both sides. */}
                    <StatusBadge status={to.status} label={t('to.'+to.status.toLowerCase())}/>
                    {to.status==='Pending' && <Btn small variant="ghost" onClick={()=>cancelMyTimeOff(to.id)} disabled={toBusy}>{t('to.cancel')}</Btn>}
                  </RequestRow>
                ))}
              </div>
            )}
          </>) : myId ? (
            /* Was reusing notif.empty ("Nothing yet") — a NOTIFICATIONS
               string on a requests page, which told you nothing about what
               this page is for or how to put something on it. */
            <div style={{...s.card,padding:'44px 24px',textAlign:'center'}}>
              <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:18,color:T.text,marginBottom:6}}>{t('req.emptyTitle')}</div>
              <div style={{fontSize:13,color:T.text3}}>{t('req.emptyDesc')}</div>
            </div>
          ) : null}
        </>
      ) : (<>
        {/* Week/Month nav — sticky under the app header, same as the
            manager's schedule bar. Its measured height feeds the "Your
            Shifts" strip's own sticky offset below, so the two dock
            underneath each other instead of overlapping; measured rather
            than hardcoded because this bar wraps to two lines on narrow
            screens and with longer translated labels. */}
        <div ref={navBarRef} style={{display:'flex',alignItems:'center',gap:8,marginBottom:12,flexWrap:'wrap',position:'sticky',top:56,zIndex:20,background:T.bg,backgroundImage:isDark()?'radial-gradient(circle at 12% 6%, rgba(217,122,74,0.07), transparent 38%), radial-gradient(circle at 88% 94%, rgba(95,174,122,0.06), transparent 42%)':'radial-gradient(circle at 12% 6%, rgba(191,90,44,0.045), transparent 38%), radial-gradient(circle at 88% 94%, rgba(61,122,82,0.04), transparent 42%)',backgroundAttachment:'fixed',paddingTop:8,paddingBottom:8}}>
          <div style={{display:'flex',alignItems:'center',gap:4,background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:3}}>
            <button onClick={()=>{if(calMode==='month'){setDisplayMonth(p=>p.m===0?{y:p.y-1,m:11}:{y:p.y,m:p.m-1});}else if(calMode==='week'&&dayFilter){shiftDay(-1);}else{setWeekOffset(w=>w-1);}}} style={{padding:'4px 12px',borderRadius:6,background:'none',border:'none',cursor:'pointer',color:T.text2,fontFamily:'inherit',fontSize:14}}>‹</button>
            <WeekPicker
              value={calMode==='month'?new Date(displayMonth.y,displayMonth.m,1):weekDates[0]}
              highlightStart={calMode==='month'?null:(calMode==='week'&&dayFilter?weekDates[DAYS.indexOf(dayFilter)]:weekDates[0])}
              highlightEnd={calMode==='month'?null:(calMode==='week'&&dayFilter?weekDates[DAYS.indexOf(dayFilter)]:weekDates[6])}
              onPick={d=>{
                if(calMode==='month'){ setDisplayMonth({y:d.getFullYear(),m:d.getMonth()}); return; }
                setWeekOffset(weekOffsetFromDate(d));
                if(calMode==='week'&&dayFilter){ const dow=d.getDay(); setDayFilter(DAYS[dow===0?6:dow-1]); }
              }}
              trigger={<span style={{fontSize:14,fontWeight:500,minWidth:isMobile?130:160,textAlign:'center',color:T.text,padding:'0 4px',display:'inline-block'}}>{calMode==='month'?new Date(displayMonth.y,displayMonth.m,1).toLocaleDateString(LOCALE,{month:'long',year:'numeric'}):calMode==='week'&&dayFilter?`${t('day.'+dayFilter)} ${fmt(weekDates[DAYS.indexOf(dayFilter)])}`:`${fmt(weekDates[0])} – ${fmt(weekDates[6])}`}</span>}
            />
            <button onClick={()=>{if(calMode==='month'){setDisplayMonth(p=>p.m===11?{y:p.y+1,m:0}:{y:p.y,m:p.m+1});}else if(calMode==='week'&&dayFilter){shiftDay(1);}else{setWeekOffset(w=>w+1);}}} style={{padding:'4px 12px',borderRadius:6,background:'none',border:'none',cursor:'pointer',color:T.text2,fontFamily:'inherit',fontSize:14}}>›</button>
          </div>
          {/* Same behaviour as the manager's Today: land on today itself, not
              merely today's week. Month stays on month — there "today" means
              the current month, and jumping to a single day would overshoot. */}
          <button onClick={()=>{
            const n=new Date();
            setWeekOffset(0);
            setDisplayMonth({y:n.getFullYear(),m:n.getMonth()});
            if(calMode!=='month'){
              const jsDay=n.getDay();
              setCalMode('week');
              setDayFilter(DAYS[jsDay===0?6:jsDay-1]);
            }
          }} style={{padding:'5px 12px',borderRadius:8,background:T.surface,border:`1px solid ${T.border}`,cursor:'pointer',fontSize:12,color:T.text2,fontFamily:'inherit'}}>{t('common.today')}</button>
          {calMode!=='month'&&schedules[wKey]?.confirmed && <span style={{fontSize:12,color:T.success,fontWeight:500,background:T.successLight,padding:'2px 10px',borderRadius:999,border:`1px solid ${T.success}33`}}>✓ {t('emp.published')}</span>}
          {myId && <Btn small variant="ghost" onClick={exportMyScheduleICS}>{t('emp.exportSchedule')}</Btn>}
          {/* Same staff search the manager has, behaving the same way (dim,
              don't hide) — an employee looking for who else is on Friday has
              exactly the same question as a manager does. */}
          {calMode!=='month'&&(
            <span style={{position:'relative',display:'inline-flex',alignItems:'center'}}>
              <input value={staffSearch} onChange={e=>setStaffSearch(e.target.value)} placeholder={t('week.searchStaff')} style={{...s.input,width:150,padding:'5px 26px 5px 10px',fontSize:12}}/>
              {staffSearch&&<button onClick={()=>setStaffSearch('')} title={t('common.cancel')} style={{position:'absolute',right:6,background:'none',border:'none',cursor:'pointer',color:T.text3,fontSize:13,lineHeight:1,padding:2,fontFamily:'inherit'}}>✕</button>}
            </span>
          )}
          <div style={{display:'flex',alignItems:'center',gap:2,background:T.surfaceWarm,border:`1px solid ${T.border}`,borderRadius:8,padding:3,marginLeft:'auto'}}>
            {[['team',t('sched.team')],['week',t('sched.week')],['month',t('sched.month')]].map(([k,l])=><button key={k} onClick={()=>setCalMode(k)} style={{fontFamily:'inherit',padding:'4px 12px',borderRadius:6,background:calMode===k?T.bg:'transparent',border:calMode===k?`1px solid ${T.border}`:'1px solid transparent',cursor:'pointer',fontSize:12,fontWeight:calMode===k?500:400,color:calMode===k?T.text:T.text2}}>{l}</button>)}
          </div>
        </div>

        {calMode==='month' ? (
          <MonthView monthOff={monthOff} schedules={schedules} weekOffset={weekOffset} setWeekOffset={setWeekOffset} setCalMode={setCalMode} displayMonth={displayMonth} blocks={blocks} allRoles={allRoles} employees={employees} timeOff={timeOff} generate={()=>{}} deleteMonth={()=>{}} readOnly s={s} t={t}/>
        ) : calMode==='week' ? (<>
          {/* Pinned above the week itself — a shift anyone can claim is worth
              seeing before you start reading your own rota, and it's gone
              once someone else takes it. */}
          <DayTimeline schedule={schedule} blocks={blocks} employees={employees} allRoles={allRoles} dayFilter={dayFilter} setDayFilter={setDayFilter} weekDates={weekDates} myId={myId} isMobile={isMobile} gridGroupBy={gridGroupBy} roleStyles={roleStyles} roleColorFor={roleColorFor} s={s} t={t}/>
        </>) : (<>


        <div style={{display:'flex',justifyContent:'flex-end',marginBottom:10}}>
          <div style={{display:'flex',background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:3,gap:2}}>
            {[['name',t('grid.byName')],['role',t('grid.byRole')]].map(([k,l])=><button key={k} onClick={()=>setGridGroupBy(k)} style={{padding:'4px 12px',borderRadius:6,background:gridGroupBy===k?T.bg:'transparent',border:gridGroupBy===k?`1px solid ${T.border}`:'1px solid transparent',cursor:'pointer',fontSize:12,fontWeight:gridGroupBy===k?500:400,color:gridGroupBy===k?T.text:T.text2,fontFamily:'inherit'}}>{l}</button>)}
          </div>
        </div>

        {!schedule ? (
          <div style={{...s.card,textAlign:'center',padding:'52px 32px',position:'relative',overflow:'hidden'}}>
            <div style={{position:'absolute',inset:0,backgroundImage:`radial-gradient(circle, ${T.border} 1px, transparent 1px)`,backgroundSize:'24px 24px',opacity:0.5,pointerEvents:'none'}}/>
            <div style={{position:'relative'}}>
              <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:22,fontWeight:500,color:T.text,marginBottom:8}}>{t('emp.noScheduleTitle')}</div>
              <div style={{fontSize:13,color:T.text2}}>{t('emp.noScheduleDesc')}</div>
            </div>
          </div>
        ) : (<>
          {/* Pinned copy of your own row, sticky just below the top nav —
              so it stays in view while scrolling through the full team
              list below instead of having to scroll to find yourself.
              Same solid-color-over-gradient-background trick every other
              sticky bar in the app uses (App.jsx's schedule nav, TeamView's
              grid controls) — a plain flat T.bg here would cut a visible
              flat rectangle out of the page's ambient radial-gradient
              backdrop as it scrolls over content, instead of blending in. */}
          {me && (
            <div style={{position:'sticky',top:(isMobile?50:56)+navBarH,zIndex:15,background:T.bg,backgroundImage:isDark()?'radial-gradient(circle at 12% 6%, rgba(217,122,74,0.07), transparent 38%), radial-gradient(circle at 88% 94%, rgba(95,174,122,0.06), transparent 42%)':'radial-gradient(circle at 12% 6%, rgba(191,90,44,0.045), transparent 38%), radial-gradient(circle at 88% 94%, rgba(61,122,82,0.04), transparent 42%)',backgroundAttachment:'fixed',paddingTop:8,paddingBottom:10}}>
              <div style={{fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}}>{t('emp.yourShifts')}</div>
              <div style={{...s.cardFlush,overflowX:'auto',overflowY:'visible',WebkitOverflowScrolling:'touch',border:`1.5px solid ${T.accent}55`,boxShadow:'0 8px 20px -10px rgba(33,27,21,0.3)'}}>
                {renderTeamRow(me,0,{ignoreSearch:true})}
              </div>
            </div>
          )}
          {/* Shifts nobody holds yet, on the same 7-day grid as the team list
              below so the columns line up. Sits under "Your Shifts" because
              it's the same kind of thing — a summary strip you scan before
              reading the full roster — and only appears when there's actually
              something up for grabs. */}
          {myId && openShiftsThisWeek.length>0 && (
            <div style={{marginBottom:12}}>
              <div style={{fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}}>{t('open.rowLabel')}</div>
              <div style={{...s.cardFlush,overflowX:'auto',overflowY:'visible',WebkitOverflowScrolling:'touch',border:`1.5px dashed ${T.accent}55`}}>
                {renderOpenShiftsRow()}
              </div>
            </div>
          )}
          <div style={{...s.cardFlush,overflowX:'auto',overflowY:'visible',WebkitOverflowScrolling:'touch'}}>
            {/* Header */}
            <div style={{display:'grid',gridTemplateColumns:`${isMobile?130:180}px repeat(7,1fr)`,minWidth:isMobile?550:700,borderBottom:`2px solid ${T.border}`,background:T.surfaceWarm}}>
              <div style={{padding:isMobile?'12px 12px':'14px 20px',fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.08em',borderRight:`1px solid ${T.border}`}}>{t('sched.team')}</div>
              {DAYS.map((day,i)=>{
                const date=weekDates[i],isToday=dateToISO(date)===dateToISO(new Date());
                return(<button key={day} onClick={()=>{setDayFilter(day);setCalMode('week');}} title={t('week.isolateDay')} style={{padding:isMobile?'12px 6px':'14px 12px',textAlign:'center',borderTop:'none',borderLeft:'none',borderBottom:isToday?`2px solid ${T.accent}`:'none',borderRight:i<6?`1px solid ${T.border}`:'none',background:isToday?T.accentLight:'transparent',cursor:'pointer',fontFamily:'inherit',width:'100%',boxSizing:'border-box',outline:'none'}} onMouseEnter={e=>{e.currentTarget.style.background=isToday?T.accentLight:T.surface;}} onMouseLeave={e=>{e.currentTarget.style.background=isToday?T.accentLight:'transparent';}}>
                  <div style={{fontSize:13,fontWeight:600,color:isToday?T.accent:T.text}}>{t('day.'+day)}</div>
                  <div style={{fontSize:11,color:isToday?T.accent:T.text3,marginTop:1}}>{date.getDate()} {date.toLocaleDateString(LOCALE,{month:'short'})}</div>
                </button>);
              })}
            </div>
            {/* Employee rows */}
            {gridRows.map((row,ri)=>{
              const emp=row.emp;
              const prevRole=ri>0?gridRows[ri-1].role:undefined;
              const showDivider=gridGroupBy==='role'&&row.role!==prevRole;
              const roleCollapsed=gridGroupBy==='role'&&row.role&&collapsedRoles.has(row.role);
              return(
                <div key={`${row.role||'all'}-${emp.id}`}>
                {showDivider&&<div
                  onClick={()=>toggleRoleCollapse(row.role)}
                  draggable
                  onDragStart={()=>setDragRole(row.role)}
                  onDragEnd={()=>{setDragRole(null);setDragOverRole(null);}}
                  onDragOver={e=>{if(dragRole&&dragRole!==row.role){e.preventDefault();if(dragOverRole!==row.role)setDragOverRole(row.role);}}}
                  onDragLeave={()=>{if(dragOverRole===row.role)setDragOverRole(null);}}
                  onDrop={e=>{e.preventDefault();reorderRoles(dragRole,row.role);setDragRole(null);setDragOverRole(null);}}
                  style={{padding:'6px '+(isMobile?'12px':'20px'),background:T.surfaceWarm,borderBottom:`1px solid ${T.border}`,borderTop:dragOverRole===row.role?`2px solid ${T.accent}`:ri>0?`2px solid ${T.border}`:'none',cursor:'grab',userSelect:'none',display:'flex',alignItems:'center',gap:8,opacity:dragRole===row.role?0.5:1,transition:'opacity 0.15s,border-color 0.15s'}}>
                  <GripDots title={t('grid.dragToReorder')}/>
                  <span style={{fontSize:9,color:T.text3,transform:roleCollapsed?'rotate(-90deg)':'none',transition:'transform 0.15s',display:'inline-block'}}>▾</span>
                  <RoleBadge role={row.role} rs={roleStyles[row.role] || roleColorFor(row.role)}/>
                </div>}
                {!roleCollapsed && renderTeamRow(emp, ri)}
                </div>
              );
            })}
            {/* Footer */}
            <div style={{display:'grid',gridTemplateColumns:`${isMobile?130:180}px repeat(7,1fr)`,minWidth:isMobile?550:700,background:T.surfaceWarm,borderTop:`2px solid ${T.border}`}}>
              <div style={{padding:isMobile?'10px 12px':'10px 20px',fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em',borderRight:`1px solid ${T.border}`,display:'flex',alignItems:'center'}}>{t('grid.totalLabel')}</div>
              {DAYS.map((day,di)=>{
                const count=[...new Set(blocks.flatMap(b=>(schedule[day]?.[b.id]||[]).map(a=>a.empId)))].length;
                const onLeave=employees.filter(e=>isOnTimeOff(e.id,weekDates[di],timeOff)).length;
                return(<div key={day} style={{padding:'10px 12px',textAlign:'center',borderRight:di<6?`1px solid ${T.border}`:'none'}}>
                  <div style={{fontSize:15,fontWeight:700,color:count===0?T.text3:T.text}}>{count}</div>
                  <div style={{fontSize:10,color:T.text3}}>{t('grid.workingLabel')}</div>
                  {onLeave>0&&<div style={{fontSize:10,color:T.warning,marginTop:2}}>{onLeave} {t('staff.leave')}</div>}
                </div>);
              })}
            </div>
          </div>
        </>)}
        </>)}
      </>)}
      </div>
    </div>
    {swapModal && createPortal(<GiveAwayModal modal={swapModal} employees={employees} myId={myId} busy={swapBusy} onCancel={()=>setSwapModal(null)} onSubmit={submitGiveAway} s={s} t={t}/>, document.body)}
    {/* Taking a shift that clashes with something — being on leave that day
        being the common one. Never blocks the claim, just makes sure it's a
        deliberate choice rather than something noticed later. */}
    {claimWarn && createPortal(
      <div onClick={()=>setClaimWarn(null)} style={{position:'fixed',inset:0,zIndex:400,background:'rgba(20,16,13,0.5)',display:'flex',alignItems:'center',justifyContent:'center',padding:20,fontFamily:"'Hanken Grotesk',sans-serif"}}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,width:'min(380px,100%)',overflow:'hidden',boxShadow:'0 24px 60px -16px rgba(0,0,0,0.5)'}}>
          <div style={{padding:'16px 18px 4px',fontFamily:'Fraunces, Georgia, serif',fontSize:16,fontWeight:500,color:T.text}}>{t('claim.warnTitle')}</div>
          <div style={{padding:'0 18px 10px',fontSize:12,color:T.text2}}>
            {blocks.find(b=>b.id===claimWarn.swap.blockId)?.name||''} · {claimWarn.swap.role} · {t('day.'+claimWarn.swap.day)}
          </div>
          <div style={{padding:'0 18px 14px',display:'flex',flexDirection:'column',gap:5}}>
            {claimWarn.reasons.map(code=>{
              const label={leave:t('week.reasonLeave'),rest:t('week.reasonRest'),hours:t('week.reasonHours')}[code];
              return <div key={code} style={{fontSize:12,fontWeight:500,color:T.warning,background:T.warningLight,border:`1px solid ${T.warning}33`,borderRadius:8,padding:'6px 10px'}}>{label}</div>;
            })}
          </div>
          <div style={{borderTop:`1px solid ${T.border}`,padding:12,display:'flex',gap:6,alignItems:'center'}}>
            <Btn small variant="warning" disabled={swapBusy} onClick={()=>{const sw=claimWarn.swap;setClaimWarn(null);claimSwap(sw);}}>{t('claim.takeAnyway')}</Btn>
            <span style={{flex:1}}/>
            <Btn small variant="ghost" onClick={()=>setClaimWarn(null)}>{t('common.cancel')}</Btn>
          </div>
        </div>
      </div>
    , document.body)}
    {requestModal && createPortal(<RequestShiftModal modal={requestModal} busy={swapBusy} onCancel={()=>setRequestModal(null)} onSubmit={submitShiftRequest} s={s} t={t}/>, document.body)}
    {timeOffModalOpen && createPortal(<TimeOffRequestModal busy={toBusy} onCancel={()=>setTimeOffModalOpen(false)} onSubmit={submitTimeOffRequest} s={s} t={t}/>, document.body)}
    {openMessage && createPortal(<MessageThreadModal message={openMessage} viewerIsManager={false} myLabel={me?.name||''} counterpartLabel={openMessage.senderLabel} onClose={()=>setOpenMessage(null)} s={s} t={t}/>, document.body)}
    </>
  );
}

// Small standalone modal for posting a shift-swap request — kept separate
// from the main render since it's a self-contained form with its own local
// state (which target-mode is picked, the note text) that doesn't need to
// live on the parent component.
function GiveAwayModal({ modal, employees, myId, busy, onCancel, onSubmit, s, t }){
  const [mode, setMode]   = useState('anyone'); // 'anyone' | 'specific'
  const [toEmpId, setToEmpId] = useState('');
  const [note, setNote]   = useState('');
  const eligible = employees.filter(e=>e.id!==myId && (e.roles||[]).includes(modal.role));

  return (
    <div onClick={onCancel} style={{position:'fixed',inset:0,zIndex:300,background:'rgba(20,16,13,0.5)',display:'flex',alignItems:'center',justifyContent:'center',padding:20,fontFamily:"'Hanken Grotesk',sans-serif"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,width:'min(400px,100%)',padding:20,boxShadow:'0 24px 60px -16px rgba(0,0,0,0.5)'}}>
        <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:16,fontWeight:500,color:T.text,marginBottom:4}}>{t('swap.giveAway')}</div>
        <div style={{fontSize:12,color:T.text3,marginBottom:14}}>{modal.blockName} · {modal.role} · {t('day.'+modal.day)}</div>
        <div style={{display:'flex',gap:6,marginBottom:12}}>
          {[['anyone',t('swap.anyoneEligible')],['specific',t('swap.specificCoworker')]].map(([k,l])=>(
            <button key={k} onClick={()=>setMode(k)} style={{flex:1,padding:'7px 8px',borderRadius:8,fontSize:12,fontWeight:mode===k?600:400,background:mode===k?T.accentLight:'transparent',border:`1px solid ${mode===k?T.accent:T.border}`,color:mode===k?T.accentText:T.text2,cursor:'pointer',fontFamily:'inherit'}}>{l}</button>
          ))}
        </div>
        {mode==='specific' && (
          <div style={{marginBottom:12}}>
            <div style={{fontSize:11,color:T.text3,marginBottom:4}}>{t('swap.choosePerson')}</div>
            <select value={toEmpId} onChange={e=>setToEmpId(e.target.value)} style={s.select}>
              <option value="">—</option>
              {eligible.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
        )}
        <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder={t('swap.notePlaceholder')} rows={2} style={{...s.input,resize:'vertical',marginBottom:14}}/>
        <div style={{display:'flex',gap:8}}>
          <Btn onClick={()=>onSubmit({ toEmpId: mode==='specific' ? toEmpId : null, note })} disabled={busy || (mode==='specific' && !toEmpId)}>{t('swap.submit')}</Btn>
          <Btn variant="ghost" onClick={onCancel}>{t('common.cancel')}</Btn>
        </div>
      </div>
    </div>
  );
}

// Mirror of GiveAwayModal, but for the other direction — I'm asking a named
// coworker for a specific shift of theirs rather than offering up my own.
// No target picker needed (the coworker/shift is already fixed by which
// button was clicked), just a note.
function RequestShiftModal({ modal, busy, onCancel, onSubmit, s, t }){
  const [note, setNote] = useState('');
  return (
    <div onClick={onCancel} style={{position:'fixed',inset:0,zIndex:300,background:'rgba(20,16,13,0.5)',display:'flex',alignItems:'center',justifyContent:'center',padding:20,fontFamily:"'Hanken Grotesk',sans-serif"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,width:'min(400px,100%)',padding:20,boxShadow:'0 24px 60px -16px rgba(0,0,0,0.5)'}}>
        <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:16,fontWeight:500,color:T.text,marginBottom:4}}>{t('swap.requestShift')}</div>
        <div style={{fontSize:12,color:T.text3,marginBottom:14}}>{modal.emp.name} · {modal.blockName} · {modal.role} · {t('day.'+modal.day)}</div>
        <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder={t('swap.notePlaceholder')} rows={2} style={{...s.input,resize:'vertical',marginBottom:14}}/>
        <div style={{display:'flex',gap:8}}>
          <Btn onClick={()=>onSubmit({ note })} disabled={busy}>{t('swap.submit')}</Btn>
          <Btn variant="ghost" onClick={onCancel}>{t('common.cancel')}</Btn>
        </div>
      </div>
    </div>
  );
}

// Time-off/vacation request form — type + date range + note, always
// created 'Pending' for a manager to approve/reject from their existing
// Time Off view (see createTimeOffRequest in lib/data.js).
// 'Sick' is deliberately left off this list: it's the one TIMEOFF_TYPES
// entry that doesn't fit an advance-request/approval flow (you don't ask
// permission in advance to be sick) — a manager can still log it after the
// fact from their own Time Off view, which keeps the full type list.
const SELF_REQUEST_TIMEOFF_TYPES = TIMEOFF_TYPES.filter(tt=>tt!=='Sick');
// Same local-time ISO parsing used everywhere else in this file (e.g.
// weekKeyToMonday/fmtLong) — new Date(isoString) parses as UTC and can land
// on the wrong calendar day depending on the viewer's timezone.
const isoToLocalDate = (iso) => { const [y,m,d]=iso.split('-').map(Number); return new Date(y,m-1,d); };
function TimeOffRequestModal({ busy, onCancel, onSubmit, s, t }){
  const [type, setType] = useState(SELF_REQUEST_TIMEOFF_TYPES[0]);
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const invalid = !startDate || !endDate || endDate < startDate;
  // Matches the compact "21.07.2026" style people already know from this
  // form, but rendered by our own themed calendar popover (WeekPicker)
  // instead of the browser/OS's native date-input chrome.
  const fmtShort = (iso) => { const d=isoToLocalDate(iso); return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`; };
  const dateTrigger = (iso) => (
    <div style={{...s.input,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',userSelect:'none',fontSize:14,padding:'9px 12px'}}>
      <span>{fmtShort(iso)}</span>
      <span style={{fontSize:12,opacity:0.55,marginLeft:8}}>▾</span>
    </div>
  );
  // Picking either end auto-keeps the other in a valid order, instead of
  // silently disabling Save with no explanation the moment To ends up
  // before From (e.g. picking To first, before ever touching From).
  const pickStart = (d) => { const iso=dateToISO(d); setStartDate(iso); if(endDate<iso) setEndDate(iso); };
  const pickEnd   = (d) => { const iso=dateToISO(d); setEndDate(iso); if(iso<startDate) setStartDate(iso); };
  return (
    <div onClick={onCancel} style={{position:'fixed',inset:0,zIndex:300,background:'rgba(20,16,13,0.5)',display:'flex',alignItems:'center',justifyContent:'center',padding:20,fontFamily:"'Hanken Grotesk',sans-serif"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,width:'min(420px,100%)',padding:20,boxShadow:'0 24px 60px -16px rgba(0,0,0,0.5)'}}>
        <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:16,fontWeight:500,color:T.text,marginBottom:14}}>{t('to.newRequest')}</div>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:11,color:T.text3,marginBottom:4}}>{t('to.type')}</div>
          {/* The browser's own native dropdown arrow ignores extra padding
              in some engines (it stayed glued to the edge) — drop it
              entirely and draw our own, positioned exactly like the ▾ on
              the date pickers below. */}
          <div style={{position:'relative'}}>
            <select value={type} onChange={e=>setType(e.target.value)} style={{...s.select,appearance:'none',WebkitAppearance:'none',MozAppearance:'none',paddingRight:34}}>{SELF_REQUEST_TIMEOFF_TYPES.map(tt=><option key={tt} value={tt}>{tt}</option>)}</select>
            <span style={{position:'absolute',right:14,top:'50%',transform:'translateY(-50%)',pointerEvents:'none',fontSize:12,color:T.text3}}>▾</span>
          </div>
        </div>
        <div style={{display:'flex',gap:10,marginBottom:12}}>
          <div style={{flex:1}}>
            <div style={{fontSize:11,color:T.text3,marginBottom:4}}>{t('common.fromCap')}</div>
            <WeekPicker value={isoToLocalDate(startDate)} highlightStart={isoToLocalDate(startDate)} highlightEnd={isoToLocalDate(startDate)} onPick={pickStart} trigger={dateTrigger(startDate)}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:11,color:T.text3,marginBottom:4}}>{t('common.toCap')}</div>
            <WeekPicker value={isoToLocalDate(endDate)} highlightStart={isoToLocalDate(endDate)} highlightEnd={isoToLocalDate(endDate)} onPick={pickEnd} trigger={dateTrigger(endDate)}/>
          </div>
        </div>
        <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder={t('to.optional')} rows={2} style={{...s.input,resize:'vertical',marginBottom:14}}/>
        <div style={{display:'flex',gap:8}}>
          <Btn onClick={()=>onSubmit({ type, startDate, endDate, note })} disabled={busy || invalid}>{t('to.saveRequest')}</Btn>
          <Btn variant="ghost" onClick={onCancel}>{t('common.cancel')}</Btn>
        </div>
      </div>
    </div>
  );
}

// Simple roster — every employee and the role(s) they're configured for, no
// schedule/shift data (that's the Team tab's job). One card per person,
// sorted alphabetically; clicking a card opens a small info popup with
// their contact details.
function Directory({ employees, myId, roleStyles, roleColorFor, s, t }){
  const [selected, setSelected] = useState(null); // employee whose info popup is open, or null
  const [query, setQuery] = useState('');
  const sorted = [...employees].sort((a,b)=>a.name.localeCompare(b.name));
  const q = query.trim().toLowerCase();
  // Only worth showing a search box once the team is big enough that
  // scanning the grid by eye stops being faster than typing.
  const showSearch = employees.length > 6;
  const filtered = q ? sorted.filter(emp=>emp.name.toLowerCase().includes(q)||(emp.roles||[]).some(r=>r.toLowerCase().includes(q))) : sorted;
  return (
    <>
      {showSearch && (
        <div style={{position:'relative',maxWidth:320,marginBottom:14}}>
          <span style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',fontSize:13,color:T.text3,pointerEvents:'none'}}>⌕</span>
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder={t('dir.searchPlaceholder')} style={{...s.input,width:'100%',paddingLeft:32}}/>
        </div>
      )}
      {filtered.length===0 ? (
        <div style={{fontSize:12,color:T.text3,fontStyle:'italic',padding:'24px 0',textAlign:'center'}}>{t('dir.noResults')}</div>
      ) : (
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))',gap:12}}>
        {filtered.map(emp=>{
          const isMe=emp.id===myId, p=pal(emp);
          return (
            <div key={emp.id} onClick={()=>setSelected(emp)} style={{...s.card,cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',textAlign:'center',gap:10,padding:'22px 14px',border:isMe?`1.5px solid ${T.accent}`:s.card.border,background:isMe?(isDark()?T.accent+'12':T.accentLight):s.card.background,transition:'transform 0.12s, box-shadow 0.12s'}}>
              <div style={{width:56,height:56,borderRadius:'50%',background:isMe?T.accent:(isDark()?p.dot+'25':p.bg),color:isMe?'#fff':(isDark()?p.dot:p.text),display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:700,flexShrink:0,border:isMe?'none':`2px solid ${p.dot}33`}}>{initials(emp.name)}</div>
              <div style={{fontSize:14,fontWeight:isMe?700:500,color:isMe?T.accent:T.text}}>{emp.name}</div>
              <div style={{display:'flex',gap:5,flexWrap:'wrap',justifyContent:'center'}}>
                {(emp.roles&&emp.roles.length?emp.roles:['Other']).map(role=>(
                  <RoleBadge key={role} role={role} rs={roleStyles[role]||roleColorFor(role)}/>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      )}
      {selected && createPortal(
        <StaffInfoModal emp={selected} isMe={selected.id===myId} roleStyles={roleStyles} roleColorFor={roleColorFor} onClose={()=>setSelected(null)} t={t}/>,
        document.body
      )}
    </>
  );
}

// Small read-only popup with a coworker's contact info — name, roles,
// phone, email. Opened by clicking their card in the Employees tab.
function StaffInfoModal({ emp, isMe, roleStyles, roleColorFor, onClose, t }){
  const p = pal(emp);
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,zIndex:300,background:'rgba(20,16,13,0.5)',display:'flex',alignItems:'center',justifyContent:'center',padding:20,fontFamily:"'Hanken Grotesk',sans-serif"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,width:'min(360px,100%)',padding:22,boxShadow:'0 24px 60px -16px rgba(0,0,0,0.5)'}}>
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',textAlign:'center',gap:10,marginBottom:18}}>
          <div style={{width:64,height:64,borderRadius:'50%',background:isMe?T.accent:(isDark()?p.dot+'25':p.bg),color:isMe?'#fff':(isDark()?p.dot:p.text),display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,fontWeight:700,border:isMe?'none':`2px solid ${p.dot}33`}}>{initials(emp.name)}</div>
          <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:18,fontWeight:500,color:T.text}}>{emp.name}</div>
          <div style={{display:'flex',gap:5,flexWrap:'wrap',justifyContent:'center'}}>
            {(emp.roles&&emp.roles.length?emp.roles:['Other']).map(role=>(
              <RoleBadge key={role} role={role} rs={roleStyles[role]||roleColorFor(role)}/>
            ))}
          </div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <div>
            <div style={{fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:3}}>{t('profile.email')}</div>
            <div style={{fontSize:13,color:T.text}}>{emp.email||t('dir.noContact')}</div>
          </div>
          <div>
            <div style={{fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:3}}>{t('profile.phone')}</div>
            <div style={{fontSize:13,color:T.text}}>{emp.phone||t('dir.noContact')}</div>
          </div>
        </div>
        <div style={{marginTop:18}}><Btn variant="ghost" onClick={onClose}>{t('common.close')}</Btn></div>
      </div>
    </div>
  );
}

// Read-only week view for the employee 'week' tab — structurally mirrors the
// manager's WeekView.jsx (full week role×day grid, click a day header to
// isolate it into a Gantt timeline above, weekly-hours summary at the
// bottom) but with every edit affordance stripped out (no drag handles, no
// add/remove picker, no click-to-edit) and no staffing-coverage signal (no
// "short by N" gaps or requirement counts — only ever shows who's actually
// assigned, per the earlier decision to keep that manager-only information).
function DayTimeline({ schedule, blocks, employees, allRoles, dayFilter, setDayFilter, weekDates, myId, isMobile, gridGroupBy, roleStyles, roleColorFor, s, t }){
  const [collapsedBlocks, setCollapsedBlocks] = useState({});
  const colorFor = (role) => roleStyles[role] || roleColorFor(role);

  if (!schedule) return (
    <div style={{...s.card,textAlign:'center',padding:'52px 32px'}}>
      <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:18,fontWeight:500,color:T.text,marginBottom:6}}>{t('emp.noScheduleTitle')}</div>
      <div style={{fontSize:13,color:T.text2}}>{t('emp.noScheduleDesc')}</div>
    </div>
  );

  const filterDays = dayFilter ? [dayFilter] : DAYS;

  // ---- Single-day Gantt (only rendered once a day header is clicked) ----
  const dayShiftsRaw = dayFilter ? blocks.flatMap(b=>{
    return (schedule[dayFilter]?.[b.id]||[]).map(a=>{
      const st=a.start||b.start, en=a.end||b.end;
      const bs=toMin(st); let be=toMin(en); if(be<=bs) be+=1440;
      // Same fix as the manager's WeekView.jsx: a.name is a snapshot frozen
      // at the time this shift was assigned, so it goes stale the moment
      // someone is renamed. Look the current name up live from the roster,
      // only falling back to the embedded one if the employee record is
      // gone entirely.
      const liveName = employees.find(e=>e.id===a.empId)?.name || a.name;
      return { empId:a.empId, name:liveName, role:a.role, start:bs, end:be, startStr:st, endStr:en, noShow:a.noShow, actualStart:a.actualStart, actualEnd:a.actualEnd };
    });
  }) : [];
  const byEmp = new Map();
  dayShiftsRaw.forEach(sg=>{
    if(!byEmp.has(sg.empId)) byEmp.set(sg.empId,{empId:sg.empId,name:sg.name,role:sg.role,segs:[]});
    byEmp.get(sg.empId).segs.push(sg);
  });
  const dayRows = [...byEmp.values()].map(r=>({...r,segs:[...r.segs].sort((a,b)=>a.start-b.start)}))
    .sort((a,b)=> gridGroupBy==='role'
      ? (allRoles.indexOf(a.role)-allRoles.indexOf(b.role)) || a.name.localeCompare(b.name)
      : a.name.localeCompare(b.name));

  let timeline=null;
  if(dayFilter && dayRows.length){
    const allStarts=dayRows.flatMap(r=>r.segs.map(m=>m.start)), allEnds=dayRows.flatMap(r=>r.segs.map(m=>m.end));
    const rangeStart=Math.floor(Math.min(...allStarts)/60)*60;
    const rangeEnd=Math.ceil(Math.max(...allEnds)/60)*60;
    const totalMin=Math.max(60,rangeEnd-rangeStart);
    const ticks=[]; for(let m=rangeStart;m<=rangeEnd;m+=60) ticks.push(m);
    const sideW=isMobile?76:112, rowH=isMobile?20:24;
    const fmtTick=m=>String(Math.floor((m%1440)/60)).padStart(2,'0')+':00';
    timeline=(
      <div style={{...s.cardFlush,padding:isMobile?'14px 10px 12px':'16px 18px 14px',overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
        <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:10,minWidth:isMobile?480:'auto'}}>
          {[...new Set(dayRows.map(r=>r.role))].map(role=>{const rs=colorFor(role);return(<div key={role} style={{display:'flex',alignItems:'center',gap:5}}><span style={{width:8,height:8,borderRadius:'50%',background:rs.dot,flexShrink:0}}/><span style={{fontSize:11,color:T.text2}}>{role}</span></div>);})}
        </div>
        <div style={{position:'relative',height:16,marginLeft:sideW,marginBottom:10,minWidth:isMobile?480-sideW:'auto'}}>
          {ticks.map(m=>(<span key={m} style={{position:'absolute',left:`${(m-rangeStart)/totalMin*100}%`,transform:'translateX(-50%)',fontSize:10,color:T.text3,whiteSpace:'nowrap'}}>{fmtTick(m)}</span>))}
        </div>
        <div style={{display:'flex',gap:8,minWidth:isMobile?480:'auto'}}>
          <div style={{width:sideW,flexShrink:0,display:'flex',flexDirection:'column',gap:8}}>
            {dayRows.map(row=>{const isMe=row.empId===myId,rs=colorFor(row.role);return(<div key={row.empId} style={{height:rowH,display:'flex',alignItems:'center',gap:5,fontSize:isMobile?11:12,fontWeight:isMe?700:500,color:isMe?T.accent:T.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}><span style={{width:7,height:7,borderRadius:'50%',background:isMe?T.accent:rs.dot,flexShrink:0}}/>{row.name}</div>);})}
          </div>
          <div style={{position:'relative',flex:1}}>
            {ticks.map(m=>(<div key={m} style={{position:'absolute',left:`${(m-rangeStart)/totalMin*100}%`,top:0,bottom:0,width:1,zIndex:0,pointerEvents:'none',background:m===rangeStart||m===rangeEnd?'transparent':T.border}}/>))}
            <div style={{display:'flex',flexDirection:'column',gap:8,position:'relative'}}>
              {dayRows.map(row=>{
                const isMe=row.empId===myId, rs=colorFor(row.role);
                return(<div key={row.empId} style={{position:'relative',height:rowH,background:T.surfaceWarm,borderRadius:6}}>
                  {row.segs.map((seg,si)=>{
                    // Same "actual hours" treatment as the manager's Week tab
                    // Gantt (see App.jsx's WeekView.jsx) — the bar is sized by
                    // what was actually clocked, not just what was scheduled,
                    // with a dashed outline at the original scheduled time
                    // when the two differ. Read-only here (no drag handles).
                    const isNoShow=!!seg.noShow;
                    const hasActual=!isNoShow&&(seg.actualStart||seg.actualEnd);
                    // actualTimeRange (lib/schedule.js) is the single shared
                    // place that turns actualStart/actualEnd into minutes —
                    // this used to be a hand-duplicated copy of the same
                    // logic living separately in this file and WeekView.jsx.
                    let actStart=seg.start,actEnd=seg.end,actOngoing=false;
                    if(hasActual){
                      // seg.start/seg.end are already-converted MINUTES, not
                      // the HH:MM strings actualTimeRange expects — pass a
                      // bare {noShow,actualStart,actualEnd} instead (seg
                      // carries no separate raw string override to give it),
                      // so the fallback resolves through startStr/endStr,
                      // which already account for any per-assignment override.
                      const range=actualTimeRange({noShow:seg.noShow,actualStart:seg.actualStart,actualEnd:seg.actualEnd},{start:seg.startStr,end:seg.endStr});
                      actStart=range.startMin; actEnd=range.endMin; actOngoing=range.ongoing;
                      if(actOngoing) actEnd=Math.max(actStart+15,actEnd);
                    }
                    const rawStart=hasActual?actStart:seg.start, rawEnd=hasActual?actEnd:seg.end;
                    const clampedStart=Math.min(Math.max(rawStart,rangeStart),rangeEnd);
                    const clampedEnd=Math.min(Math.max(rawEnd,rangeStart),rangeEnd);
                    const leftPct=(clampedStart-rangeStart)/totalMin*100, widthPct=(clampedEnd-clampedStart)/totalMin*100;
                    // Same fix as the manager's WeekView.jsx — a plain
                    // percentage width can shrink to an unreadable sliver
                    // (e.g. a same-minute clock in/out), so floor it with a
                    // real pixel minimum wide enough for the label instead.
                    const barMinPx=isMobile?84:104;
                    const label=isNoShow?t('emp.noShow'):hasActual?`${seg.actualStart||seg.startStr}–${seg.actualEnd||'…'}${actOngoing?' ●':' ✓'}`:`${seg.startStr}–${seg.endStr}`;
                    const showGhost=hasActual&&(actStart!==seg.start||actEnd!==seg.end);
                    const ghostLeftPct=(seg.start-rangeStart)/totalMin*100, ghostWidthPct=(seg.end-seg.start)/totalMin*100;
                    const barColor=isNoShow?T.danger:isMe?T.accent:rs.dot;
                    return(<Fragment key={si}>
                      {showGhost&&<div style={{position:'absolute',left:`${ghostLeftPct}%`,width:`${ghostWidthPct}%`,top:0,bottom:0,minWidth:14,border:`1.5px dashed ${(isMe?T.accent:rs.dot)}88`,borderRadius:6,pointerEvents:'none',zIndex:0}}/>}
                      <div style={{position:'absolute',left:`${leftPct}%`,width:`max(${widthPct}%, ${barMinPx}px)`,top:0,bottom:0,zIndex:1,background:isNoShow?(isDark()?T.danger+'30':T.dangerLight):isMe?(isDark()?T.accent+'40':T.accentLight):isDark()?rs.dot+'30':rs.bg,border:`1.5px solid ${barColor}`,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden'}}>
                        <span style={{fontSize:isMobile?9:10,fontWeight:600,color:isNoShow?T.danger:isMe?T.accent:(isDark()?rs.dot:rs.text),whiteSpace:'nowrap',padding:'0 5px'}}>{label}</span>
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

  return (<div style={{display:'flex',flexDirection:'column',gap:16}}>
    {dayFilter && (
      <button onClick={()=>setDayFilter(null)} style={{alignSelf:'flex-start',display:'flex',alignItems:'center',gap:6,padding:'4px 10px',borderRadius:999,background:T.accentLight,border:`1px solid ${T.accent}44`,color:T.accent,fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'inherit'}}>{t('week.showingDay',{day:t('day.'+dayFilter)})} ✕</button>
    )}
    {timeline}
    {blocks.map(block=>{
      const isCollapsed=!!collapsedBlocks[block.id];
      return (
      <div key={block.id} style={s.cardFlush}>
        <div onClick={()=>setCollapsedBlocks(p=>({...p,[block.id]:!p[block.id]}))} style={{padding:'12px 20px',borderBottom:isCollapsed?'none':`1px solid ${T.border}`,background:T.surfaceWarm,display:'flex',alignItems:'center',gap:12,cursor:'pointer',userSelect:'none'}}>
          <span style={{fontSize:11,color:T.text3,transform:isCollapsed?'rotate(-90deg)':'none',transition:'transform 0.15s',display:'inline-block'}}>▾</span>
          <div style={{flex:1}}><span style={{fontFamily:'Fraunces, Georgia, serif',fontSize:15,fontWeight:500}}>{block.name}</span><span style={{fontSize:12,color:T.text3,marginLeft:10}}>{block.start} – {block.end}</span></div>
        </div>
        {!isCollapsed && (
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:580}}>
            <thead><tr>
              <th style={{width:90,textAlign:'left',padding:'10px 20px',fontSize:10,fontWeight:600,color:T.text3,textTransform:'uppercase',letterSpacing:'0.06em',background:T.surfaceWarm,borderBottom:`1px solid ${T.border}`}}>{t('week.role')}</th>
              {filterDays.map(day=>{const i=DAYS.indexOf(day),isActive=dayFilter===day,isToday=dateToISO(weekDates[i])===dateToISO(new Date());return(<th key={day} onClick={()=>setDayFilter(f=>f===day?null:day)} style={{textAlign:'left',padding:'10px 10px',fontSize:11,fontWeight:isToday?700:500,color:isActive?T.accent:isToday?T.accent:T.text,background:isActive?T.accentLight:T.surfaceWarm,borderBottom:`2px solid ${isActive?T.accent:isToday?T.accent:T.border}`,cursor:'pointer',userSelect:'none'}} title={t('week.isolateDay')}>{t('day.'+day)}{isToday&&!isActive&&<span style={{display:'inline-block',width:5,height:5,borderRadius:'50%',background:T.accent,marginLeft:5}}/>}<div style={{fontSize:10,fontWeight:400,color:isActive?T.accent:isToday?T.accent:T.text3}}>{fmt(weekDates[i])}</div></th>);})}
            </tr></thead>
            <tbody>
              {allRoles.map(role=>{
                const anyDay=filterDays.some(day=>(schedule[day]?.[block.id]||[]).some(a=>a.role===role));
                if(!anyDay) return null;
                const rs=colorFor(role);
                return(<tr key={role} style={{borderBottom:`1px solid ${T.border}`}}>
                  <td style={{padding:'10px 20px',verticalAlign:'top',background:T.surface}}><RoleBadge role={role} rs={rs}/></td>
                  {filterDays.map(day=>{
                    const assigned=(schedule[day]?.[block.id]||[]).filter(a=>a.role===role);
                    const isToday=dateToISO(weekDates[DAYS.indexOf(day)])===dateToISO(new Date());
                    return(<td key={day} style={{padding:'8px 10px',verticalAlign:'top',borderLeft:`1px solid ${T.border}`,background:isToday?(isDark()?T.accent+'0d':T.accentLight+'80'):T.surface}}>
                      <div style={{display:'flex',flexDirection:dayFilter?'row':'column',flexWrap:dayFilter?'wrap':'nowrap',gap:dayFilter?14:3,alignItems:dayFilter?'flex-start':'stretch'}}>
                        {assigned.length===0 && <span style={{fontSize:12,color:T.text3,opacity:0.5}}>—</span>}
                        {assigned.map((a,idx)=>{const emp=employees.find(e=>e.id===a.empId),isMe=a.empId===myId;return(
                          <div key={idx}>
                            {/* Own shifts get the filled/"selected" styling
                                instead of a separate "(you)" label — a solid,
                                unmissable card reads as "that's me" without
                                needing extra text. Auto-width when a single
                                day is isolated (people lay out across a row);
                                full-width in the 7-day grid. */}
                            <EmpCard emp={emp||{name:a.name,palIdx:0}} selected={isMe} inline={!!dayFilter}
                              title={emp?.name||a.name}
                              time={dayFilter?`${a.start||block.start}–${a.end||block.end}`:undefined}
                              status={dayFilter&&(a.noShow||a.actualStart||a.actualEnd)
                                ? {text:a.noShow?t('emp.noShow'):`${t('week.clockedLabel')} ${a.actualStart||'—'}–${a.actualEnd||t('week.clockedOngoing')}`,tone:a.noShow?'bad':'good'}
                                : undefined}/>
                          </div>
                        );})}
                      </div>
                    </td>);
                  })}
                </tr>);
              })}
            </tbody>
          </table>
        </div>)}
      </div>
      );
    })}
  </div>);
}
