-- ============================================================================
-- Rorota — security audit: dump the REAL access-control state
-- ============================================================================
-- Paste the whole file into the Supabase SQL editor and run it. Everything
-- here is READ-ONLY — it only queries catalog views. Nothing is created,
-- altered or deleted.
--
-- Why this exists: memberships, invitations, employees, time_off and
-- organizations have no `create table` in any migration, so they were made in
-- the dashboard and their DDL and policies live nowhere in version control.
-- The repo therefore cannot answer "is this secure?" — only the database can.
--
-- Copy each result set back and we'll go through them together.
-- ============================================================================


-- ── 1. Is RLS actually ON for every table? ──────────────────────────────────
-- A table with rls_enabled = false is readable and writable by ANY logged-in
-- user regardless of what policies exist. This is the first thing to check:
-- one table missing it undoes everything else.
select
  c.relname                                as table_name,
  c.relrowsecurity                         as rls_enabled,
  c.relforcerowsecurity                    as rls_forced,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname) as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relrowsecurity asc, c.relname;


-- ── 2. Every policy, and whether it checks ROLE or only membership ──────────
-- `role_aware = false` means: any member of the org can do this, employee or
-- owner alike. That's the app's documented convention for most tables, so it
-- is not automatically wrong — but it IS the full list of what a plain
-- employee can do straight from the REST API with the anon key that ships in
-- the JS bundle. Read it as "things staff can do without the UI's permission".
select
  tablename,
  policyname,
  cmd                                                as operation,
  roles,
  (coalesce(qual,'') || ' ' || coalesce(with_check,'')) ilike '%role%'
                                                     as role_aware,
  qual                                               as using_expression,
  with_check                                         as with_check_expression
from pg_policies
where schemaname = 'public'
order by (coalesce(qual,'') || ' ' || coalesce(with_check,'')) ilike '%role%', tablename, cmd;


-- ── 3. THE ONE THAT MATTERS MOST: can someone grant themselves a role? ──────
-- The memberships INSERT policy in the repo checks that you're inserting a row
-- for yourself AND that an unused invitation exists for your email — but it
-- never constrains the `role` column being inserted. If that is the live
-- policy, someone invited as an 'employee' may be able to insert themselves as
-- 'owner' or 'manager'.
--
-- What to look for in the output:
--   * an INSERT policy whose with_check does NOT mention `role` -> escalation
--     is plausible; we should tighten it to compare against invitations.role
--   * an UPDATE or DELETE policy on memberships at all -> a member may be able
--     to change their own or someone else's role after the fact
select
  policyname,
  cmd as operation,
  case
    when (coalesce(qual,'') || ' ' || coalesce(with_check,'')) ilike '%role%'
      then 'mentions role — probably OK, read it'
    else 'DOES NOT CHECK ROLE — investigate'
  end as verdict,
  qual        as using_expression,
  with_check  as with_check_expression
from pg_policies
where schemaname = 'public' and tablename = 'memberships'
order by cmd;


-- ── 4. Does the invitations table even record a role to compare against? ────
-- The fix for #3 is to make the memberships policy check that the role being
-- inserted matches the role on the invitation. That only works if invitations
-- actually stores one, and if a plain user cannot edit their own invitation
-- row to say 'owner' first.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'invitations'
order by ordinal_position;

select policyname, cmd as operation, qual as using_expression, with_check as with_check_expression
from pg_policies
where schemaname = 'public' and tablename = 'invitations'
order by cmd;


-- ── 5. Tables with RLS on but NO policies, and the reverse ─────────────────
-- RLS on + zero policies = nobody can touch it (this is the deliberate pattern
-- used for employee_documents/employee_wages against plain employees, so some
-- rows here are EXPECTED).
-- RLS off + policies = the policies are decorative and enforce nothing.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  count(p.policyname) as policy_count,
  case
    when c.relrowsecurity and count(p.policyname) = 0 then 'locked (no policies) — intended for wages/documents'
    when not c.relrowsecurity and count(p.policyname) > 0 then 'POLICIES NOT ENFORCED — rls is off'
    when not c.relrowsecurity then 'WIDE OPEN — rls off, no policies'
    else 'ok'
  end as verdict
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policies p on p.schemaname = 'public' and p.tablename = c.relname
where n.nspname = 'public' and c.relkind = 'r'
group by c.relname, c.relrowsecurity
having not c.relrowsecurity or count(p.policyname) = 0
order by c.relrowsecurity, c.relname;


-- ── 6. What the anon/authenticated roles can reach, RLS aside ──────────────
-- RLS is a filter on top of normal SQL grants. If `anon` has table privileges
-- somewhere it shouldn't, that's a separate hole. anon = not logged in at all.
select grantee, table_name, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon','authenticated')
group by grantee, table_name
order by grantee, table_name;


-- ── 7. Views bypass RLS unless they're security_invoker ────────────────────
-- A plain view runs as its OWNER, so it can hand out rows the caller's own
-- policies would have blocked. Any view here that isn't security_invoker=true
-- needs reading carefully.
select
  c.relname as view_name,
  coalesce((
    select option_value from pg_options_to_table(c.reloptions)
    where option_name = 'security_invoker'
  ), 'false') as security_invoker
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v'
order by 2, 1;


-- ── 8. Functions that run as their definer bypass the caller's RLS ─────────
-- SECURITY DEFINER is legitimate for controlled operations, but each one is an
-- intentional hole in the permission model and should be read.
select p.proname as function_name,
       case when p.prosecdef then 'SECURITY DEFINER — read this one' else 'invoker' end as mode
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
order by p.proname;


-- ── 9. Where are the kiosk PINs, and who can read them? ────────────────────
-- The kiosk is the one screen anyone walking past can use, so its PINs are
-- worth knowing the storage and exposure of. Empty result = no such column.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (column_name ilike '%pin%' or column_name ilike '%secret%' or column_name ilike '%token%')
order by table_name, column_name;
