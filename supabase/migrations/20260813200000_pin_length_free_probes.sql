-- ============================================================================
-- Rorota — a wrong-LENGTH PIN attempt should cost nothing
-- ============================================================================
-- Run in the Supabase SQL editor. Safe to re-run. Only makes the lockout more
-- forgiving, never less, so it is safe ahead of the app deploy.
--
-- THE PROBLEM, WHICH IS THE THIRD VERSION OF THE SAME ONE
--
-- The browser cannot know how long a PIN is — that is the point of hashing it.
-- So the kiosk has to guess when an entry is finished:
--
--   v1  check on every keystroke from 4 digits.
--       Wrong: a wrong 6-digit PIN produced THREE failures, so five attempts
--       were gone in under two entries and the lockout could trip mid-typing.
--   v2  check 450ms after typing stops.
--       Better, but anyone who pauses between the 4th and 5th digit gets
--       checked early and still burns an attempt. William hit this.
--
-- Both are the client trying to infer something only the server knows.
--
-- THE FIX
--
-- The SERVER remembers how long the PIN is and refuses to count an attempt of
-- the wrong length. The client can then check on every keystroke — free until
-- the length matches — and sign-in happens exactly on the final digit with no
-- delay and no wasted attempts. The length is never sent to the browser, so
-- nothing is leaked by storing it.
--
-- EXISTING PINS
--
-- Their length is genuinely unrecoverable — they were hashed and the plaintext
-- dropped. Rather than making you reset them, the function LEARNS the length
-- from the first successful sign-in (the attempt that matched is, by
-- definition, the right length). Until that happens the old counting applies,
-- so one early entry may cost a couple of attempts; after it, exact.
-- ============================================================================

alter table public.employee_pins add column if not exists pin_length int;

-- Record the length whenever a PIN is set from now on.
create or replace function public.set_kiosk_pin(emp uuid, new_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare target_org uuid;
begin
  select org_id into target_org from public.employees where id = emp;
  if target_org is null then
    raise exception 'No such employee';
  end if;
  if not public.is_manager(target_org) then
    raise exception 'Only a manager can set a kiosk PIN' using errcode = 'check_violation';
  end if;
  if new_pin !~ '^[0-9]{4,8}$' then
    raise exception 'A kiosk PIN must be 4 to 8 digits' using errcode = 'check_violation';
  end if;

  insert into public.employee_pins
    (employee_id, org_id, pin_hash, pin_length, failed_attempts, locked_until, last_failed_at, updated_at)
  values
    (emp, target_org, extensions.crypt(new_pin, extensions.gen_salt('bf')), length(new_pin), 0, null, null, now())
  on conflict (employee_id) do update
    set pin_hash = excluded.pin_hash, pin_length = excluded.pin_length,
        failed_attempts = 0, locked_until = null, last_failed_at = null, updated_at = now();

  update public.employees set has_pin = true where id = emp;
end;
$$;

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

  -- A FREE PROBE. The browser is checking after each digit because it cannot
  -- know the length; an attempt that is not even the right length is not a
  -- guess at the PIN, so it must not spend an attempt. Costs an attacker
  -- nothing either — they learn only that some length is wrong, which the
  -- lockout on correct-length guesses still protects.
  if rec.pin_length is not null and length(attempt) <> rec.pin_length then
    return query select false, 0;
    return;
  end if;

  recent := case
    when rec.last_failed_at is null then 0
    when rec.last_failed_at < now() - interval '5 minutes' then 0
    else rec.failed_attempts
  end;

  matched := (extensions.crypt(attempt, rec.pin_hash) = rec.pin_hash);

  if matched then
    update public.employee_pins
      -- Learn the length from the first successful sign-in for PINs migrated
      -- before this column existed. The attempt that matched IS the length.
      set failed_attempts = 0, locked_until = null, last_failed_at = null,
          pin_length = coalesce(rec.pin_length, length(attempt))
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

revoke execute on function public.set_kiosk_pin(uuid, text)   from public;
revoke execute on function public.verify_kiosk_pin(uuid,text) from public;
grant  execute on function public.set_kiosk_pin(uuid, text)   to authenticated;
grant  execute on function public.verify_kiosk_pin(uuid,text) to authenticated;

update public.employee_pins
set failed_attempts = 0, locked_until = null, last_failed_at = null
where failed_attempts > 0 or locked_until is not null;


-- ── Verify ──────────────────────────────────────────────────────────────────
-- pin_length is null for PINs migrated earlier; it fills in on first sign-in.
select employee_id, pin_length, failed_attempts, locked_until from public.employee_pins;
