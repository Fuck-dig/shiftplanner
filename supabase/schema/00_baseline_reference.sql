-- ============================================================================
-- Rorota — the ORIGINAL base schema, as a historical record
-- ============================================================================
--                        ⚠️  DO NOT RUN THIS FILE  ⚠️
--
-- This is the script that first created the database. It is committed here
-- because until 4 Aug 2026 it existed ONLY as a saved snippet in the Supabase
-- dashboard — which meant the six tables underneath this entire app had their
-- definition written down nowhere a reviewer could see it. Two security
-- findings that day traced straight back to that gap.
--
-- The original opened with:
--
--     drop table if exists public.schedules     cascade;
--     drop table if exists public.time_off      cascade;
--     drop table if exists public.blocks        cascade;
--     drop table if exists public.employees     cascade;
--     drop table if exists public.memberships   cascade;
--     drop table if exists public.organizations cascade;
--
-- Those lines are removed here rather than commented, so that no amount of
-- select-all-and-run can resurrect them. Its own header claimed it was "safe
-- while the database has no real data" — that stopped being true months ago.
--
-- WHAT THIS FILE IS FOR: reading. It shows what the tables and the original
-- policies looked like, which is context you need when reasoning about the
-- migrations that followed. It is NOT the current state.
--
-- FOR THE CURRENT STATE: run `dump_live_schema.sql` and read
-- `live_snapshot.md`. Several policies here have since been replaced —
-- notably every `for all` policy at the bottom, superseded by
-- 20260804200000_split_for_all_policies.sql.
-- ============================================================================


-- ── Tables ──────────────────────────────────────────────────────────────────
create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  settings   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.memberships (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'owner',
  created_at timestamptz not null default now(),
  unique (org_id, user_id)   -- load-bearing: blocks a second membership row
);

-- NOTE: wage / contract_type / contract_period were dropped from this table on
-- 28 Jul 2026 and moved to employee_wages, which is manager-only at the RLS
-- level. They came along on every fetch of employees before that — including
-- the ones the staff app makes — so every employee's pay was landing in every
-- coworker's browser. See 20260728140000_employee_wages.sql.
create table public.employees (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  roles           jsonb not null default '["Other"]'::jsonb,
  priority        int not null default 100,
  contract_type   text not null default 'hourly',      -- since dropped
  contract_period text not null default 'week',        -- since dropped
  wage            numeric not null default 0,          -- since dropped
  max_hours       int not null default 40,
  availability    jsonb not null default '{}'::jsonb,
  pal_idx         int not null default 0,
  created_at      timestamptz not null default now()
);

create table public.blocks (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  name       text not null,
  start_time text not null,
  end_time   text not null,
  roles      jsonb not null default '{}'::jsonb,
  overrides  jsonb not null default '{}'::jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.time_off (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete cascade,
  type        text not null default 'Holiday',
  start_date  date not null,
  end_date    date not null,
  status      text not null default 'Pending',   -- see the policy note below
  note        text,
  created_at  timestamptz not null default now()
);

create table public.schedules (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  week_key   text not null,
  data       jsonb not null default '{}'::jsonb,
  status     text not null default 'draft',
  updated_at timestamptz not null default now(),
  unique (org_id, week_key)
);


-- ── Helper: is the current user a member of this org? ───────────────────────
-- Correctly written: security definer so a policy can consult memberships
-- without the caller being able to read it, stable so it caches per statement,
-- and an empty search_path so nobody can shadow `memberships` and lie to it.
create or replace function public.is_member(target_org uuid)
returns boolean language sql security definer stable set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where org_id = target_org and user_id = auth.uid()
  );
$$;

-- Create org + owner membership atomically.
create or replace function public.create_organization(org_name text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare new_id uuid;
begin
  insert into public.organizations (name) values (org_name) returning id into new_id;
  insert into public.memberships (org_id, user_id, role) values (new_id, auth.uid(), 'owner');
  return new_id;
end;
$$;

grant execute on function public.create_organization(text) to authenticated;


-- ── Row-level security ──────────────────────────────────────────────────────
alter table public.organizations enable row level security;
alter table public.memberships   enable row level security;
alter table public.employees     enable row level security;
alter table public.blocks        enable row level security;
alter table public.time_off      enable row level security;
alter table public.schedules     enable row level security;

create policy "members read orgs"   on public.organizations for select using (public.is_member(id));
create policy "members update orgs" on public.organizations for update using (public.is_member(id));
-- ^ SUPERSEDED 4 Aug 2026: any employee could rename the restaurant and
--   rewrite its settings JSON. Now managers only.

-- These two are correct and still in force. memberships having NO update and
-- NO delete policy is what stops an existing member promoting themselves.
create policy "see own memberships" on public.memberships for select using (user_id = auth.uid());
create policy "see org memberships" on public.memberships for select using (public.is_member(org_id));

-- ⚠️  ALL FOUR OF THESE WERE SUPERSEDED ON 4 Aug 2026.
--     `for all` is select + insert + update + delete, gated only on "are you
--     in this org". Via the REST API — with the anon key that ships in the JS
--     bundle — any employee could approve their own time off (`status` is
--     just a column), delete every schedule, rewrite anyone's roles and hours,
--     or remove colleagues from the roster. The manager-only UI was the only
--     thing stopping them, and a UI is not an access control.
--     Replaced by 20260804200000_split_for_all_policies.sql.
create policy "members manage employees" on public.employees for all
  using (public.is_member(org_id)) with check (public.is_member(org_id));
create policy "members manage blocks" on public.blocks for all
  using (public.is_member(org_id)) with check (public.is_member(org_id));
create policy "members manage time_off" on public.time_off for all
  using (public.is_member(org_id)) with check (public.is_member(org_id));
create policy "members manage schedules" on public.schedules for all
  using (public.is_member(org_id)) with check (public.is_member(org_id));


-- ── Grants ──────────────────────────────────────────────────────────────────
-- HISTORICAL. Reproduced as it was originally run, NOT as it stands.
--
-- The `alter default privileges` line below was REVOKED on 13 Aug 2026 by
-- 20260813160000_no_blanket_grants.sql, because it meant every table created in
-- future was fully writable by any logged-in user from the moment it existed —
-- before anyone remembered to enable RLS on it. Grants are now explicit and by
-- name in that migration; a new table starts with no access and fails loudly.
--
-- The first `grant ... on all tables` line did already apply, to tables that
-- all have RLS. It was not revoked: RLS is what protects those rows.
--
-- If you are recreating this database from scratch, run the migration too.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
