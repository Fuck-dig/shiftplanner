-- ============================================================================
-- Rorota — direct messages (manager to individual / role / everyone)
-- ============================================================================
-- Run this once in the Supabase SQL editor for your project (or via
-- `supabase db push`).
--
-- Security model matches the rest of the schema (see the notes in
-- 20260721120000_swaps_notifications_templates.sql): every policy below only
-- checks org membership, not sender/recipient identity — the app UI is what
-- restricts composing to managers, not the database.
-- ============================================================================

-- One row per recipient (same fan-out-at-insert pattern as `notifications`):
-- sending to "all Bartenders" or "everyone" inserts one row per employee,
-- not one shared broadcast row, since read state is independent per person.
create table if not exists messages (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  recipient_emp_id uuid not null references employees(id) on delete cascade,
  sender_label     text not null,               -- sender's display name, captured at send time (a manager may have no employees row of their own to look up later)
  subject          text,
  body             text not null,
  allow_replies    boolean not null default false,
  read             boolean not null default false,   -- has the recipient opened this thread
  manager_unread   boolean not null default false,   -- true once the recipient has replied and the manager hasn't seen it yet
  created_at       timestamptz not null default now()
);
create index if not exists messages_recipient_idx on messages (recipient_emp_id, read, created_at desc);
create index if not exists messages_org_manager_unread_idx on messages (org_id, manager_unread);

alter table messages enable row level security;

create policy "org members can read messages" on messages
  for select using (org_id in (select org_id from memberships where user_id = auth.uid()));
create policy "org members can insert messages" on messages
  for insert with check (org_id in (select org_id from memberships where user_id = auth.uid()));
create policy "org members can update messages" on messages
  for update using (org_id in (select org_id from memberships where user_id = auth.uid()));
create policy "org members can delete messages" on messages
  for delete using (org_id in (select org_id from memberships where user_id = auth.uid()));

-- Replies within a single recipient's thread (each `messages` row already
-- scopes a thread to exactly one recipient, so replies don't need their own
-- recipient/audience logic — they just belong to a message_id).
create table if not exists message_replies (
  id            uuid primary key default gen_random_uuid(),
  message_id    uuid not null references messages(id) on delete cascade,
  from_employee boolean not null,       -- true = the recipient wrote this reply, false = a manager did
  author_label  text not null,
  body          text not null,
  created_at    timestamptz not null default now()
);
create index if not exists message_replies_message_idx on message_replies (message_id, created_at);

alter table message_replies enable row level security;

create policy "org members can read message_replies" on message_replies
  for select using (message_id in (select id from messages where org_id in (select org_id from memberships where user_id = auth.uid())));
create policy "org members can insert message_replies" on message_replies
  for insert with check (message_id in (select id from messages where org_id in (select org_id from memberships where user_id = auth.uid())));
create policy "org members can delete message_replies" on message_replies
  for delete using (message_id in (select id from messages where org_id in (select org_id from memberships where user_id = auth.uid())));
