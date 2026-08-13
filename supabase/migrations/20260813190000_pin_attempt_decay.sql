-- ============================================================================
-- Rorota — stop failed PIN attempts accumulating forever
-- ============================================================================
-- Run in the Supabase SQL editor. Safe to re-run. Safe on production: it only
-- makes the lockout MORE forgiving, never less.
--
-- TWO PROBLEMS, ONE OF THEM MINE
--
-- 1. The kiosk checked the PIN on every keystroke from the fourth digit, so a
--    wrong six-digit entry produced THREE failures. Five attempts were gone in
--    under two entries and the lockout could trip mid-typing. Fixed in the app
--    (one check per entry, after typing pauses) — this migration does not need
--    to care, but it is why the counter was hit so fast.
--
-- 2. `failed_attempts` only ever reset on SUCCESS. So four typos spread across
--    a whole shift left somebody one mistake away from a lockout with no way
--    to know, and the fifth — hours later — locked them out. A counter that
--    never decays is not really a rate limit; it is a lifetime quota.
--
-- Now a failure older than five minutes no longer counts. Five wrong entries
-- in five minutes is someone guessing. Five across a Friday service is someone
-- with cold hands.
-- ============================================================================

alter table public.employee_pins add column if not exists last_failed_at timestamptz;

create or replace function public.verify_kiosk_pin(emp uuid, attempt text)
returns table (ok boolean, locked_seconds int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec public.employee_pins%rowtype;
  matched boolean;
  recent int;
begin
  select * into rec from public.employee_pins where employee_id = emp;
  if not found then
    return query select false, 0;
    return;
  end if;
  if not public.is_member(rec.org_id) then
    raise exception 'Not your restaurant' using errcode = 'check_violation';
  end if;

  if rec.locked_until is not null and rec.locked_until > now() then
    return query select false, ceil(extract(epoch from (rec.locked_until - now())))::int;
    return;
  end if;

  -- Only failures from the last five minutes count towards the lockout.
  recent := case
    when rec.last_failed_at is null then 0
    when rec.last_failed_at < now() - interval '5 minutes' then 0
    else rec.failed_attempts
  end;

  matched := (extensions.crypt(attempt, rec.pin_hash) = rec.pin_hash);

  if matched then
    update public.employee_pins
      set failed_attempts = 0, locked_until = null, last_failed_at = null
      where employee_id = emp;
    return query select true, 0;
  else
    update public.employee_pins
      set failed_attempts = recent + 1,
          last_failed_at = now(),
          locked_until = case when recent + 1 >= 5 then now() + interval '60 seconds' else null end
      where employee_id = emp;
    return query select false, case when recent + 1 >= 5 then 60 else 0 end;
  end if;
end;
$$;

revoke execute on function public.verify_kiosk_pin(uuid,text) from public;
grant  execute on function public.verify_kiosk_pin(uuid,text) to authenticated;


-- ── Clear anything currently locked by the old behaviour ────────────────────
-- Nobody should stay locked out because of a bug in the counting.
update public.employee_pins
set failed_attempts = 0, locked_until = null, last_failed_at = null
where failed_attempts > 0 or locked_until is not null;


-- ── Verify ──────────────────────────────────────────────────────────────────
-- Expect every row to read 0 / null / null.
select employee_id, failed_attempts, locked_until, last_failed_at from public.employee_pins;
