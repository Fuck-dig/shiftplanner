-- ============================================================================
-- Rorota — stop "any org member" meaning "any org member can do anything"
-- ============================================================================
-- Run the WHOLE file in the Supabase SQL editor. Safe to re-run: every policy
-- is dropped by its own name first, and functions are `create or replace`.
--
-- THE PROBLEM
--
-- The original schema gave four tables a single blanket policy each:
--
--   create policy "members manage employees" on employees
--     for all using (is_member(org_id)) with check (is_member(org_id));
--
-- `for all` is select + insert + update + delete. So any employee, using the
-- anon key that ships in the JS bundle, could hit the REST API directly and:
--
--   * approve their own time off      — `status` is just a column
--   * delete every schedule in the org
--   * rewrite anyone's roles, max_hours, priority, or PIN
--   * delete colleagues from the roster
--
-- The manager-only UI is the only thing that ever stopped them, and a UI is
-- not an access control. This is not a hole someone left open by accident —
-- it was a documented convention that was reasonable when this app only held
-- schedules. It stopped being reasonable once it also held wages, documents
-- and real rosters.
--
-- WHAT STAFF ACTUALLY NEED (checked against every write in lib/data.js, not
-- assumed — this is the list that decides what stays open):
--
--   time_off   INSERT  their own request, always Pending
--              DELETE  their own request, only while still Pending
--   employees  UPDATE  their own row, and only six presentation columns
--   blocks     nothing
--   schedules  nothing  (the kiosk writes here, but kiosk mode only ever
--                        activates for a manager/owner login — see App.jsx)
--
-- Everything else on these four tables becomes manager-only. Reads stay open
-- to the whole org, because seeing who is on shift is the entire point.
--
-- OUT OF SCOPE, deliberately, and still org-membership-only: shift_swaps,
-- notifications, messages, message_replies, schedule_templates,
-- push_subscriptions, daily_revenue. Staff genuinely write to most of those
-- (claiming shifts, marking notifications read), so each needs the same
-- per-operation treatment rather than a blanket lock. daily_revenue is the
-- one worth doing next: staff have no reason to read it at all.
-- ============================================================================


-- ── Helpers ─────────────────────────────────────────────────────────────────
-- Same shape as the existing is_member(): SECURITY DEFINER so the policy can
-- consult memberships without the caller needing to see it, STABLE so Postgres
-- can cache it per statement, and an empty search_path so nobody can shadow
-- `memberships` with their own table and lie to it.
create or replace function public.is_manager(target_org uuid)
returns boolean language sql security definer stable set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where org_id = target_org
      and user_id = auth.uid()
      and role in ('owner','manager')
  );
$$;

-- Which employee row belongs to the caller. The app links them by email
-- (EmployeeView matches e.email against the session email), so RLS does the
-- same. SECURITY DEFINER matters here for a second reason: it reads employees,
-- and employees' own policies must NOT call this back, or the two would
-- recurse. They don't — employees uses is_member/is_manager only.
create or replace function public.my_employee_id(target_org uuid)
returns uuid language sql security definer stable set search_path = ''
as $$
  select e.id from public.employees e
  where e.org_id = target_org
    and lower(e.email) = lower(coalesce(auth.email(), ''))
  limit 1;
$$;

grant execute on function public.is_manager(uuid)      to authenticated;
grant execute on function public.my_employee_id(uuid)  to authenticated;


-- ── Self-service profile edits ──────────────────────────────────────────────
-- Staff can no longer UPDATE the employees table directly, because RLS filters
-- ROWS, not COLUMNS: a row-level "you may edit your own row" policy would also
-- let someone raise their own max_hours, grant themselves the Manager role, or
-- change their kiosk PIN. Column-level GRANTs can't help either, since managers
-- and staff share the same `authenticated` database role.
--
-- So the six columns a person may genuinely change about themselves are
-- whitelisted here instead. NULL means "leave this one alone", which matches
-- what the old client did (`if (phone != null) row.phone = phone`).
create or replace function public.update_my_profile(
  p_org                 uuid,
  p_name                text    default null,
  p_pal_idx             integer default null,
  p_phone               text    default null,
  p_availability        jsonb   default null,
  p_email_notifications boolean default null,
  p_push_prefs          jsonb   default null
) returns void language plpgsql security definer set search_path = ''
as $$
declare
  eid uuid;
begin
  eid := public.my_employee_id(p_org);
  if eid is null then
    raise exception 'no employee record for this login in that organisation';
  end if;

  update public.employees set
    name                = coalesce(p_name, name),
    pal_idx             = coalesce(p_pal_idx, pal_idx),
    phone               = coalesce(p_phone, phone),
    availability        = coalesce(p_availability, availability),
    email_notifications = coalesce(p_email_notifications, email_notifications),
    push_prefs          = coalesce(p_push_prefs, push_prefs)
  where id = eid;
end;
$$;

revoke all on function public.update_my_profile(uuid,text,integer,text,jsonb,boolean,jsonb) from public;
grant execute on function public.update_my_profile(uuid,text,integer,text,jsonb,boolean,jsonb) to authenticated;


-- ── employees ───────────────────────────────────────────────────────────────
drop policy if exists "members manage employees" on public.employees;
drop policy if exists "org members read employees"   on public.employees;
drop policy if exists "managers insert employees"    on public.employees;
drop policy if exists "managers update employees"    on public.employees;
drop policy if exists "managers delete employees"    on public.employees;

-- Everyone in the org reads the roster: you cannot render a rota without it.
create policy "org members read employees" on public.employees
  for select using (public.is_member(org_id));
create policy "managers insert employees" on public.employees
  for insert with check (public.is_manager(org_id));
create policy "managers update employees" on public.employees
  for update using (public.is_manager(org_id)) with check (public.is_manager(org_id));
create policy "managers delete employees" on public.employees
  for delete using (public.is_manager(org_id));


-- ── blocks ──────────────────────────────────────────────────────────────────
-- Staff never write shift blocks; they only need to read them to see times.
drop policy if exists "members manage blocks"      on public.blocks;
drop policy if exists "org members read blocks"    on public.blocks;
drop policy if exists "managers write blocks"      on public.blocks;

create policy "org members read blocks" on public.blocks
  for select using (public.is_member(org_id));
create policy "managers write blocks" on public.blocks
  for all using (public.is_manager(org_id)) with check (public.is_manager(org_id));


-- ── schedules ───────────────────────────────────────────────────────────────
-- Read-only for staff. The one non-manager-looking writer is the kiosk's
-- clock-in, and kiosk mode only ever activates for a manager/owner login
-- (App.jsx makes that the access gate), so it is covered by is_manager.
drop policy if exists "members manage schedules"    on public.schedules;
drop policy if exists "org members read schedules"  on public.schedules;
drop policy if exists "managers write schedules"    on public.schedules;

create policy "org members read schedules" on public.schedules
  for select using (public.is_member(org_id));
create policy "managers write schedules" on public.schedules
  for all using (public.is_manager(org_id)) with check (public.is_manager(org_id));


-- ── time_off ────────────────────────────────────────────────────────────────
-- The interesting one. A request is a claim about YOU, so you may create and
-- withdraw your own — but the DECISION belongs to a manager, and `status` was
-- previously just a column any member could set to 'Approved'.
drop policy if exists "members manage time_off"          on public.time_off;
drop policy if exists "org members read time_off"        on public.time_off;
drop policy if exists "request own time off"             on public.time_off;
drop policy if exists "managers decide time off"         on public.time_off;
drop policy if exists "withdraw own pending time off"    on public.time_off;

create policy "org members read time_off" on public.time_off
  for select using (public.is_member(org_id));

-- `status = 'Pending'` is enforced by the DATABASE now, not by the client
-- politely sending it. This is what stops someone approving their own leave.
create policy "request own time off" on public.time_off
  for insert with check (
    public.is_manager(org_id)
    or (employee_id = public.my_employee_id(org_id) and status = 'Pending')
  );

create policy "managers decide time off" on public.time_off
  for update using (public.is_manager(org_id)) with check (public.is_manager(org_id));

-- You may withdraw a request only while it is still undecided. Once a manager
-- has approved or rejected it, that decision stands — matching what the UI
-- already claimed but never enforced.
create policy "withdraw own pending time off" on public.time_off
  for delete using (
    public.is_manager(org_id)
    or (employee_id = public.my_employee_id(org_id) and status = 'Pending')
  );


-- ── organizations ───────────────────────────────────────────────────────────
-- Was "members update orgs": any employee could rename the restaurant or
-- rewrite its settings JSON (currency and so on).
drop policy if exists "members update orgs"  on public.organizations;
drop policy if exists "managers update orgs" on public.organizations;
create policy "managers update orgs" on public.organizations
  for update using (public.is_manager(id)) with check (public.is_manager(id));


-- ── Verify (read-only) ──────────────────────────────────────────────────────
-- Expect: no `for all` policy left on employees/time_off, and every write
-- policy mentioning is_manager. `cmd = 'ALL'` on blocks/schedules is fine —
-- those are the manager-only ones.
select tablename, cmd, policyname,
       case
         when cmd = 'SELECT' then 'read — open to org, expected'
         when coalesce(qual,'') || coalesce(with_check,'') like '%is_manager%' then 'manager-gated'
         when coalesce(qual,'') || coalesce(with_check,'') like '%my_employee_id%' then 'self-service, scoped'
         else 'CHECK THIS ONE'
       end as verdict
from pg_policies
where schemaname = 'public'
  and tablename in ('employees','blocks','schedules','time_off','organizations')
order by tablename, cmd;
