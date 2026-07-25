-- ============================================================================
-- Rorota — per-employee documents (contracts, IDs, certifications, etc.)
-- ============================================================================
-- Run this once in the Supabase SQL editor for your project (or via
-- `supabase db push`).
--
-- Manager-only feature: uploaded and viewed exclusively from the Employees
-- admin page, which the app already only renders for managers/owners (see
-- App.jsx's isManager gate — employees never even reach this screen).
-- Matches the security model used everywhere else in this schema (see
-- 20260721120000_swaps_notifications_templates.sql and
-- 20260723170000_direct_messaging.sql): RLS only checks org membership, not
-- role — the app UI is what keeps this manager-only, same as those.
--
-- Storage: a private bucket (`employee-documents`), object path convention
-- `{org_id}/{employee_id}/{timestamp}-{filename}` — the org_id folder prefix
-- is exactly what the storage policies below check membership against.
--
-- Safe to re-run: table/column/index creation is idempotent, policies are
-- dropped-then-recreated, and the bucket insert no-ops on conflict.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('employee-documents', 'employee-documents', false)
on conflict (id) do nothing;

create table if not exists employee_documents (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  employee_id   uuid not null references employees(id) on delete cascade,
  file_name     text not null,
  storage_path  text not null,
  content_type  text,
  size_bytes    bigint,
  uploaded_by   text,   -- display name/email of whoever uploaded it, captured at upload time (same convention as messages.sender_label)
  created_at    timestamptz not null default now()
);
create index if not exists employee_documents_employee_idx on employee_documents (employee_id, created_at desc);

alter table employee_documents enable row level security;

drop policy if exists "org members can read employee_documents" on employee_documents;
create policy "org members can read employee_documents" on employee_documents
  for select using (org_id in (select org_id from memberships where user_id = auth.uid()));
drop policy if exists "org members can insert employee_documents" on employee_documents;
create policy "org members can insert employee_documents" on employee_documents
  for insert with check (org_id in (select org_id from memberships where user_id = auth.uid()));
drop policy if exists "org members can delete employee_documents" on employee_documents;
create policy "org members can delete employee_documents" on employee_documents
  for delete using (org_id in (select org_id from memberships where user_id = auth.uid()));

-- Storage RLS: the object's path is {org_id}/{employee_id}/{filename}, so
-- (storage.foldername(name))[1] is the org_id — checked the same way the
-- table policies above check org_id, just via the path instead of a column.
drop policy if exists "org members can read employee documents in storage" on storage.objects;
create policy "org members can read employee documents in storage" on storage.objects
  for select using (
    bucket_id = 'employee-documents'
    and (storage.foldername(name))[1] in (select org_id::text from memberships where user_id = auth.uid())
  );
drop policy if exists "org members can upload employee documents to storage" on storage.objects;
create policy "org members can upload employee documents to storage" on storage.objects
  for insert with check (
    bucket_id = 'employee-documents'
    and (storage.foldername(name))[1] in (select org_id::text from memberships where user_id = auth.uid())
  );
drop policy if exists "org members can delete employee documents from storage" on storage.objects;
create policy "org members can delete employee documents from storage" on storage.objects
  for delete using (
    bucket_id = 'employee-documents'
    and (storage.foldername(name))[1] in (select org_id::text from memberships where user_id = auth.uid())
  );
