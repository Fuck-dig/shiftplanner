-- ============================================================================
-- Rorota — let a person read THEIR OWN wage, and add the pay-period start day
-- ============================================================================
-- Run the whole file in the Supabase SQL editor. Safe to re-run.
--
-- WHY THIS IS THE SENSITIVE ONE
--
-- `employee_wages` is currently manager-only on all four operations, and that
-- was deliberate: it is the table that holds what everyone earns. Opening it up
-- is the kind of change that goes wrong quietly, so this file does the smallest
-- possible thing and nothing else.
--
--   * SELECT only. No insert, update or delete — a person can SEE their pay,
--     they cannot set it. Those three policies stay manager-only, untouched.
--   * ONE ROW. The policy matches on `my_employee_id(org_id)`, the existing
--     SECURITY DEFINER helper that resolves the caller to their own employee
--     row by email. It cannot return a colleague's id, so this cannot return a
--     colleague's wage.
--   * PERMISSIVE policies are OR'd, so this sits ALONGSIDE the manager policy
--     rather than replacing it: managers keep seeing everyone, staff see
--     exactly themselves. Verified at the bottom, because "adding a policy is
--     always a widening operation" is the trap this project has hit before.
--
-- What a staff session can now learn: their own wage, contract type, contract
-- period and sick pay percentage. Nothing about anybody else. If a future
-- change adds a column to this table, it becomes visible to that person too —
-- so the rule for this table is that a column belongs here only if the person
-- it describes is allowed to see it.
--
-- ALSO IN THIS FILE: `organizations.pay_period_start_day`. Almus runs 16th to
-- 15th, but that is a restaurant-level agreement rather than anything
-- universal, so it is a setting with 16 as the default instead of a constant
-- compiled into the app.
-- ============================================================================


-- ── 1. A person can read their own wage row ─────────────────────────────────
drop policy if exists "read own wage" on public.employee_wages;
create policy "read own wage" on public.employee_wages
  for select using (employee_id = public.my_employee_id(org_id));


-- ── 2. Pay period start day ─────────────────────────────────────────────────
alter table public.organizations
  add column if not exists pay_period_start_day integer not null default 16;

-- 1–28 rather than 1–31: a start day of 29, 30 or 31 does not exist in every
-- month, so a period could silently fail to open in February. 28 is the
-- highest day that exists in all twelve.
alter table public.organizations
  drop constraint if exists organizations_pay_period_start_day_range;
alter table public.organizations
  add constraint organizations_pay_period_start_day_range
  check (pay_period_start_day between 1 and 28);


-- ── 3. Verify (read-only; run after the above) ──────────────────────────────

-- 3a. Expect exactly TWO select policies on employee_wages: the manager one and
--     the new self one. Any other command (insert/update/delete) must still be
--     manager-only — if a non-manager write policy appears here, stop.
select cmd, policyname, coalesce(qual,'-') as using_expr,
       case
         when cmd <> 'SELECT' and coalesce(qual,'') not like '%role in%' then 'CHECK THIS'
         else 'ok'
       end as verdict
from pg_policies
where schemaname = 'public' and tablename = 'employee_wages'
order by cmd, policyname;

-- 3b. THE ONE THAT MATTERS. The new policy must be scoped to my_employee_id.
--     If this returns 'SCOPED TO EVERYONE' then every employee can read every
--     wage in the restaurant, which is the whole risk of this migration.
select policyname,
       case when qual like '%my_employee_id%' then 'ok — own row only'
            else 'SCOPED TO EVERYONE — REVERT THIS' end as verdict
from pg_policies
where schemaname = 'public' and tablename = 'employee_wages'
  and policyname = 'read own wage';

-- 3c. Pay period column present, defaulting to 16.
select column_name, data_type, is_nullable, coalesce(column_default,'(none)') as default_value
from information_schema.columns
where table_schema='public' and table_name='organizations' and column_name='pay_period_start_day';
