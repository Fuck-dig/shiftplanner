import { useState, useEffect, useRef, useCallback } from 'react';
import { T } from '../lib/constants';
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from '../lib/data';

// Intl.RelativeTimeFormat covers en/da/es natively, so notification
// timestamps don't need their own set of i18n keys.
function relTime(iso, lang){
  const diffMs = new Date(iso) - new Date();
  const diffMin = Math.round(diffMs / 60000);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  if (Math.abs(diffMin) < 1) return rtf.format(0, 'minute');
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');
  const diffH = Math.round(diffMin / 60);
  if (Math.abs(diffH) < 24) return rtf.format(diffH, 'hour');
  return rtf.format(Math.round(diffH / 24), 'day');
}

// Employee-facing notification bell. Only rendered where we actually know
// the viewer's own employees.id (EmployeeView, once myId resolves) —
// managers get their "needs my attention" signal from the existing
// pending-count badges (time off, swap claims) instead of this table.
export default function NotificationBell({ empId, t, lang, onNavigate }){
  const [items, setItems] = useState([]);
  const [open, setOpen]   = useState(false);
  const wrapRef = useRef(null);

  const load = useCallback(() => {
    if (!empId) return;
    fetchNotifications(empId).then(setItems).catch(() => {});
  }, [empId]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 45000); // no realtime subscription yet — light polling instead
    return () => clearInterval(iv);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDoc = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!empId) return null;

  const unread = items.filter(n => !n.read).length;

  const clickItem = (n) => {
    if (!n.read) {
      markNotificationRead(n.id).catch(() => {});
      setItems(p => p.map(x => x.id === n.id ? { ...x, read: true } : x));
    }
    if (n.link && onNavigate) onNavigate(n.link);
    setOpen(false);
  };

  const markAll = () => {
    markAllNotificationsRead(empId).catch(() => {});
    setItems(p => p.map(x => ({ ...x, read: true })));
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button onClick={() => setOpen(o => !o)} title={t('notif.title')} style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, color: T.text2, cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <span>🔔</span>
        {unread > 0 && <span style={{ position: 'absolute', top: -3, right: -3, minWidth: 15, height: 15, borderRadius: 999, background: T.danger, color: '#fff', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', border: `1.5px solid ${T.surface}` }}>{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 320, maxWidth: '90vw', maxHeight: 420, overflowY: 'auto', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, boxShadow: '0 12px 30px -10px rgba(33,27,21,0.3)', zIndex: 250 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{t('notif.title')}</span>
            {unread > 0 && <button onClick={markAll} style={{ fontSize: 11, color: T.accent, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>{t('notif.markAllRead')}</button>}
          </div>
          {items.length === 0 ? (
            <div style={{ padding: '24px 14px', textAlign: 'center', fontSize: 12, color: T.text3 }}>{t('notif.empty')}</div>
          ) : items.map(n => (
            <div key={n.id} onClick={() => clickItem(n)} style={{ padding: '10px 14px', borderBottom: `1px solid ${T.border}`, cursor: 'pointer', background: n.read ? 'transparent' : T.accentLight, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              {!n.read && <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.accent, marginTop: 5, flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: T.text, lineHeight: 1.4 }}>{t(n.messageKey, n.messageVars)}</div>
                <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>{relTime(n.createdAt, lang)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
