-- ============================================================================
-- Rorota — sick pay: an org default with a per-employee override
-- ============================================================================
-- Run the whole file in the Supabase SQL editor. Safe to re-run.
--
-- WHAT THIS IS FOR
--
-- Until now a sick day cost nothing. Someone on approved leave simply wasn't in
-- the schedule, so Costs counted zero hours and zero money for them, and the
-- breakdown row showed "off" instead of a figure. For any restaurant that pays
-- sick leave, the labour cost on that tab was therefore understated, silently,
-- with nothing on screen to hint at it.
--
-- TWO COLUMNS, AND WHY BOTH
--
-- `organizations.sick_pay_pct` is the restaurant's default. `employee_wages
-- .sick_pay_pct` overrides it for one person, and is NULLABLE on purpose: null
-- means "inherit", which is different from 0 meaning "this person gets
-- nothing". Collapsing those two into one column would make it impossible to
-- express a deliberate zero, and the client's effectiveSickPct() is written
-- against exactly that distinction (there is a test for it).
--
-- The default is 100 rather than 0 because a restaurant enabling this feature
-- almost certainly pays something, and full pay is the common case. An org that
-- pays nothing sets 0 and sees no sick cost at all.
--
-- NO SCHEMA CHANGE IS NEEDED FOR THE SHIFTS THEMSELVES. Assignments live in the
-- `data` JSON column on `schedules`, so the `sick` flag on an assignment needs
-- no migration — it travels with the schedule like `noShow` already does.
--
-- WHERE THE VALUES SIT, SECURITY-WISE
--
-- `employee_wages` is already managers-only on all four operations
-- (20260728140000), and a new column inherits the table's policies — RLS
-- filters rows, not columns, so there is nothing extra to grant or deny here.
-- Someone's sick pay percentage is as sensitive as their wage and now lives
-- beside it, under the same lock.
--
-- `organizations` is readable by every member of the org. The default sick pay
-- percentage is a restaurant-level policy number, not personal data, so that is
-- the right level — but worth stating rather than assuming, because writes to
-- `organizations` are manager-gated and reads are not.
-- ============================================================================


-- ── 1. Org-level default ────────────────────────────────────────────────────
alter table public.organizations
  add column if not exists sick_pay_pct numeric not null default 100;

-- Belt and braces: a percentage outside 0–100 is always a mistake, and this is
-- a number that silently multiplies money. Named so a re-run can drop it first.
alter table public.organizations
  drop constraint if exists organizations_sick_pay_pct_range;
alter table public.organizations
  add constraint organizations_sick_pay_pct_range
  check (sick_pay_pct >= 0 and sick_pay_pct <= 100);


-- ── 2. Per-employee override ────────────────────────────────────────────────
-- NULL = inherit the org default. 0 = this person genuinely gets nothing.
alter table public.employee_wages
  add column if not exists sick_pay_pct numeric;

alter table public.employee_wages
  drop constraint if exists employee_wages_sick_pay_pct_range;
alter table public.employee_wages
  add constraint employee_wages_sick_pay_pct_range
  check (sick_pay_pct is null or (sick_pay_pct >= 0 and sick_pay_pct <= 100));


-- ── 3. Verify (read-only; run after the above) ──────────────────────────────

-- Expect two rows: organizations.sick_pay_pct NOT NULL default 100, and
-- employee_wages.sick_pay_pct nullable with no default.
select table_name, column_name, data_type, is_nullable,
       coalesce(column_default, '(none)') as default_value
from information_schema.columns
where table_schema = 'public'
  and column_name = 'sick_pay_pct'
order by table_name;

-- Expect both range checks present.
select rel.relname as table_name, con.conname as constraint_name,
       pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace n on n.oid = rel.relnamespace
where n.nspname = 'public' and con.conname like '%sick_pay_pct%'
order by rel.relname;

-- Sanity: every org now has a default, and nobody has an out-of-range override.
select (select count(*) from public.organizations where sick_pay_pct is null)                    as orgs_missing_default,
       (select count(*) from public.employee_wages where sick_pay_pct is not null)               as employees_with_override,
       (select count(*) from public.employee_wages
         where sick_pay_pct is not null and (sick_pay_pct < 0 or sick_pay_pct > 100))            as out_of_range;
