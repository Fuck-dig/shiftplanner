// Web Push subscription mechanics (browser APIs), kept separate from
// data.js's notifyPush (which does the DB lookups + edge function call to
// actually SEND a push) — this file is only about registering/removing
// *this* browser's own subscription, similar to how ProfileSettings.jsx
// already calls supabase.auth.updateUser directly for its own concern
// rather than going through data.js for everything.
import { supabase } from './supabase';

// atob + a URL-safe base64 tweak — the VAPID public key is shared in
// URL-safe base64, but PushManager.subscribe wants a plain Uint8Array.
function urlBase64ToUint8Array(base64String){
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export const pushSupported = () =>
  typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof window !== 'undefined' && 'PushManager' in window;

// One of 'unsupported' | 'denied' | 'subscribed' | 'not-subscribed' — the
// Profile toggle uses this instead of just a boolean so it can explain
// *why* it's off (browser can't do it at all vs. the user blocked the
// permission prompt vs. just never turned it on).
export async function getPushStatus(){
  if (!pushSupported()) return 'unsupported';
  if (typeof Notification !== 'undefined' && Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub ? 'subscribed' : 'not-subscribed';
  } catch {
    return 'unsupported';
  }
}

// Prompts for permission (if not already granted/denied), subscribes this
// browser, and upserts the subscription row keyed by endpoint — re-calling
// this on a browser that's already subscribed is a harmless no-op update
// rather than a duplicate row.
export async function subscribeToPush(orgId, empId){
  if (!pushSupported()) throw new Error('Push notifications aren\'t supported in this browser');
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidKey) throw new Error('Push isn\'t configured yet (missing VAPID key)');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) });
  }
  const json = sub.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert({
    org_id: orgId, emp_id: empId, endpoint: json.endpoint,
    p256dh: json.keys.p256dh, auth: json.keys.auth,
  }, { onConflict: 'endpoint' });
  if (error) throw error;
}

export async function unsubscribeFromPush(){
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
}
