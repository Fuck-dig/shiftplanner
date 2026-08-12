-- ============================================================================
-- Rorota — only an OWNER may change the settings that decide what people are paid
-- ============================================================================
-- Run the whole file in the Supabase SQL editor. Safe to re-run.
--
-- WHAT THIS PROTECTS
--
-- `organizations.sick_pay_pct` decides what a sick day costs, and
-- `pay_period_start_day` decides which month a shift is paid in. Both silently
-- change what somebody receives. Everything else on that row — the restaurant's
-- name, its currency, the role colours — is ordinary running-the-rota stuff a
-- manager should keep.
--
-- WHY A TRIGGER AND NOT A POLICY
--
-- RLS filters ROWS, not COLUMNS. There is no way to write "managers may update
-- this row except for these two columns" as a policy. The options were:
--
--   1. Make the whole row owner-only. Rejected: `role_styles` lives here, so
--      managers would lose the ability to change role colours — a real
--      regression to protect two unrelated columns.
--   2. Move the pay columns to their own table with owner-only policies.
--      Correct, but a data migration plus a rewrite of every reader, for the
--      same result.
--   3. Keep the manager UPDATE policy and add a BEFORE UPDATE trigger that
--      rejects a change to these two columns unless the caller is an owner.
--
-- (3) enforces it at the same depth a policy would: this fires on ANY update,
-- including one sent straight to the REST API bypassing the app, which is the
-- only kind of enforcement worth having. `is distinct from` rather than `<>` so
-- a NULL on either side is compared correctly rather than yielding NULL.
--
-- The UI disables these fields for managers, but that is a courtesy. This is
-- the control.
-- ============================================================================


create or replace function public.guard_org_pay_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only interested in the two protected columns. An update that leaves them
  -- alone (a rename, a currency change, new role colours) passes straight
  -- through, so managers keep everything they have today.
  if new.sick_pay_pct is distinct from old.sick_pay_pct
     or new.pay_period_start_day is distinct from old.pay_period_start_day then

    if not exists (
      select 1 from public.memberships
      where org_id = old.id
        and user_id = auth.uid()
        and role = 'owner'
    ) then
      raise exception 'Only the restaurant owner can change pay settings'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_org_pay_settings on public.organizations;
create trigger guard_org_pay_settings
  before update on public.organizations
  for each row execute function public.guard_org_pay_settings();


-- ── Verify (read-only; run after the above) ─────────────────────────────────

-- 1. Trigger present and firing BEFORE UPDATE on organizations.
select tgname as trigger_name,
       case when tgenabled = 'D' then 'DISABLED' else 'enabled' end as state,
       pg_get_triggerdef(oid) as definition
from pg_trigger
where tgrelid = 'public.organizations'::regclass and not tgisinternal;

-- 2. The function must be SECURITY DEFINER with a pinned search_path — it reads
--    memberships, and a caller who could shadow that table would otherwise be
--    able to answer "am I an owner?" themselves.
select p.proname,
       p.prosecdef as security_definer,
       coalesce(array_to_string(p.proconfig, ', '), '(NOT PINNED — fix this)') as settings
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'guard_org_pay_settings';

-- 3. Managers should STILL be able to update the row generally — confirm the
--    existing policy is untouched. Expect "managers update orgs".
select policyname, cmd, coalesce(qual,'-') as using_expr
from pg_policies
where schemaname = 'public' and tablename = 'organizations' and cmd = 'UPDATE';
