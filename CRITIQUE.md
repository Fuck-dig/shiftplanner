# Rorota — State of the App, July 2026

Honest critique, written after a full pass over the codebase (security model, testing, deploy process, and this session's UI/color/hardcoding audits). Each item has a severity out of 10 for "how worried should William be about this right now." Overall score at the bottom.

## 1. RLS lets any org member read/delete anything in that org — severity 7/10

Every table's row-level security policy checks only "are you a member of this org," never role. That was a reasonable shortcut when it only covered schedules and shift swaps — a "manager-only" screen in the UI is a real deterrent for a non-technical staff member.

It now also covers `employee_documents` (ID scans, contracts) and employee wages. Any logged-in employee already has a valid session. Opening browser devtools and calling the Supabase REST endpoint directly — no special access needed, just the org's own anon key, which ships in the client bundle — would let them read or delete a coworker's uploaded documents, or see anyone's wage. The "manager-only" gate is UI-only; the database itself has no opinion.

This requires some technical curiosity to exploit (most employees won't open devtools), which is why it's a 7 and not a 9 or 10. But it's the one gap here involving genuinely sensitive personal documents, and it doesn't require a sophisticated attacker — just someone who knows they can hit F12.

**What to do about it:** add role-aware RLS policies for `employee_documents` and wage fields specifically (check `memberships.role = 'manager'`/`'owner'`, not just org membership), rather than relying on the UI to hide the button.

## 2. New signups see a fake staffed restaurant — severity 4/10

When an org's employee list is empty, the app falls back to a hardcoded list of 12 Danish employees with fake wages and displays them as if they belong to that org. Nothing is written to the database until the owner edits something — but the first thing a brand-new customer sees is someone else's staff roster already sitting there. If they edit even one entry before deleting the rest, the whole fake roster gets synced into their real database for good.

Not dangerous, just a bad first impression and a symptom of the app having only ever been tested through your own account. Easy fix: seed new orgs with an empty state (or a clearly-labeled "example data" the user opts into), not indistinguishable fake data.

## 3. Test coverage is one file, and nothing runs it automatically — severity 5/10

43 vitest tests exist, all covering `schedule.js` scheduling math. Nothing tests the Supabase data layer, no component tests, no end-to-end flow, and there's no CI pipeline — tests only run when I run them by hand before we call a change done. Every feature shipped this session (push notifications, documents, overtime warnings) was verified by you clicking through it once in production, not by an automated suite.

This isn't urgent on its own, but it's the reason bugs like the hardcoded currency and the color/locale issues existed for as long as they did — nothing was checking for them until someone went looking.

## 4. No error boundary — severity 4/10

One uncaught exception anywhere in the component tree currently takes down the whole app to a blank white screen, with no fallback UI and no way for a user to recover without a hard refresh.

## 5. Fully manual deploys, no staging environment — severity 4/10

Every change goes: edited locally → you run `git add/commit/push` yourself → Vercel builds → you spot-check production. There's no environment between "on my machine" and "live for paying customers." Fine at current scale and change velocity, but it means every change ships straight to real schedules with no automated gate and no safety net beyond a manual look.

## 6. Single ~760kB JS bundle, no code splitting — severity 2/10

Not a correctness problem, just a performance one that will start to matter more as the app or user base grows, especially on slow connections.

## What's actually solid

The i18n setup is unusually disciplined for a one-person project — three fully verified languages with no missing keys. The design-token system is clean and, after this session's fixes, consistently applied across light and dark mode. The RLS convention is at least uniform even where it's permissive (easy to reason about, even if the permission model itself needs tightening). Small UX details — like inputs that let you clear a number field fully instead of snapping back to 0 — show real attention to how the app actually feels to use day-to-day.

## Overall: 5/10 worried

Nothing here suggests active exploitation or data loss, and most of it is fixable without a rewrite. But there's one real gap involving sensitive documents that's worth closing before more real orgs sign up, and a general pattern — no tests, no CI, no staging, single-account testing — that means the next bug like the currency/color ones won't get caught until a customer hits it. If you're staying small and hands-on, the current setup is workable. If Rorota is going to have restaurants you don't personally know using it, items 1 and 3 move up the priority list.
