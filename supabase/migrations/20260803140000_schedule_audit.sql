-- ============================================================================
-- Rorota — schedule audit trail
-- ============================================================================
-- Run once in the Supabase SQL editor (or `supabase db push`).
--
-- People get paid based on this schedule, and until now "who moved my shift,
-- and when?" had no answer anywhere in the system. This is an append-only log
-- of schedule changes.
--
-- Design notes:
--
-- * actor_name is DENORMALISED on purpose. The alternative is joining back to
--   auth.users/employees at read time, which (a) the client can't do for
--   auth.users, and (b) would show the person's CURRENT name, or nothing at
--   all once they're deleted. An audit trail should say who did it at the
--   time, and must survive that person being removed — hence a plain text
--   copy and ON DELETE SET NULL on the user reference rather than CASCADE.
--
-- * detail is jsonb rather than columns, because the useful payload differs per
--   action (an assignment has employee/day/block/role; a confirm has none).
--
-- * There is deliberately NO update or delete policy. An audit trail that can
--   be edited or erased by the people it audits isn't one. Nobody can rewrite
--   history through the app; clearing it requires database access.
-- ============================================================================

create table if not exists schedule_audit (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  week_key      text,
  action        text not null,   -- assigned | removed | moved | swapped | confirmed | unconfirmed | generated | week_deleted
  detail        jsonb not null default '{}'::jsonb,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_name    text,            -- captured at write time; see note above
  created_at    timestamptz not null default now()
);

create index if not exists schedule_audit_org_idx  on schedule_audit (org_id, created_at desc);
create index if not exists schedule_audit_week_idx on schedule_audit (org_id, week_key, created_at desc);

alter table schedule_audit enable row level security;

-- The drop-if-exists lines make this whole script safely re-runnable. Postgres
-- has no `create policy if not exists`, so without them a second run dies on
-- 42710 ("policy already exists") — which is exactly what happened the first
-- time this was re-run. Dropping and recreating is also how you'd legitimately
-- amend a policy later.

-- Read: managers/owners only. The log can reveal wage-adjacent scheduling
-- decisions and who made them, which isn't a plain employee's business.
drop policy if exists "managers can read schedule_audit" on schedule_audit;
create policy "managers can read schedule_audit" on schedule_audit
  for select using (
    org_id in (
      select org_id from memberships
      where user_id = auth.uid() and role in ('owner','manager')
    )
  );

-- Insert: any org member, but only as THEMSELVES. Without the actor_user_id
-- check, a member could write entries attributed to someone else — which would
-- make the log actively misleading rather than merely incomplete.
drop policy if exists "org members can append to schedule_audit" on schedule_audit;
create policy "org members can append to schedule_audit" on schedule_audit
  for insert with check (
    org_id in (select org_id from memberships where user_id = auth.uid())
    and actor_user_id = auth.uid()
  );

-- No update/delete policies: append-only by design.
