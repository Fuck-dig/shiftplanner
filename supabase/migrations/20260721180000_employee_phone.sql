-- ============================================================================
-- Rorota — employee phone number
-- ============================================================================
-- Run this once in the Supabase SQL editor for your project (or via
-- `supabase db push`).
--
-- Adds a phone number alongside the existing employees.email column (added
-- in 20260721120000). Employees can set their own phone from Profile
-- Settings (see updateEmployeeSelfProfile in lib/data.js) — unlike email,
-- which doubles as the login-matching key and stays manager-controlled,
-- phone carries no such risk so it's safe to let people edit their own.
-- No RLS changes needed: employees already has org-member read/write
-- policies covering every column.
-- ============================================================================

alter table employees add column if not exists phone text;
