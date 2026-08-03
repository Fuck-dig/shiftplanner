-- ============================================================================
-- Which migrations have actually been applied to this project?
-- ============================================================================
-- Paste into the Supabase SQL editor. Every column comes back true if that
-- migration is already in place, false if it still needs running. Read-only —
-- it only inspects the catalog, changes nothing.
--
-- Safe to re-run any time you're unsure what state the live schema is in.
-- ============================================================================

select
  -- 20260728120000_org_currency.sql
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'organizations' and column_name = 'currency'
  ) as org_currency_done,

  -- 20260728130000_documents_manager_only_rls.sql
  -- The tightened policies check the membership ROLE, not just org membership,
  -- so the word 'owner' appearing in a policy expression is the tell.
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'employee_documents'
      and coalesce(qual, '') || coalesce(with_check, '') like '%owner%'
  ) as documents_manager_only_rls_done,

  -- 20260728140000_employee_wages.sql — two halves, both should be true.
  exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'employee_wages'
  ) as employee_wages_table_created,
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'employees' and column_name = 'wage'
  ) as employees_wage_column_dropped,

  -- 20260803120000_open_shifts.sql
  coalesce((
    select is_nullable = 'YES' from information_schema.columns
    where table_schema = 'public' and table_name = 'shift_swaps' and column_name = 'from_emp_id'
  ), false) as open_shifts_done,

  -- 20260803140000_schedule_audit.sql
  -- Two checks, because the table existing isn't enough: without the insert
  -- policy every audit write is silently rejected by RLS, and logScheduleEvent
  -- deliberately swallows that error so nothing surfaces it.
  exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'schedule_audit'
  ) as schedule_audit_table_created,
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'schedule_audit' and cmd = 'INSERT'
  ) as schedule_audit_insert_policy_present;
