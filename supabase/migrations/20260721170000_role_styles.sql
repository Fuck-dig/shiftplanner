-- ============================================================================
-- Rorota — sync real role colours to employee sessions
-- ============================================================================
-- Run this once in the Supabase SQL editor for your project (or via
-- `supabase db push`).
--
-- Unlike role ORDER (which stays personal/local per-browser — see
-- 20260721160000_role_order.sql, now shelved), the actual colours a manager
-- picks for each role in Coverage ARE meant to look the same for everyone —
-- they're an identity marker for the role itself, not a personal viewing
-- preference. Employees were previously shown an approximated stand-in
-- colour (derived from a hash of the role name) since there was no shared
-- source of truth; this column is that source of truth.
--
-- Self-contained: includes the organizations UPDATE policy again in case
-- 20260721160000 was never actually run against your database (it was
-- shelved before most people would have applied it) — `drop policy if
-- exists` + `create policy` makes this safe to run whether or not that
-- policy already exists.
-- ============================================================================

alter table organizations add column if not exists role_styles jsonb not null default '{}'::jsonb;

drop policy if exists "org members can update organizations" on organizations;
create policy "org members can update organizations" on organizations
  for update using (id in (select org_id from memberships where user_id = auth.uid()));
