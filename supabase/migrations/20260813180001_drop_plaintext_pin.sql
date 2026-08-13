-- ============================================================================
-- Rorota — remove the plaintext PIN column
-- ============================================================================
-- ⚠️  RUN THIS **ONLY AFTER** the app change is live in production.
--
-- 20260813180000 deliberately left `employees.pin` in place, because the
-- deployed app still SENT that column on every employee save. Dropping it first
-- would have made saving an employee fail — the app would have looked broken
-- for a reason nobody could see, which is the failure mode this whole session
-- has been chasing.
--
-- ORDER
--   1. 20260813180000  — hashes the PINs, keeps the column       (app: old, fine)
--   2. deploy the app  — stops reading or writing `pin`
--   3. THIS FILE       — drops the column                        (app: new, fine)
--
-- Between 1 and 3 the plaintext PINs are still sitting in the table, readable
-- by any org member. That window should be minutes, not days. If you are not
-- deploying today, it is better to wait and run 20260813180000 immediately
-- before the deploy than to leave the gap open.
--
-- CHECK BEFORE RUNNING
-- The verification at the bottom of 20260813180000 should show hashed_pins_now
-- equal to plaintext_pins_before. If it does not, STOP: dropping this column
-- destroys the only copy of a PIN that was never hashed.
-- ============================================================================

do $$
declare plaintext int; hashed int;
begin
  select count(*) into plaintext from public.employees where pin is not null and length(trim(pin)) > 0;
  select count(*) into hashed    from public.employee_pins;
  if plaintext > hashed then
    raise exception
      'Refusing to drop: % plaintext PINs but only % hashed. Run 20260813180000 first.',
      plaintext, hashed;
  end if;
end $$;

alter table public.employees drop column if exists pin;


-- ── Verify ──────────────────────────────────────────────────────────────────
-- Expect zero rows: the column is gone.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'employees' and column_name = 'pin';
