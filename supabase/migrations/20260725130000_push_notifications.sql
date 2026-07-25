-- ============================================================================
-- Rorota — real (OS/browser) push notifications
-- ============================================================================
-- Run this once in the Supabase SQL editor for your project (or via
-- `supabase db push`).
--
-- Three pieces:
--   1. push_subscriptions — one row per subscribed browser/device, tied to
--      the employee it belongs to. Keyed by employee (not auth user_id) to
--      match this schema's existing convention (see `notifications`, which
--      is keyed by emp_id the same way) — RLS is org-membership-scoped like
--      everywhere else, not per-user, since that's the established trust
--      model here (see 20260721120000_swaps_notifications_templates.sql).
--   2. employees.push_prefs — per-employee master on/off + per-event
--      toggles, alongside the existing email_notifications boolean.
--   3. organizations.timezone + shift_reminders_sent — needed for the
--      shift-reminder cron job (supabase/functions/send-shift-reminders):
--      shifts are stored as plain "Mon"/"09:00" local wall-clock values
--      with no timezone anywhere in this schema, so the reminder job needs
--      to know which real-world timezone that wall-clock time is in.
--      Defaults to Europe/Copenhagen (this app's primary market — see the
--      hardcoded da-DK/kr formatting already throughout the UI); change it
--      per-org if you operate somewhere else.
--
-- Push notifications only ever apply to an employee who's matched their own
-- login to a roster row (myEmp in the app) — same gating the existing
-- "email notifications" toggle in Profile already uses — so a manager with
-- no employees row of their own simply won't see the push toggle at all,
-- consistent with that existing behavior rather than a new special case.
--
-- Safe to re-run: table/column/index creation is idempotent, policies are
-- dropped-then-recreated.
-- ============================================================================

alter table organizations add column if not exists timezone text not null default 'Europe/Copenhagen';

create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  emp_id     uuid not null references employees(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_emp_idx on push_subscriptions (emp_id);
create index if not exists push_subscriptions_org_idx on push_subscriptions (org_id);

alter table push_subscriptions enable row level security;

drop policy if exists "org members can read push_subscriptions" on push_subscriptions;
create policy "org members can read push_subscriptions" on push_subscriptions
  for select using (org_id in (select org_id from memberships where user_id = auth.uid()));
drop policy if exists "org members can insert push_subscriptions" on push_subscriptions;
create policy "org members can insert push_subscriptions" on push_subscriptions
  for insert with check (org_id in (select org_id from memberships where user_id = auth.uid()));
drop policy if exists "org members can update push_subscriptions" on push_subscriptions;
create policy "org members can update push_subscriptions" on push_subscriptions
  for update using (org_id in (select org_id from memberships where user_id = auth.uid()));
drop policy if exists "org members can delete push_subscriptions" on push_subscriptions;
create policy "org members can delete push_subscriptions" on push_subscriptions
  for delete using (org_id in (select org_id from memberships where user_id = auth.uid()));

-- Master "enabled" switch plus one toggle per push event category. The app
-- only ever checks these two levels (enabled, then the specific event) —
-- there's no separate "unsupported browser" state stored here, that's
-- purely a client-side check (see lib/push.js's pushSupported()).
alter table employees add column if not exists push_prefs jsonb not null default
  '{"enabled":false,"shiftChanges":true,"shiftReminder":true,"timeOffSwap":true,"messages":true}'::jsonb;

-- Bookkeeping only for the shift-reminder cron job (supabase/functions/
-- send-shift-reminders) — prevents it from sending the same "your shift
-- starts soon" push twice if it runs again inside the same shift's ~1hr
-- lead window. No client ever reads or writes this table directly (RLS is
-- enabled with zero policies below, so anon/authenticated access is denied
-- outright), only the edge function does, using the service role key which
-- bypasses RLS entirely.
create table if not exists shift_reminders_sent (
  org_id     uuid not null references organizations(id) on delete cascade,
  week_key   text not null,
  day        text not null,
  block_id   uuid not null references blocks(id) on delete cascade,
  emp_id     uuid not null references employees(id) on delete cascade,
  sent_at    timestamptz not null default now(),
  primary key (org_id, week_key, day, block_id, emp_id)
);
alter table shift_reminders_sent enable row level security;
