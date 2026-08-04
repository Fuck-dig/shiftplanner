// Design tokens, palettes, default data, and shared style objects.

// ─── Theme palettes ───────────────────────────────────────────────────────────
export const THEMES = {
  light: {
    bg:'#F5F0E6', surface:'#FFFEFB', surfaceWarm:'#FBF6EE', border:'#E6DDCD',
    text:'#211B15', text2:'#5C5248', text3:'#9C9088',
    accent:'#BF5A2C', accentLight:'#F5EAE2', accentText:'#7A3318',
    success:'#3D7A52', successLight:'#E5F0E9',
    warning:'#956B18', warningLight:'#FBF0D5',
    danger:'#963030', dangerLight:'#F5E2E2',
  },
  dark: {
    bg:'#1A1714', surface:'#221E1A', surfaceWarm:'#2A2520', border:'#3A332B',
    text:'#F2EDE6', text2:'#B8ACA0', text3:'#867A6E',
    accent:'#D97A4A', accentLight:'#3A2A1E', accentText:'#F0A578',
    success:'#5FAE7A', successLight:'#1E2E22',
    warning:'#D4A53E', warningLight:'#2E2718',
    danger:'#D6685E', dangerLight:'#2E1E1C',
  },
};

// Mutable token object — App mutates this via Object.assign() before every
// render so all inline T.xxx references across every component stay in sync.
export const T = { ...THEMES.light };

// Shared dark-mode check — any component can import this instead of
// re-deriving it locally, so theme-aware colors stay consistent everywhere.
export function isDark(){ return T.bg === THEMES.dark.bg; }

// The app's ambient backdrop: two soft radial washes over T.bg, fixed to the
// viewport so they stay put as content scrolls past.
//
// Every sticky bar has to repeat this rather than just using a flat T.bg,
// because a flat panel scrolling over the gradient cuts a visible rectangle
// out of it. That's legitimate — but it was copy-pasted byte-for-byte in six
// places across three files, which is six chances for them to drift apart and
// is why the clipping artefacts (#11) appear inconsistently between bars.
//
// A function, not a constant: isDark() has to be read at render time, or a
// theme switch wouldn't repaint it.
export function backdrop(){
  return {
    background: T.bg,
    backgroundImage: isDark()
      ? 'radial-gradient(circle at 12% 6%, rgba(217,122,74,0.07), transparent 38%), radial-gradient(circle at 88% 94%, rgba(95,174,122,0.06), transparent 42%)'
      : 'radial-gradient(circle at 12% 6%, rgba(191,90,44,0.045), transparent 38%), radial-gradient(circle at 88% 94%, rgba(61,122,82,0.04), transparent 42%)',
    backgroundAttachment: 'fixed',
  };
}

export function computeStyles(){
  return {
    card:      { background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, padding:20, boxShadow:'0 1px 2px rgba(33,27,21,0.03), 0 12px 30px -20px rgba(33,27,21,0.25)' },
    cardFlush: { background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, overflow:'hidden', boxShadow:'0 1px 2px rgba(33,27,21,0.03), 0 12px 30px -20px rgba(33,27,21,0.25)' },
    input:     { padding:'7px 11px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:13, fontFamily:'inherit', outline:'none', width:'100%', boxSizing:'border-box' },
    select:    { padding:'7px 11px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:13, fontFamily:'inherit', outline:'none', width:'100%', boxSizing:'border-box', cursor:'pointer' },
  };
}
export const styles = computeStyles();

// ─── Role palettes ────────────────────────────────────────────────────────────
export const ROLE_COLOR_PALETTE = [
  { dot:'#534AB7', bg:'#F0EFFE', text:'#4039A0', border:'#C8C4F8' },
  { dot:'#1A6FA8', bg:'#EAF3FB', text:'#165C8C', border:'#A8D4F0' },
  { dot:'#2D7A4F', bg:'#E8F5EE', text:'#236040', border:'#9FD8B8' },
  { dot:'#8A5A10', bg:'#FBF3E5', text:'#6E4809', border:'#F0CC84' },
  { dot:'#5C5A58', bg:'#F2F1EF', text:'#4A4844', border:'#C8C4BE' },
  { dot:'#B03868', bg:'#FBE8F0', text:'#7A2848', border:'#F0B8D0' },
  { dot:'#BF5A2C', bg:'#F5EAE2', text:'#7A3318', border:'#E8C0A0' },
  { dot:'#2D7A80', bg:'#E5F5F5', text:'#1A5C60', border:'#90D8D8' },
  { dot:'#6B3A9E', bg:'#F3EBF9', text:'#52288A', border:'#D4B8F0' },
  { dot:'#3A7A3A', bg:'#EBF5EB', text:'#286028', border:'#B0D8B0' },
];

export const DEFAULT_ROLE_STYLES = {
  Manager:   { dot:'#534AB7', bg:'#F0EFFE', text:'#4039A0', border:'#C8C4F8' },
  Bartender: { dot:'#1A6FA8', bg:'#EAF3FB', text:'#165C8C', border:'#A8D4F0' },
  Waiter:    { dot:'#2D7A4F', bg:'#E8F5EE', text:'#236040', border:'#9FD8B8' },
  Kitchen:   { dot:'#8A5A10', bg:'#FBF3E5', text:'#6E4809', border:'#F0CC84' },
  Other:     { dot:'#5C5A58', bg:'#F2F1EF', text:'#4A4844', border:'#C8C4BE' },
};

// Colours for the org-membership role badge (owner/manager/employee — as
// opposed to DEFAULT_ROLE_STYLES above, which is for staffing roles like
// Bartender/Kitchen). Was copy-pasted identically under different local
// names in App.jsx, EmployeeView.jsx, RestaurantPicker.jsx and
// ProfileSettings.jsx — one definition here instead.
export const MEMBERSHIP_ROLE_COLORS = {
  owner:    { bg:'#F5E2E2', text:'#963030', border:'#E8BABA' },
  manager:  { bg:'#F5EAE2', text:'#7A3318', border:'#E8C0A0' },
  employee: { bg:'#E5F0E9', text:'#236040', border:'#9FD8B8' },
};

export const EMP_PALETTE = [
  { bg:'#EAF3FB', text:'#165C8C', dot:'#1A6FA8' },
  { bg:'#E8F5EE', text:'#236040', dot:'#2D7A4F' },
  { bg:'#F5EAE2', text:'#7A3318', dot:'#BF5A2C' },
  { bg:'#F0EFFE', text:'#4039A0', dot:'#534AB7' },
  { bg:'#FBF3E5', text:'#6E4809', dot:'#8A5A10' },
  { bg:'#F0F8F0', text:'#2D5C30', dot:'#3D7A52' },
  { bg:'#FBE8F0', text:'#7A2848', dot:'#B03868' },
];

export const TIMEOFF_TYPES  = ['Holiday','Sick','Personal','Other'];
export const DAYS           = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

// Keys are short codes (translated for display via t('tpl.'+key), not shown raw).
export const AVAIL_TEMPLATES = {
  fulltime:     Object.fromEntries([...['Mon','Tue','Wed','Thu','Fri'].map(d=>[d,{from:'09:00',to:'17:00'}]),...['Sat','Sun'].map(d=>[d,null])]),
  evenings:     Object.fromEntries(DAYS.map(d=>[d,{from:'16:00',to:'00:00'}])),
  weekends:     Object.fromEntries([...['Mon','Tue','Wed','Thu','Fri'].map(d=>[d,null]),...['Sat','Sun'].map(d=>[d,{from:'10:00',to:'00:00'}])]),
  full:         Object.fromEntries(DAYS.map(d=>[d,{from:'09:00',to:'00:00'}])),
  notavailable: Object.fromEntries(DAYS.map(d=>[d,null])),
};

export const DEFAULT_BLOCKS = [
  { id:'lunch',  name:'Lunch',  start:'10:00', end:'16:00', roles:{ Manager:1, Waiter:2, Kitchen:1, Bartender:0, Other:0 } },
  { id:'dinner', name:'Dinner', start:'16:30', end:'00:00', roles:{ Manager:1, Waiter:3, Kitchen:2, Bartender:1, Other:0 },
    overrides:{ Fri:{ Manager:1, Waiter:4, Kitchen:2, Bartender:1, Other:0 }, Sat:{ Manager:1, Waiter:4, Kitchen:2, Bartender:1, Other:0 } } },
];

export const pal=(e)=>EMP_PALETTE[e?.palIdx%EMP_PALETTE.length]||EMP_PALETTE[0];
export function initials(name){ return name.split(' ').map(n=>n[0]).join(''); }
