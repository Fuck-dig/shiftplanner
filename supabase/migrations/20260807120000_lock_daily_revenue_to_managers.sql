-- ============================================================================
-- Rorota — daily_revenue: managers only, on every operation
-- ============================================================================
-- Run the whole file in the Supabase SQL editor. Safe to re-run.
--
-- THE GAP
--
-- `daily_revenue` holds the restaurant's takings, one row per calendar day.
-- Its four policies (from 20260723180000) were each gated only on "are you in
-- this org":
--
--   for select using (org_id in (select org_id from memberships
--                                where user_id = auth.uid()))
--   ... and the same for insert, update and delete.
--
-- So any employee with a Rorota login could read every day's revenue for their
-- restaurant straight from the REST API, and write to it too — set a day's
-- takings to anything, or delete the lot. Not reachable through the UI: the
-- only screen that touches this table is Costs, inside the manager Dashboard,
-- which never renders for an employee login. But RLS is the real boundary and
-- the UI is not, so "you'd have to go looking" is not a control.
--
-- Lower severity than the invitations hole (4/10 vs 9/10): it is confined to
-- your own org, it grants no privileges, and it can't be used to reach another
-- restaurant. It is business data an employee has no reason to hold.
--
-- WHY THIS ONE IS CLEAN
--
-- The other still-open tables — shift_swaps, notifications, messages,
-- message_replies, schedule_templates, push_subscriptions — all have staff
-- legitimately writing to them (claiming a shift, marking a message read), so
-- each needs per-operation thought about which writes to allow. daily_revenue
-- has no such carve-out: staff neither read nor write it, in any flow. Manager
-- on all four operations, no exceptions.
--
-- Verified against the client before writing this: `fetchDailyRevenue` and
-- `saveDailyRevenue` in lib/data.js are called only from Dashboard.jsx, which
-- passes them to CostsView. Dashboard renders only when role is owner or
-- manager (App.jsx). EmployeeView and KioskView never reference either.
-- is_manager() is owner-or-manager, so the database gate and the client gate
-- are the same set of people.
-- ============================================================================


-- ── Replace all four policies ───────────────────────────────────────────────
-- Every create is preceded by a drop of ITS OWN name as well as the old name.
-- Postgres has no `create policy if not exists`, and dropping only the OLD name
-- is what made 20260804180000 fail with 42710 on its second run.

-- SELECT
drop policy if exists "org members can read daily_revenue" on public.daily_revenue;
drop policy if exists "managers read daily_revenue"        on public.daily_revenue;
create policy "managers read daily_revenue" on public.daily_revenue
  for select using (public.is_manager(org_id));

-- INSERT
drop policy if exists "org members can insert daily_revenue" on public.daily_revenue;
drop policy if exists "managers insert daily_revenue"        on public.daily_revenue;
create policy "managers insert daily_revenue" on public.daily_revenue
  for insert with check (public.is_manager(org_id));

-- UPDATE. `with_check` stated explicitly rather than left to default: an UPDATE
-- policy with no with_check silently reuses its USING expression, which is the
-- exact mechanism that made the invitations hole writable. Same expression here
-- either way — the point is that it is written down rather than inferred.
drop policy if exists "org members can update daily_revenue" on public.daily_revenue;
drop policy if exists "managers update daily_revenue"        on public.daily_revenue;
create policy "managers update daily_revenue" on public.daily_revenue
  for update using (public.is_manager(org_id))
         with check (public.is_manager(org_id));

-- DELETE
drop policy if exists "org members can delete daily_revenue" on public.daily_revenue;
drop policy if exists "managers delete daily_revenue"        on public.daily_revenue;
create policy "managers delete daily_revenue" on public.daily_revenue
  for delete using (public.is_manager(org_id));


-- ── Verify (read-only; run after the above) ─────────────────────────────────

-- 1. Expect exactly four rows, all four commands, every expression
--    `is_manager(org_id)`. Anything still mentioning `memberships` directly is
--    an old policy that did not get dropped.
select cmd,
       policyname,
       coalesce(qual, '-')       as using_expr,
       coalesce(with_check, '-') as check_expr,
       case
         when coalesce(qual, '') like '%is_manager%'
           or coalesce(with_check, '') like '%is_manager%' then 'ok'
         else 'STILL OPEN TO ALL ORG MEMBERS'
       end as verdict
from pg_policies
where schemaname = 'public' and tablename = 'daily_revenue'
order by cmd, policyname;

-- 2. THE ONE THAT ACTUALLY MATTERS. Permissive policies are OR'd, so a single
--    leftover org-members policy sitting beside the new one would make all of
--    the above pointless — that is precisely what happened on `organizations`
--    on 4 Aug. Expect ZERO ROWS.
select cmd, count(*) as permissive_policies,
       string_agg(policyname, '  |  ' order by policyname) as which
from pg_policies
where schemaname = 'public' and tablename = 'daily_revenue' and permissive = 'PERMISSIVE'
group by cmd
having count(*) > 1;

-- 3. RLS must actually be on, or none of the above applies. Expect true.
select relname as table_name, relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'daily_revenue';
