-- ============================================================================
-- Rorota — remove a stray permissive policy that was cancelling out the last fix
-- ============================================================================
-- Run the whole file in the Supabase SQL editor. Safe to re-run.
--
-- WHAT HAPPENED
--
-- 20260804200000 replaced "members update orgs" with a manager-gated policy.
-- Its verification query then reported a SECOND update policy on the same
-- table that nothing in this repo had ever created:
--
--   organizations UPDATE "org members can update organizations"   <- dashboard
--   organizations UPDATE "managers update orgs"                   <- ours
--
-- **Multiple permissive policies for the same command are OR'd together.**
-- Postgres allows the row if ANY of them passes. So the loosest one wins, and
-- ours was doing nothing at all: any employee could still rename the
-- restaurant and rewrite its settings JSON.
--
-- This is the second time in one day that a dashboard-created policy nobody
-- had written down turned out to matter — the first was the `invitations` pair
-- behind the account-takeover. It is also a trap worth naming generally:
-- tightening a policy does NOT tighten a table. You have to know every
-- permissive policy on it, and adding one is strictly a widening operation.
--
-- Checked before dropping: `organizations` is written only from the manager
-- Dashboard (saveRoleStyles, saveOrgCurrency). No staff or kiosk path touches
-- it, so managers keeping the only write path breaks nothing.
-- ============================================================================


drop policy if exists "org members can update organizations" on public.organizations;


-- ── Verify: nothing should be OR-able with a manager-gated write ────────────
-- Any table+command appearing here has more than one PERMISSIVE policy, which
-- means the loosest of them decides. That is occasionally intended, but it is
-- never something to leave un-noticed — and it is invisible unless you go
-- looking, which is the whole reason this query exists.
select tablename,
       cmd,
       count(*)                                as permissive_policies,
       string_agg(policyname, '  |  ' order by policyname) as which,
       'loosest one wins — confirm that is intended' as note
from pg_policies
where schemaname = 'public' and permissive = 'PERMISSIVE'
group by tablename, cmd
having count(*) > 1
order by tablename, cmd;
