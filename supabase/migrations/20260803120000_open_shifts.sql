-- ============================================================================
-- Rorota — open shifts (manager-posted, claimable by any eligible employee)
-- ============================================================================
-- Run this once in the Supabase SQL editor (or via `supabase db push`).
--
-- Until now every shift_swaps row represented an employee GIVING AWAY a shift
-- they already had, so from_emp_id was mandatory. An "open shift" is the same
-- idea minus the original owner: a manager posts a slot nobody is on yet, any
-- eligible employee can claim it, and the manager approves — which then ADDS
-- the assignment rather than moving it from one person to another.
--
-- Everything else about the row is unchanged (same status lifecycle:
-- open -> claimed -> approved/declined), so the whole existing claim/approve
-- pipeline, notification flow, and manager approval queue work as-is. The only
-- schema change needed is making from_emp_id nullable.
--
-- Safe on existing data: every current row already has a from_emp_id, and
-- dropping a NOT NULL constraint never rewrites or invalidates existing rows.
-- ============================================================================

alter table shift_swaps alter column from_emp_id drop not null;

comment on column shift_swaps.from_emp_id is
  'Employee giving up the shift. NULL means this is a manager-posted OPEN shift that nobody held yet — on approval the claimant is added to the schedule rather than swapped in for someone.';
