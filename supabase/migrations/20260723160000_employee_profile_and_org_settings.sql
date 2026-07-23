-- ============================================================================
-- Rorota — employee profile fields & org-wide role colours
-- ============================================================================
-- Run this once in the Supabase SQL editor for your project (or via
-- `supabase db push`).
--
-- Consolidates three small, related additions that used to be three
-- separate migration files:
--   1. organizations.role_styles — the shared colour a manager picks per
--      role in Coverage, shown identically to every employee (unlike role
--      ORDER, which stays a personal per-browser preference and never got
--      its own column).
--   2. employees.phone — set from the employee's own Profile page.
--   3. employees.email_notifications — per-person opt-out for the email
--      companions sent alongside in-app notifications (defaults to true,
--      i.e. opted in).
--
-- Every statement here is safe to run even if some or all of it already
-- exists in your database (idempotent column adds, drop-then-create for
-- the one policy) — so it's fine to run this once now, whether or not
-- you'd previously run the three files it replaces.
-- ============================================================================

alter table organizations add column if not exists role_styles jsonb not null default '{}'::jsonb;
alter table employees add column if not exists phone text;
alter table employees add column if not exists email_notifications boolean not null default true;

drop policy if exists "org members can update organizations" on organizations;
create policy "org members can update organizations" on organizations
  for update using (id in (select org_id from memberships where user_id = auth.uid()));
