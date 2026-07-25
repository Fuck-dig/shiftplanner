import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

// Scheduled job, NOT called by the app itself — this needs to run on a
// recurring cron (every 10-15 min) from an external trigger. Supabase
// projects have a built-in "Cron Jobs" page under Database in the
// dashboard for exactly this (schedules an HTTP call to a function URL);
// any other cron service that can POST with a bearer token works too.
//
// Deploy with: `supabase functions deploy send-shift-reminders --no-verify-jwt`
// (--no-verify-jwt because the cron caller has no end-user session — this
// function authenticates itself to the DB via the service role key instead)
// Requires secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected by the
// platform, no need to set those yourself.
//
// What it does: finds shifts starting in roughly the next hour across
// every org, and sends a push to whichever assigned employee has
// push_prefs.shiftReminder enabled — once per shift instance
// (shift_reminders_sent guards a re-run within the same lead-time window
// from sending the same reminder twice).
//
// Timezone note: shifts are stored as plain "Mon" + "09:00" wall-clock
// values with no timezone anywhere in the schema, so this job reads
// organizations.timezone (defaults to Europe/Copenhagen — see the
// migration) to know which real-world instant that wall-clock time means.

const REMIND_MIN_AHEAD = 50  // remind for shifts starting at least this many minutes out...
const REMIND_MAX_AHEAD = 70  // ...and at most this many — a ~20min window matched to a ~10-15min poll cadence

// Turns "now" (a real instant) into a Date whose y/m/d/h/m getters read as
// the wall-clock time in `timeZone` — the standard workaround since Deno/JS
// has no direct "give me a Date in this timezone" constructor.
function nowInTimeZone(timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date())
  const get = (type: string) => parts.find((p) => p.type === type)?.value
  return new Date(
    Number(get('year')), Number(get('month')) - 1, Number(get('day')),
    Number(get('hour')) % 24, Number(get('minute')), Number(get('second'))
  )
}

// Same weekKey convention as lib/dates.js's weekKey() (Monday's date as
// YYYY-MM-DD), plus the DAYS-array day name and minutes-since-midnight —
// everything this job needs to look up "today's" schedule row and compare
// against each block's start time.
function localWeekContext(nowLocal: Date) {
  const dow = nowLocal.getDay() // 0=Sun..6=Sat
  const mondayOffset = dow === 0 ? -6 : 1 - dow
  const monday = new Date(nowLocal)
  monday.setDate(nowLocal.getDate() + mondayOffset)
  const weekKey = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
  const dayName = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][(dow + 6) % 7]
  const minutesSinceMidnight = nowLocal.getHours() * 60 + nowLocal.getMinutes()
  return { weekKey, dayName, minutesSinceMidnight }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
    const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
    const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:hello@rorota.net'
    if (!supabaseUrl || !serviceKey) throw new Error('Supabase service credentials not set')
    if (!publicKey || !privateKey) throw new Error('VAPID keys not set')
    webpush.setVapidDetails(subject, publicKey, privateKey)

    const admin = createClient(supabaseUrl, serviceKey)

    const [{ data: orgs, error: orgErr }, { data: blocksAll, error: blkErr }] = await Promise.all([
      admin.from('organizations').select('id, timezone'),
      admin.from('blocks').select('id, org_id, start_time'),
    ])
    if (orgErr) throw orgErr
    if (blkErr) throw blkErr

    let sent = 0

    for (const org of orgs || []) {
      const tz = org.timezone || 'Europe/Copenhagen'
      const nowLocal = nowInTimeZone(tz)
      const { weekKey, dayName, minutesSinceMidnight } = localWeekContext(nowLocal)

      const { data: schedRow } = await admin.from('schedules').select('data')
        .eq('org_id', org.id).eq('week_key', weekKey).eq('status', 'confirmed').maybeSingle()
      const daySchedule = schedRow?.data?.schedule?.[dayName]
      if (!daySchedule) continue

      const orgBlocks = (blocksAll || []).filter((b: any) => b.org_id === org.id)

      for (const block of orgBlocks) {
        const assigned = daySchedule[block.id]
        if (!assigned?.length) continue

        const [bh, bm] = String(block.start_time || '00:00').split(':').map(Number)
        const startMin = bh * 60 + bm
        const minsAhead = startMin - minutesSinceMidnight
        if (minsAhead < REMIND_MIN_AHEAD || minsAhead > REMIND_MAX_AHEAD) continue

        for (const a of assigned) {
          if (!a.empId || a.noShow) continue

          const { data: already } = await admin.from('shift_reminders_sent').select('emp_id')
            .eq('org_id', org.id).eq('week_key', weekKey).eq('day', dayName).eq('block_id', block.id).eq('emp_id', a.empId).maybeSingle()
          if (already) continue

          const { data: emp } = await admin.from('employees').select('push_prefs').eq('id', a.empId).maybeSingle()
          if (!emp?.push_prefs?.enabled || emp.push_prefs?.shiftReminder === false) continue

          const { data: subs } = await admin.from('push_subscriptions').select('endpoint,p256dh,auth').eq('emp_id', a.empId)
          if (!subs?.length) continue

          const shiftStart = a.start || block.start_time
          await Promise.allSettled(subs.map((s: any) => webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({ title: 'Rorota', body: `Your shift starts at ${shiftStart}`, url: '/' })
          )))
          // Recorded even if every send above failed (e.g. all subscriptions
          // expired) — the point is "don't check this shift again", not
          // "a push definitely landed".
          await admin.from('shift_reminders_sent').insert({ org_id: org.id, week_key: weekKey, day: dayName, block_id: block.id, emp_id: a.empId })
          sent++
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, sent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
