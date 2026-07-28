-- ============================================================================
-- Rorota — actually make employee_documents manager-only at the RLS level
-- ============================================================================
-- Run this once in the Supabase SQL editor for your project (or via
-- `supabase db push`).
--
-- 20260725120000_employee_documents.sql shipped this as "manager-only"
-- purely at the UI level — the underlying RLS only checked org membership,
-- same as everywhere else in this schema. That's fine for most tables here
-- (see that migration's own comment on the established convention), but
-- employee_documents holds things like ID scans and contracts, and unlike
-- most of this schema an employee has no legitimate reason to ever see a
-- COWORKER's document even if they can see their own. So this tightens it:
-- an "owner" or "manager" membership keeps full access, a plain "employee"
-- membership gets none at all — read, write, or delete.
--
-- This only affects employee_documents (the table) and the
-- employee-documents storage bucket. It intentionally does NOT touch wages
-- (on the employees table) — Postgres RLS filters rows, not columns, and
-- every login shares the same "authenticated" database role regardless of
-- app-level role, so column-level access control isn't possible without
-- splitting wage into its own table. That's a separate, larger change.
--
-- Safe to re-run: policies are dropped-then-recreated.
-- ============================================================================

drop policy if exists "org members can read employee_documents" on employee_documents;
create policy "managers can read employee_documents" on employee_documents
  for select using (org_id in (select org_id from memberships where user_id = auth.uid() and role in ('owner','manager')));

drop policy if exists "org members can insert employee_documents" on employee_documents;
create policy "managers can insert employee_documents" on employee_documents
  for insert with check (org_id in (select org_id from memberships where user_id = auth.uid() and role in ('owner','manager')));

drop policy if exists "org members can delete employee_documents" on employee_documents;
create policy "managers can delete employee_documents" on employee_documents
  for delete using (org_id in (select org_id from memberships where user_id = auth.uid() and role in ('owner','manager')));

drop policy if exists "org members can read employee documents in storage" on storage.objects;
create policy "managers can read employee documents in storage" on storage.objects
  for select using (
    bucket_id = 'employee-documents'
    and (storage.foldername(name))[1] in (select org_id::text from memberships where user_id = auth.uid() and role in ('owner','manager'))
  );

drop policy if exists "org members can upload employee documents to storage" on storage.objects;
create policy "managers can upload employee documents to storage" on storage.objects
  for insert with check (
    bucket_id = 'employee-documents'
    and (storage.foldername(name))[1] in (select org_id::text from memberships where user_id = auth.uid() and role in ('owner','manager'))
  );

drop policy if exists "org members can delete employee documents from storage" on storage.objects;
create policy "managers can delete employee documents from storage" on storage.objects
  for delete using (
    bucket_id = 'employee-documents'
    and (storage.foldername(name))[1] in (select org_id::text from memberships where user_id = auth.uid() and role in ('owner','manager'))
  );
