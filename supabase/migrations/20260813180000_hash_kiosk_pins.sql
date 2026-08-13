-- ============================================================================
-- Rorota — kiosk PINs become hashes nobody can read, including you
-- ============================================================================
-- Run the whole file in the Supabase SQL editor. Safe to re-run.
--
-- ⚠️  RUN THIS **BEFORE** DEPLOYING THE APP CHANGE. It is deliberately
--     backwards-compatible: `employees.pin` is left in place so the currently
--     deployed app keeps working. The column is dropped by a SEPARATE
--     migration (20260813180001) which must run only AFTER the new app is live.
--     Dropping it now would break saving an employee in the running app, because
--     syncEmployees still sends the column.
--
-- WHAT WAS WRONG
--
-- `employees.pin` was plain text in a table every org member can read. The PIN
-- is not a data credential — the kiosk is only reachable after a manager has
-- signed in, so it says WHICH employee is punching on a shared tablet. But any
-- waiter with their own login could read a colleague's PIN through the API and
-- clock in as them, and wages are computed from clocked hours. That is money.
--
-- Two further problems that only hashing fixes: a database leak exposed every
-- PIN in the clear, and people reuse a 4-digit PIN from a phone or bank card,
-- so the blast radius reached well outside Rorota.
--
-- THE SHAPE
--
-- Hashes live in their own table with RLS on and NO policies — the same
-- deny-everyone pattern `shift_reminders_sent` uses — and no grants at all.
-- Nothing reaches them except the SECURITY DEFINER functions below. That is
-- simpler and less brittle than column-level grants on `employees`, which would
-- mean listing every other column by name and re-listing it whenever one is
-- added.
--
-- `employees.has_pin` carries the only fact the UI actually needs (is one set),
-- and is maintained by the functions rather than by the client.
--
-- ONLINE GUESSING
--
-- Hashing alone would not be enough: a 4-digit PIN is 10,000 guesses, and the
-- kiosk would happily answer all of them. verify_kiosk_pin therefore locks an
-- employee out for a minute after 5 wrong attempts. Without that, bcrypt just
-- makes the guessing slightly slower.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;


-- ── 1. Where the hashes live ────────────────────────────────────────────────
create table if not exists public.employee_pins (
  employee_id     uuid primary key references public.employees(id) on delete cascade,
  org_id          uuid not null references public.organizations(id) on delete cascade,
  pin_hash        text not null,
  failed_attempts int not null default 0,
  locked_until    timestamptz,
  updated_at      timestamptz not null default now()
);

alter table public.employee_pins enable row level security;

-- Deliberately NO policies and NO grants: RLS with zero policies denies every
-- ordinary user, and the functions below are SECURITY DEFINER so they are not
-- subject to it. `tables_missing_rls()` excludes tables of exactly this shape;
-- add this one to its allowlist when you next touch 20260813160000.
revoke all on public.employee_pins from authenticated, anon;


-- ── 2. The one fact the UI needs ────────────────────────────────────────────
alter table public.employees add column if not exists has_pin boolean not null default false;


-- ── 3. Move the existing PINs across, hashed ────────────────────────────────
-- One-way. After this you cannot recover a forgotten PIN, only set a new one —
-- which is the point, and worth telling staff before you run it.
insert into public.employee_pins (employee_id, org_id, pin_hash)
select e.id, e.org_id, extensions.crypt(e.pin, extensions.gen_salt('bf'))
from public.employees e
where e.pin is not null and length(trim(e.pin)) > 0
on conflict (employee_id) do nothing;

update public.employees e
set has_pin = exists (select 1 from public.employee_pins p where p.employee_id = e.id);


-- ── 4. Setting a PIN — managers only ────────────────────────────────────────
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
  -- Digits only, 4 to 8. A 2-digit PIN is 100 guesses and would make the
  -- lockout the only thing standing between colleagues.
  if new_pin !~ '^[0-9]{4,8}$' then
    raise exception 'A kiosk PIN must be 4 to 8 digits' using errcode = 'check_violation';
  end if;

  insert into public.employee_pins (employee_id, org_id, pin_hash, failed_attempts, locked_until, updated_at)
  values (emp, target_org, extensions.crypt(new_pin, extensions.gen_salt('bf')), 0, null, now())
  on conflict (employee_id) do update
    set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null, updated_at = now();

  update public.employees set has_pin = true where id = emp;
end;
$$;

create or replace function public.clear_kiosk_pin(emp uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare target_org uuid;
begin
  select org_id into target_org from public.employees where id = emp;
  if target_org is null or not public.is_manager(target_org) then
    raise exception 'Only a manager can clear a kiosk PIN' using errcode = 'check_violation';
  end if;
  delete from public.employee_pins where employee_id = emp;
  update public.employees set has_pin = false where id = emp;
end;
$$;


-- ── 5. Checking a PIN — any member of that restaurant ───────────────────────
-- Returns whether it matched, and how long the account is locked for. Both are
-- needed by the kiosk: "wrong PIN" and "locked for 47 seconds" are different
-- messages, and showing the first when the second is true makes people jab at
-- the keypad believing they mistyped.
create or replace function public.verify_kiosk_pin(emp uuid, attempt text)
returns table (ok boolean, locked_seconds int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec public.employee_pins%rowtype;
  matched boolean;
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

  matched := (extensions.crypt(attempt, rec.pin_hash) = rec.pin_hash);

  if matched then
    update public.employee_pins
      set failed_attempts = 0, locked_until = null
      where employee_id = emp;
    return query select true, 0;
  else
    update public.employee_pins
      set failed_attempts = rec.failed_attempts + 1,
          -- 5 wrong tries buys a minute. Enough to make 10,000 guesses take
          -- over a day, without punishing somebody who fat-fingered it twice.
          locked_until = case when rec.failed_attempts + 1 >= 5 then now() + interval '60 seconds' else null end
      where employee_id = emp;
    return query select false,
      case when rec.failed_attempts + 1 >= 5 then 60 else 0 end;
  end if;
end;
$$;

revoke execute on function public.set_kiosk_pin(uuid, text)   from public;
revoke execute on function public.clear_kiosk_pin(uuid)       from public;
revoke execute on function public.verify_kiosk_pin(uuid,text) from public;
grant  execute on function public.set_kiosk_pin(uuid, text)   to authenticated;
grant  execute on function public.clear_kiosk_pin(uuid)       to authenticated;
grant  execute on function public.verify_kiosk_pin(uuid,text) to authenticated;


-- ── 6. Verify (read-only; run after the above) ──────────────────────────────

-- 1. Every PIN that existed has been hashed. Expect the two counts to match.
select (select count(*) from public.employees where pin is not null and length(trim(pin)) > 0) as plaintext_pins_before,
       (select count(*) from public.employee_pins) as hashed_pins_now,
       (select count(*) from public.employees where has_pin) as flagged_has_pin;

-- 2. Nothing hashed is a plaintext PIN. Expect every row to start with `$2`.
select employee_id, left(pin_hash, 4) as algo_prefix, length(pin_hash) as len
from public.employee_pins;

-- 3. The hash table is unreachable. Expect ZERO rows for authenticated.
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'employee_pins' and grantee in ('authenticated','anon');
