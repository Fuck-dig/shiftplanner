-- ============================================================================
-- Rorota — archive employees instead of deleting them
-- ============================================================================
-- Run once in the Supabase SQL editor (or `supabase db push`).
--
-- Deleting an employee also removes their shift history (a consequence of
-- fixing orphaned assignments — a roster row and its assignments now go
-- together). That's right for a mis-typed row and wrong for someone who simply
-- left: their past hours are what payroll and any later dispute rests on.
--
-- Archiving keeps the person and everything they ever worked, while taking
-- them out of scheduling. Deliberately a plain boolean rather than a separate
-- table or a soft-delete timestamp:
--
--   * The app keeps archived people IN the employee list it loads, because
--     historical assignments reference them by id — every name lookup, cost
--     calculation for a past week, and the orphaned-assignment cleanup all
--     need them present. Hiding them at the query level would silently delete
--     their history the next time that cleanup ran.
--   * So the ONLY thing this column does is mark who should be excluded from
--     forward-looking scheduling (the staff picker, auto-generate, open-shift
--     eligibility) and shown separately in the Employees screen.
--
-- Defaults to false, so every existing employee stays exactly as they are.
-- ============================================================================

alter table employees add column if not exists archived boolean not null default false;

-- Partial index: the common query is "the people I can actually schedule",
-- and archived rows are the minority that never need scanning for it.
create index if not exists employees_org_active_idx
  on employees (org_id) where archived = false;

comment on column employees.archived is
  'True = left the team. Excluded from scheduling (picker, auto-generate, open shifts) but kept in the roster so historical assignments, hours and costs still resolve. Delete removes history; archive preserves it.';
