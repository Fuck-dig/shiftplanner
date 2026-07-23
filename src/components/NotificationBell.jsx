import { useState, useEffect, useRef, useCallback } from 'react';
import { T } from '../lib/constants';
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from '../lib/data';

// A plain drawn bell (no emoji — emoji rendering varies by OS/font and reads
// as a mismatched foreign glyph next to the rest of the icon-free, CSS-drawn
// UI, same reasoning as GripDots in ui.jsx).
function BellIcon(){
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 1.5c-2.2 0-3.6 1.6-3.6 3.9v1.7c0 .5-.2 1.2-.5 1.7l-.7 1.1c-.5.8 0 1.9 1 2.1 2.5.5 5.1.5 7.6 0 .9-.2 1.4-1.3.9-2.1l-.7-1.1c-.3-.5-.5-1.2-.5-1.7V5.4c0-2.2-1.5-3.9-3.5-3.9Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
      <path d="M9.7 13.6a1.8 1.8 0 0 1-3.4 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

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

// Notification bell — used by both employees and managers/owners.
//
// Three independent sources feed it:
// - Personal notifications (the `notifications` table, via empId) — schedule
//   published, swap approved/declined, etc. Only available once empId
//   resolves (i.e. the viewer is also matched to a roster row by email).
// - `pendingItems` — an org-wide "needs your attention" list the caller
//   builds itself (pending time-off requests, swap claims awaiting manager
//   approval, replies to messages the manager sent) and passes in
//   already-formatted. This doesn't depend on the viewer being on the
//   roster at all, so managers who aren't scheduled staff themselves still
//   see it. Passing pendingItems (even []) is what makes the bell render
//   for a manager with no empId match.
// - `messages` — direct messages addressed to this employee (see
//   ComposeMessageModal/MessageThreadModal), passed with an onOpenMessage
//   callback since opening one needs its own modal, not just a link.
export default function NotificationBell({ empId, t, lang, onNavigate, pendingItems, messages, onOpenMessage }){
  const [items, setItems] = useState([]);
  const [open, setOpen]   = useState(false);
  const wrapRef = useRef(null);
  const hasPending = Array.isArray(pendingItems);
  const hasMessages = Array.isArray(messages);

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

  if (!empId && !hasPending) return null;

  const personalUnread = empId ? items.filter(n => !n.read).length : 0;
  const messagesUnread = hasMessages ? messages.filter(m => !m.read).length : 0;
  const unread = personalUnread + (pendingItems?.length || 0) + messagesUnread;

  const clickItem = (n) => {
    if (!n.read) {
      markNotificationRead(n.id).catch(() => {});
      setItems(p => p.map(x => x.id === n.id ? { ...x, read: true } : x));
    }
    if (n.link && onNavigate) onNavigate(n.link);
    setOpen(false);
  };

  const clickPending = (p) => {
    if (p.onClick) p.onClick();
    setOpen(false);
  };

  // Read state for a message flips once its thread modal actually opens
  // (MessageThreadModal calls markMessageRead itself), not here — this bell
  // just hands off to the caller and closes.
  const clickMessage = (m) => {
    if (onOpenMessage) onOpenMessage(m);
    setOpen(false);
  };

  const markAll = () => {
    markAllNotificationsRead(empId).catch(() => {});
    setItems(p => p.map(x => ({ ...x, read: true })));
  };

  const nothingAtAll = (!hasPending || pendingItems.length === 0) && (!empId || items.length === 0) && (!hasMessages || messages.length === 0);

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button onClick={() => setOpen(o => !o)} title={t('notif.title')} style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, color: T.text2, cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <BellIcon/>
        {unread > 0 && <span style={{ position: 'absolute', top: -3, right: -3, minWidth: 15, height: 15, borderRadius: 999, background: T.danger, color: '#fff', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', border: `1.5px solid ${T.surface}` }}>{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 320, maxWidth: '90vw', maxHeight: 420, overflowY: 'auto', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, boxShadow: '0 12px 30px -10px rgba(33,27,21,0.3)', zIndex: 250 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{t('notif.title')}</span>
            {personalUnread > 0 && <button onClick={markAll} style={{ fontSize: 11, color: T.accent, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>{t('notif.markAllRead')}</button>}
          </div>
          {nothingAtAll && (
            <div style={{ padding: '24px 14px', textAlign: 'center', fontSize: 12, color: T.text3 }}>{t('notif.empty')}</div>
          )}
          {hasPending && pendingItems.length > 0 && (<>
            <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 600, color: T.text3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('notif.needsAttention')}</div>
            {pendingItems.map(p => (
              <div key={p.id} onClick={() => clickPending(p)} style={{ padding: '10px 14px', borderBottom: `1px solid ${T.border}`, cursor: 'pointer', background: T.accentLight, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.accent, marginTop: 5, flexShrink: 0 }} />
                <div style={{ fontSize: 12, color: T.text, lineHeight: 1.4, flex: 1, minWidth: 0 }}>{p.label}</div>
              </div>
            ))}
          </>)}
          {hasMessages && messages.length > 0 && (<>
            <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 600, color: T.text3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('msg.title')}</div>
            {messages.map(m => (
              <div key={m.id} onClick={() => clickMessage(m)} style={{ padding: '10px 14px', borderBottom: `1px solid ${T.border}`, cursor: 'pointer', background: m.read ? 'transparent' : T.accentLight, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                {!m.read && <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.accent, marginTop: 5, flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: T.text3, marginBottom: 1 }}>{m.senderLabel}{m.subject?` · ${m.subject}`:''}</div>
                  <div style={{ fontSize: 12, color: T.text, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{m.body}</div>
                  <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>{relTime(m.createdAt, lang)}</div>
                </div>
              </div>
            ))}
          </>)}
          {empId && items.length > 0 && (<>
            {((hasPending && pendingItems.length > 0) || (hasMessages && messages.length > 0)) && <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 600, color: T.text3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('notif.title')}</div>}
            {items.map(n => (
              <div key={n.id} onClick={() => clickItem(n)} style={{ padding: '10px 14px', borderBottom: `1px solid ${T.border}`, cursor: 'pointer', background: n.read ? 'transparent' : T.accentLight, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                {!n.read && <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.accent, marginTop: 5, flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: T.text, lineHeight: 1.4 }}>{t(n.messageKey, n.messageVars)}</div>
                  <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>{relTime(n.createdAt, lang)}</div>
                </div>
              </div>
            ))}
          </>)}
        </div>
      )}
    </div>
  );
}
