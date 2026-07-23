import { useState, useEffect } from 'react';
import { T } from '../lib/constants';
import { supabase } from '../lib/supabase';
import { Btn } from './ui';
import { fetchMessageReplies, sendMessageReply, markMessageRead, markMessageSeenByManager, replyFromRow } from '../lib/data';

// Shared thread view for both sides of a direct message: an employee
// reading (and possibly replying to) something they received, or a manager
// following up on a reply to something they sent. viewerIsManager controls
// how a new reply gets attributed (from_employee) and which "needs
// attention" flag on the parent message clears on open.
export default function MessageThreadModal({ message, viewerIsManager, myLabel, counterpartLabel, onClose, s, t }){
  const [replies, setReplies] = useState([]);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchMessageReplies(message.id).then(r => { if (alive) setReplies(r); }).catch(()=>{});
    if (viewerIsManager) markMessageSeenByManager(message.id).catch(()=>{});
    else if (!message.read) markMessageRead(message.id).catch(()=>{});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.id]);

  // While this thread is open, a reply from the other side appears without
  // needing to close and reopen it. Requires `message_replies` to be in the
  // supabase_realtime publication (see the direct-messages migration
  // follow-up note) — harmless no-op if that hasn't been run yet, the
  // person just won't see it update live.
  useEffect(() => {
    const channel = supabase.channel(`message-replies-${message.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_replies', filter: `message_id=eq.${message.id}` }, (payload) => {
        const incoming = replyFromRow(payload.new);
        setReplies(p => p.some(r => r.id === incoming.id) ? p : [...p, incoming]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [message.id]);

  const isMine = (r) => viewerIsManager ? !r.fromEmployee : r.fromEmployee;

  const submitReply = () => {
    const text = reply.trim();
    if (!text) return;
    setBusy(true);
    sendMessageReply(message.id, { fromEmployee: !viewerIsManager, authorLabel: myLabel, body: text })
      .then(() => {
        setReplies(p => [...p, { id: crypto.randomUUID(), fromEmployee: !viewerIsManager, authorLabel: myLabel, body: text, createdAt: new Date().toISOString() }]);
        setReply('');
      })
      .catch(err => alert(err.message || 'Failed to send'))
      .finally(() => setBusy(false));
  };

  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,zIndex:300,background:'rgba(20,16,13,0.5)',display:'flex',alignItems:'center',justifyContent:'center',padding:20,fontFamily:"'Hanken Grotesk',sans-serif"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,width:'min(440px,100%)',maxHeight:'min(85vh,620px)',display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 24px 60px -16px rgba(0,0,0,0.5)'}}>
        <div style={{padding:'18px 20px',borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
          {message.subject && <div style={{fontFamily:'Fraunces, Georgia, serif',fontSize:16,fontWeight:500,color:T.text,marginBottom:4}}>{message.subject}</div>}
          {counterpartLabel && <div style={{fontSize:11,color:T.text3}}>{t('msg.threadWith',{name:counterpartLabel})}</div>}
        </div>
        <div style={{padding:'16px 20px',overflowY:'auto',flex:1,display:'flex',flexDirection:'column',gap:10}}>
          <div style={{fontSize:13,color:T.text,lineHeight:1.5,whiteSpace:'pre-wrap',marginBottom:replies.length?4:0}}>{message.body}</div>
          {replies.map(r=>{
            const mine = isMine(r);
            return (
              <div key={r.id} style={{alignSelf:mine?'flex-end':'flex-start',maxWidth:'85%',background:mine?T.accentLight:T.surfaceWarm,border:`1px solid ${T.border}`,borderRadius:10,padding:'8px 12px'}}>
                <div style={{fontSize:9,color:T.text3,marginBottom:3}}>{r.authorLabel}</div>
                <div style={{fontSize:12,color:T.text,whiteSpace:'pre-wrap'}}>{r.body}</div>
              </div>
            );
          })}
        </div>
        {message.allowReplies ? (
          <div style={{display:'flex',gap:8,padding:16,borderTop:`1px solid ${T.border}`,flexShrink:0}}>
            <input value={reply} onChange={e=>setReply(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')submitReply();}} placeholder={t('msg.replyPlaceholder')} style={{...s.input,flex:1}}/>
            <Btn onClick={submitReply} disabled={busy||!reply.trim()}>{t('msg.reply')}</Btn>
          </div>
        ) : (
          <div style={{padding:'12px 20px',borderTop:`1px solid ${T.border}`,fontSize:11,color:T.text3,fontStyle:'italic',flexShrink:0}}>{t('msg.repliesOff')}</div>
        )}
        <div style={{padding:'10px 20px',borderTop:`1px solid ${T.border}`,flexShrink:0}}>
          <Btn variant="ghost" small onClick={onClose}>{t('common.close')}</Btn>
        </div>
      </div>
    </div>
  );
}
