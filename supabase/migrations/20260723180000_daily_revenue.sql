-- ============================================================================
-- Rorota — daily revenue (for labor-cost-% tracking)
-- ============================================================================
-- Run this once in the Supabase SQL editor for your project (or via
-- `supabase db push`).
--
-- One row per org per calendar day — the manager types in that day's actual
-- sales from Costs, and the app compares it against that same day's
-- scheduled labor cost (a "labor cost %" figure, the same KPI tools like
-- Planday surface). Right now this is entirely hand-entered — there's no
-- POS/point-of-sale integration behind it yet.
--
-- The `source` column exists for that future integration, not for anything
-- today: whichever POS eventually gets hooked up (Zettle, Flatpay, OnlinePOS,
-- whatever) would just call the same upsert this manual entry already uses,
-- tagged 'pos:<provider>' instead of 'manual'. Adding the column now avoids a
-- second migration later, and gives the app a way to tell "the manager typed
-- this" apart from "a POS pushed this" if that ever matters (e.g. not
-- silently overwriting a manual correction, or showing where a number came
-- from) — none of that UI exists yet, only the column to build it on top of.
--
-- Security model matches the rest of the schema (see the notes in
-- 20260721120000_swaps_notifications_templates.sql): every policy only
-- checks org membership, not role — the app UI is what limits editing to
-- managers, not the database.
-- ============================================================================

create table if not exists daily_revenue (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  date       date not null,
  amount     numeric not null default 0,
  source     text not null default 'manual', -- 'manual' | 'pos:<provider>' once a POS integration exists
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(org_id, date)
);
create index if not exists daily_revenue_org_date_idx on daily_revenue (org_id, date);

alter table daily_revenue enable row level security;

drop policy if exists "org members can read daily_revenue" on daily_revenue;
create policy "org members can read daily_revenue" on daily_revenue
  for select using (org_id in (select org_id from memberships where user_id = auth.uid()));
drop policy if exists "org members can insert daily_revenue" on daily_revenue;
create policy "org members can insert daily_revenue" on daily_revenue
  for insert with check (org_id in (select org_id from memberships where user_id = auth.uid()));
drop policy if exists "org members can update daily_revenue" on daily_revenue;
create policy "org members can update daily_revenue" on daily_revenue
  for update using (org_id in (select org_id from memberships where user_id = auth.uid()));
drop policy if exists "org members can delete daily_revenue" on daily_revenue;
create policy "org members can delete daily_revenue" on daily_revenue
  for delete using (org_id in (select org_id from memberships where user_id = auth.uid()));
