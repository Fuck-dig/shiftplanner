-- ============================================================================
-- Rorota — move wage/pay-structure fields off the employees table
-- ============================================================================
-- Run this once in the Supabase SQL editor for your project (or via
-- `supabase db push`). Run the WHOLE script in one go (one transaction) —
-- it copies data into the new table before dropping the old columns, so a
-- partial run could drop columns before the copy lands.
--
-- Why: the employees table's RLS (like most of this schema) only checks
-- org membership, not role — deliberately, per the convention documented in
-- 20260721120000_swaps_notifications_templates.sql. That's fine for name,
-- roles, availability, etc., which every coworker legitimately needs to see
-- shifts and pick up swaps. It was NOT fine for wage/contract_type/
-- contract_period: those came along for the ride on every fetch of the
-- employees table, including the ones EmployeeView.jsx (the staff app) does
-- for perfectly ordinary reasons — so every employee's pay was already
-- landing in every coworker's browser on normal use, just never rendered.
--
-- Postgres RLS filters ROWS, not columns, and every login (owner, manager,
-- or employee) shares the same "authenticated" database role — there's no
-- way to grant column-level access differently per app-role on a single
-- table. The only real fix is a separate table an employee's RLS simply
-- has zero policies for, same pattern as employee_documents.
--
-- Safe to re-run: table/index creation and the backfill insert are
-- idempotent; the column drops at the bottom are the only one-way part.
-- ============================================================================

create table if not exists employee_wages (
  employee_id     uuid primary key references employees(id) on delete cascade,
  org_id          uuid not null references organizations(id) on delete cascade,
  wage            numeric not null default 0,
  contract_type   text not null default 'hourly',
  contract_period text not null default 'week',
  updated_at      timestamptz not null default now()
);
create index if not exists employee_wages_org_idx on employee_wages (org_id);

-- Copies every existing org's real wage data across (including Almus and
-- anyone else already using this) before the old columns disappear below.
insert into employee_wages (employee_id, org_id, wage, contract_type, contract_period)
select id, org_id, coalesce(wage, 0), coalesce(contract_type, 'hourly'), coalesce(contract_period, 'week')
from employees
on conflict (employee_id) do nothing;

alter table employee_wages enable row level security;

drop policy if exists "managers can read employee_wages" on employee_wages;
create policy "managers can read employee_wages" on employee_wages
  for select using (org_id in (select org_id from memberships where user_id = auth.uid() and role in ('owner','manager')));
drop policy if exists "managers can insert employee_wages" on employee_wages;
create policy "managers can insert employee_wages" on employee_wages
  for insert with check (org_id in (select org_id from memberships where user_id = auth.uid() and role in ('owner','manager')));
drop policy if exists "managers can update employee_wages" on employee_wages;
create policy "managers can update employee_wages" on employee_wages
  for update using (org_id in (select org_id from memberships where user_id = auth.uid() and role in ('owner','manager')));
drop policy if exists "managers can delete employee_wages" on employee_wages;
create policy "managers can delete employee_wages" on employee_wages
  for delete using (org_id in (select org_id from memberships where user_id = auth.uid() and role in ('owner','manager')));
-- Deliberately no policy at all for a plain "employee" membership — same
-- effect as employee_documents: RLS enabled, zero matching policies, so a
-- non-manager's query returns no rows rather than an error.

alter table employees drop column if exists wage;
alter table employees drop column if exists contract_type;
alter table employees drop column if exists contract_period;
