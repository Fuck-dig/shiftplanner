import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// Generic transactional-email sender for in-app events (schedule published,
// time-off decided, shift swap resolved, etc.) — deliberately kept separate
// from send-invite, which has its own invite-flavored copy and defaults.
// This one always expects the caller to supply subject/body; it just wraps
// them in the same visual shell.
//
// Deploy with: `supabase functions deploy send-notification`
// Requires the RESEND_API_KEY secret (already set for send-invite, since
// both use the same Resend account/domain).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { to, subject, body, ctaLabel, ctaUrl } = await req.json()
    if (!to) throw new Error('Missing "to"')
    if (!subject) throw new Error('Missing "subject"')

    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) throw new Error('RESEND_API_KEY not set')

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Rorota <invites@rorota.net>',
        to: [to],
        subject,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
            <div style="font-size:24px;font-weight:600;margin-bottom:8px">Rorota</div>
            <div style="font-size:14px;color:#666;margin-bottom:32px">Shift scheduling</div>
            <div style="font-size:16px;line-height:1.6;white-space:pre-line">${body || subject}</div>
            <div style="margin-top:32px">
              <a href="${ctaUrl || 'https://rorota.net'}" style="display:inline-block;padding:12px 24px;background:#BF5A2C;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:500">${ctaLabel || 'Open Rorota'}</a>
            </div>
            <div style="margin-top:32px;font-size:12px;color:#999">Sent via Rorota · rorota.net</div>
          </div>
        `,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Resend error: ${err}`)
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
