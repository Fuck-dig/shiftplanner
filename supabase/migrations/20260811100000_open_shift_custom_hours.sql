-- ============================================================================
-- Rorota — open shifts can carry their own hours
-- ============================================================================
-- Run the whole file in the Supabase SQL editor. Safe to re-run.
--
-- WHY
--
-- An open shift is a row in `shift_swaps` describing (week, day, block, role),
-- and nothing else. It has always inherited the block's hours, so posting
-- "Dinner, Waiter" could only ever mean the whole 16:30–00:00 block. Adding a
-- shift to a NAMED person has allowed custom times for a while — the shift
-- dialog has a "Custom" row with its own start and end — so the two paths
-- disagreed about what a shift even is. This closes that gap.
--
-- NULL means "use the block's hours", which is what every existing row means
-- and what most open shifts will keep meaning. That is deliberate: filling the
-- columns in with the block's current times would freeze today's block hours
-- into old rows, so that editing a block later would silently stop affecting
-- open shifts posted before this migration.
--
-- The columns are TEXT holding 'HH:MM', matching how times are stored on
-- assignments in the schedule JSON (`start`/`end` on an assignment) and how
-- `blocks.start` / `blocks.end` are stored. Deliberately not `time`: the app
-- compares these as strings throughout, and a type that round-trips as
-- '16:30:00' would need conversion at every call site.
--
-- Overnight shifts need no special handling here for the same reason they need
-- none on blocks: end <= start is read as "past midnight" by toMin()/blockHours
-- rather than as invalid.
-- ============================================================================


alter table public.shift_swaps
  add column if not exists start_time text,
  add column if not exists end_time   text;

-- Both or neither. A row with only one half set would be ambiguous — the app
-- would have to invent the other end from the block, which is exactly the
-- silent guess this feature exists to remove.
alter table public.shift_swaps
  drop constraint if exists shift_swaps_custom_hours_both_or_neither;
alter table public.shift_swaps
  add constraint shift_swaps_custom_hours_both_or_neither
  check ((start_time is null) = (end_time is null));

-- Shape check only. Kept loose on purpose: this is a guard against a stray
-- value reaching the column, not a validator — the client already builds these
-- from its own time picker.
alter table public.shift_swaps
  drop constraint if exists shift_swaps_custom_hours_format;
alter table public.shift_swaps
  add constraint shift_swaps_custom_hours_format
  check (
    (start_time is null or start_time ~ '^[0-2][0-9]:[0-5][0-9]$') and
    (end_time   is null or end_time   ~ '^[0-2][0-9]:[0-5][0-9]$')
  );


-- ── Verify (read-only; run after the above) ─────────────────────────────────

-- Expect two rows, both nullable text with no default.
select column_name, data_type, is_nullable, coalesce(column_default,'(none)') as default_value
from information_schema.columns
where table_schema='public' and table_name='shift_swaps'
  and column_name in ('start_time','end_time')
order by column_name;

-- Expect both constraints.
select con.conname as constraint_name, pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace n on n.oid = rel.relnamespace
where n.nspname='public' and rel.relname='shift_swaps' and con.conname like '%custom_hours%'
order by con.conname;

-- Every existing row should still mean "use the block's hours": expect
-- custom_hours = 0 and the total unchanged from before you ran this.
select count(*) as total_swaps,
       count(*) filter (where start_time is not null) as custom_hours
from public.shift_swaps;
