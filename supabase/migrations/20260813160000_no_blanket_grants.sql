-- ============================================================================
-- Rorota — stop handing every FUTURE table to every logged-in user
-- ============================================================================
-- Run the whole file in the Supabase SQL editor. Safe to re-run.
-- Safe to run on production: see "WHAT THIS DOES NOT DO" before you worry.
--
-- WHY NOW
--
-- Rorota is going to be sold to other restaurants. Today the only tenant is
-- Almus, so a hole leaks your data to yourself. With a paying customer, one
-- restaurant reading another's wages is a personal-data breach involving people
-- who never agreed to anything with us.
--
-- The current position is strong and this exists to keep it that way:
--   * all 17 tables in `public` have RLS enabled
--   * 68 of 68 policies scope by org or by user
--     (`managers update orgs` goes through is_manager(id), which is scoping —
--      it just doesn't say org_id out loud)
--
-- THE FOOTGUN
--
-- The baseline schema ran:
--
--   grant select, insert, update, delete on all tables in schema public to authenticated;
--   alter default privileges in schema public
--     grant select, insert, update, delete on tables to authenticated;
--
-- The first line is history: it already applied, to tables that all have RLS.
-- The SECOND line is a standing instruction. Every table created from now on is
-- fully writable by any logged-in user from the moment it exists — before
-- anyone remembers to enable RLS on it. The dangerous window is not a mistake
-- somebody makes; it is the default, and the person hitting it will be William,
-- late, adding something a customer asked for.
--
-- WHAT THIS DOES
--
--   1. Cancels that standing instruction, so a new table arrives with NO access
--      for `authenticated` and the app fails loudly and immediately instead of
--      the table being quietly world-writable.
--   2. Re-grants the 17 tables that exist today, explicitly and by name. This
--      changes nothing — they already hold exactly these grants — but it makes
--      the access list something you can read rather than infer.
--   3. Adds `public.tables_missing_rls()` so "is anything unprotected?" is one
--      query instead of an audit.
--
-- WHAT THIS DOES NOT DO
--
-- It does not revoke anything from an existing table. Nothing that works today
-- stops working. RLS is what protects those rows, and it is untouched.
--
-- THE COST, ACCEPTED DELIBERATELY
--
-- After this, adding a table means also adding its grant. Forgetting shows up
-- instantly as a permission error in development. That is the trade: a loud
-- failure in front of you, instead of a silent hole in front of a customer.
-- ============================================================================


-- ── 1. Cancel the standing grant for future tables ──────────────────────────
-- Must be run by the same role that set it (postgres). If this reports success
-- and step 4's verification still lists default ACLs, check `defaclrole`.
alter default privileges in schema public
  revoke select, insert, update, delete on tables from authenticated;

-- Same for anything the supabase_admin role creates on our behalf.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from authenticated;


-- ── 2. The 17 tables that exist today, by name ──────────────────────────────
-- Idempotent and a no-op in practice; the point is the list.
grant usage on schema public to authenticated;

grant select, insert, update, delete on public.organizations       to authenticated;
grant select, insert, update, delete on public.memberships         to authenticated;
grant select, insert, update, delete on public.employees           to authenticated;
grant select, insert, update, delete on public.blocks              to authenticated;
grant select, insert, update, delete on public.time_off            to authenticated;
grant select, insert, update, delete on public.schedules           to authenticated;
grant select, insert, update, delete on public.shift_swaps         to authenticated;
grant select, insert, update, delete on public.notifications       to authenticated;
grant select, insert, update, delete on public.schedule_templates  to authenticated;
grant select, insert, update, delete on public.messages            to authenticated;
grant select, insert, update, delete on public.message_replies     to authenticated;
grant select, insert, update, delete on public.push_subscriptions  to authenticated;
grant select, insert, update, delete on public.daily_revenue       to authenticated;
grant select, insert, update, delete on public.employee_documents  to authenticated;
grant select, insert, update, delete on public.employee_wages      to authenticated;
grant select, insert, update, delete on public.schedule_audit      to authenticated;
grant select, insert, update, delete on public.shift_reminders_sent to authenticated;


-- ── 3. A one-query answer to "is anything unprotected?" ─────────────────────
-- Returns a row per problem. An empty result is the pass condition.
--
-- Two different failures, deliberately reported together, because both mean
-- "this table is not protected" even though only one of them looks alarming:
--   no RLS       — the policies are not consulted at all
--   RLS, no policy — RLS on with zero policies denies everyone, which is safe
--                    but is almost always a half-finished migration
create or replace function public.tables_missing_rls()
returns table (table_name text, problem text)
language sql
security invoker
set search_path = ''
as $$
  select c.relname::text,
         case when not c.relrowsecurity then 'RLS NOT ENABLED — wide open to any logged-in user'
              else 'RLS on but NO POLICIES — denies everyone, probably unfinished'
         end
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and ( not c.relrowsecurity
          or not exists (select 1 from pg_policy p where p.polrelid = c.oid) )
  order by c.relname;
$$;

grant execute on function public.tables_missing_rls() to authenticated;


-- ── 4. Verify (read-only; run after the above) ──────────────────────────────

-- 1. THE important one. Expect ZERO ROWS.
--    Run this after every migration that adds a table.
select * from public.tables_missing_rls();

-- 2. No default privileges left for `authenticated` on tables in public.
--    Expect zero rows. If this still returns something, step 1 was run by a
--    role other than the one that granted them.
select pg_get_userbyid(defaclrole) as granted_by,
       defaclobjtype as obj_type,
       array_to_string(defaclacl, ', ') as acl
from pg_default_acl d
join pg_namespace n on n.oid = d.defaclnamespace
where n.nspname = 'public'
  and defaclobjtype = 'r'
  and array_to_string(defaclacl, ', ') like '%authenticated%';

-- 3. Every table still reachable — the 17 above should each appear.
--    This is the "did I break the app" check. Expect 17 rows.
select table_name, string_agg(privilege_type, ', ' order by privilege_type) as privs
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'authenticated'
group by table_name
order by table_name;

-- 4. Policy count per table, for the record. No table should read 0.
select c.relname as table_name,
       c.relrowsecurity as rls_on,
       count(p.polname) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relkind = 'r'
group by c.relname, c.relrowsecurity
order by c.relname;
