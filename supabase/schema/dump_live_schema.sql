-- ============================================================================
-- Rorota — regenerate the live-schema snapshot
-- ============================================================================
-- READ-ONLY. Paste into the Supabase SQL editor, run, copy each result into
-- the matching section of `live_snapshot.md`, and commit that.
--
-- Why this exists: on 4 Aug 2026 two security findings both came from things
-- that were in the DATABASE but in no file anywhere — the base tables were
-- created in the dashboard, and the `invitations` policies (the ones behind a
-- cross-tenant account takeover) existed in no migration and no saved query.
-- Nobody had reviewed them because there was nothing to review.
--
-- A snapshot in git doesn't prevent that on its own. What it does is make the
-- next drift VISIBLE: re-run this, diff the output against the committed file,
-- and anything that appeared out of band shows up in the diff.
--
-- Worth running after any dashboard change, and before any security review.
-- ============================================================================


-- ── 1. Tables and columns ───────────────────────────────────────────────────
select table_name, ordinal_position, column_name, data_type, is_nullable,
       coalesce(column_default, '') as default_value
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;


-- ── 2. Constraints (PK / FK / UNIQUE) ───────────────────────────────────────
-- The unique (org_id, user_id) on memberships is load-bearing for the
-- invitation fix: it is what stops a second membership row being inserted.
select tc.table_name, tc.constraint_type, tc.constraint_name,
       string_agg(kcu.column_name, ', ' order by kcu.ordinal_position) as columns
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
where tc.table_schema = 'public' and tc.constraint_type in ('PRIMARY KEY','FOREIGN KEY','UNIQUE')
group by tc.table_name, tc.constraint_type, tc.constraint_name
order by tc.table_name, tc.constraint_type;


-- ── 3. RLS on/off per table ─────────────────────────────────────────────────
-- A table with rls_enabled = false is wide open to every logged-in user
-- regardless of what policies exist, because this project grants blanket DML
-- to `authenticated`. One false here undoes everything else.
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname) as policy_count
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relrowsecurity, c.relname;


-- ── 4. Every policy, as re-creatable DDL ────────────────────────────────────
-- This is the section that matters most. Diff it against the committed copy.
select 'create policy "' || policyname || '" on ' || tablename
       || ' for ' || lower(cmd)
       || ' to ' || array_to_string(roles, ',')
       || coalesce(' using (' || qual || ')', '')
       || coalesce(' with check (' || with_check || ')', '')
       || ';' as policy_ddl
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;


-- ── 5. Functions, and which ones bypass RLS ─────────────────────────────────
-- Each SECURITY DEFINER is a deliberate hole in the permission model. There
-- should be exactly five: is_member, is_manager, my_employee_id,
-- create_organization, accept_my_invitations, update_my_profile. Anything else
-- appearing here needs explaining.
select p.proname as function_name,
       case when p.prosecdef then 'SECURITY DEFINER' else 'invoker' end as mode,
       pg_get_function_identity_arguments(p.oid) as args,
       coalesce((select option_value from pg_options_to_table(p.proconfig)
                 where option_name = 'search_path'), '(not pinned)') as search_path
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.prosecdef desc, p.proname;


-- ── 6. Raw table grants ─────────────────────────────────────────────────────
-- RLS sits on top of these. `anon` = not logged in at all; it should not
-- appear here for anything.
select grantee, table_name,
       string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon','authenticated')
group by grantee, table_name
order by grantee, table_name;


-- ── 7. Overlapping permissive policies ──────────────────────────────────────
-- THE SUBTLE ONE. Multiple PERMISSIVE policies for the same command are OR'd:
-- Postgres allows the row if ANY of them passes, so the LOOSEST decides.
--
-- This bit us on 4 Aug: a manager-gated update policy on `organizations` was
-- doing nothing, because a dashboard-created "org members can update
-- organizations" sat alongside it. Tightening a policy does not tighten a
-- table — adding one is strictly a widening operation.
--
-- Anything listed here needs a deliberate "yes, that's intended".
select tablename, cmd, count(*) as permissive_policies,
       string_agg(policyname, '  |  ' order by policyname) as which
from pg_policies
where schemaname = 'public' and permissive = 'PERMISSIVE'
group by tablename, cmd
having count(*) > 1
order by tablename, cmd;
