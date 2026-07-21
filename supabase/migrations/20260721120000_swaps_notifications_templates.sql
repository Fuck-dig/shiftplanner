-- ============================================================================
-- Rorota — shift swaps, in-app notifications, schedule templates
-- ============================================================================
-- Run this once in the Supabase SQL editor for your project (or via
-- `supabase db push` if you use the CLI — supabase/.temp/linked-project.json
-- shows this repo is already linked).
--
-- Security model: every policy below only checks org membership
-- (org_id in your memberships), the same all-or-nothing trust model
-- already used by employees/blocks/time_off/schedules in this project —
-- any signed-in member of the org (owner, manager, or plain employee)
-- can read and write these rows. There is no DB-level check that, say,
-- only a manager can set status='approved' on a swap; that's enforced
-- in the app UI only, matching how the rest of the schema already works.
-- If you want tighter server-side enforcement later, that's a good next
-- step but a bigger change than this migration.
-- ============================================================================

-- 1. Employees: add email ------------------------------------------------
-- EmployeeView.jsx already tries to match the logged-in user to their
-- roster row via e.email, but no such column existed — this was a
-- pre-existing bug (myId never resolved). Needed so an employee's own
-- session can be tied to their employees.id row (required for shift swaps).
alter table employees add column if not exists email text;
create index if not exists employees_org_email_idx on employees (org_id, lower(email));

-- 2. Shift swaps -----------------------------------------------------------
-- One row = one employee offering up a specific shift, either to a named
-- coworker (to_emp_id set) or to anyone eligible (to_emp_id null).
create table if not exists shift_swaps (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id) on delete cascade,
  week_key          text not null,
  day               text not null,
  block_id          uuid not null references blocks(id) on delete cascade,
  role              text not null,
  from_emp_id       uuid not null references employees(id) on delete cascade,
  to_emp_id         uuid references employees(id) on delete cascade,      -- null = open to anyone eligible for the role
  claimed_by_emp_id uuid references employees(id) on delete set null,     -- who accepted (may equal to_emp_id)
  status            text not null default 'open',                        -- open | claimed | approved | declined | cancelled
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists shift_swaps_org_idx  on shift_swaps (org_id);
create index if not exists shift_swaps_week_idx on shift_swaps (org_id, week_key);

alter table shift_swaps enable row level security;

create policy "org members can read shift_swaps" on shift_swaps
  for select using (org_id in (select org_id from memberships where user_id = auth.uid()));
create policy "org members can insert shift_swaps" on shift_swaps
  for insert with check (org_id in (select org_id from memberships where user_id = auth.uid()));
create policy "org members can update shift_swaps" on shift_swaps
  for update using (org_id in (select org_id from memberships where user_id = auth.uid()));
create policy "org members can delete shift_swaps" on shift_swaps
  for delete using (org_id in (select org_id from memberships where user_id = auth.uid()));

-- 3. Notifications ----------------------------------------------------------
-- Always addressed to one specific employee (fan-out at insert time, e.g.
-- one row per affected employee when a schedule is published) — avoids
-- needing a separate per-reader "read" table for broadcast messages.
create table if not exists notifications (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  emp_id       uuid not null references employees(id) on delete cascade,
  type         text not null,               -- schedule_published | shift_changed | swap_request | swap_claimed | swap_approved | swap_declined | ...
  message_key  text not null,               -- i18n key, rendered client-side in the viewer's own language
  message_vars jsonb not null default '{}'::jsonb,
  link         jsonb,                       -- optional {view, weekOffset, ...} to jump to on click
  read         boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists notifications_emp_idx on notifications (emp_id, read, created_at desc);

alter table notifications enable row level security;

create policy "org members can read notifications" on notifications
  for select using (org_id in (select org_id from memberships where user_id = auth.uid()));
create policy "org members can insert notifications" on notifications
  for insert with check (org_id in (select org_id from memberships where user_id = auth.uid()));
create policy "org members can update notifications" on notifications
  for update using (org_id in (select org_id from memberships where user_id = auth.uid()));
create policy "org members can delete notifications" on notifications
  for delete using (org_id in (select org_id from memberships where user_id = auth.uid()));

-- 4. Schedule templates -------------------------------------------------------
-- Named snapshots of the `blocks` structure (shift/role pattern, no specific
-- people) that a manager can save and re-apply to overwrite the current
-- `blocks`, which generate() then uses for whichever week.
create table if not exists schedule_templates (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  name       text not null,
  blocks     jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists schedule_templates_org_idx on schedule_templates (org_id);

alter table schedule_templates enable row level security;

create policy "org members can read schedule_templates" on schedule_templates
  for select using (org_id in (select org_id from memberships where user_id = auth.uid()));
create policy "org members can insert schedule_templates" on schedule_templates
  for insert with check (org_id in (select org_id from memberships where user_id = auth.uid()));
create policy "org members can update schedule_templates" on schedule_templates
  for update using (org_id in (select org_id from memberships where user_id = auth.uid()));
create policy "org members can delete schedule_templates" on schedule_templates
  for delete using (org_id in (select org_id from memberships where user_id = auth.uid()));
