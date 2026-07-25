import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import webpush from 'npm:web-push@3.6.7'

// Sends a Web Push notification to one or more already-resolved
// subscriptions. Deliberately dumb/stateless, matching send-notification's
// own design: the caller (lib/data.js's notifyPush) is responsible for
// looking up which employees should be notified and their subscriptions
// and push_prefs (both already readable under the existing org-membership
// RLS — see 20260725130000_push_notifications.sql) — this function's only
// job is holding the VAPID private key and doing the actual signed push
// send, which can't happen from the browser itself.
//
// Deploy with: `supabase functions deploy send-push`
// Requires secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// (e.g. mailto:you@rorota.net) — VAPID_PUBLIC_KEY must be the exact same
// value as VITE_VAPID_PUBLIC_KEY in the client's .env, since a subscription
// created with one public key can only be pushed to using its matching
// private key.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { subscriptions, payload } = await req.json()
    if (!Array.isArray(subscriptions) || subscriptions.length === 0) throw new Error('Missing "subscriptions"')
    if (!payload?.title) throw new Error('Missing "payload.title"')

    const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
    const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
    const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:hello@rorota.net'
    if (!publicKey || !privateKey) throw new Error('VAPID keys not set')

    webpush.setVapidDetails(subject, publicKey, privateKey)

    const results = await Promise.allSettled(subscriptions.map((s: { endpoint: string; p256dh: string; auth: string }) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload)
      )
    ))

    const failed = results.filter((r) => r.status === 'rejected').length

    return new Response(JSON.stringify({ ok: true, sent: subscriptions.length - failed, failed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
