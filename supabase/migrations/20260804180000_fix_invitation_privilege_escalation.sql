-- ============================================================================
-- Rorota — CRITICAL: close the invitation privilege-escalation hole
-- ============================================================================
-- Run this whole file in the Supabase SQL editor. Run it SOON — until it is
-- applied, any person with a Rorota login can take over any restaurant on the
-- instance.
--
-- THE HOLE (confirmed against production on 4 Aug 2026 by reading pg_policies,
-- not by exploiting it):
--
--   invitations SELECT  "Authenticated users can read invitations"
--                       using (true)              <- no restriction at all
--   invitations UPDATE  "Authenticated users can mark invitations used"
--                       using (true), no with_check
--
-- In Postgres an UPDATE policy with no `with_check` reuses its USING expression
-- for the check, so that second policy is `true` on both sides: any logged-in
-- user could rewrite ANY row of invitations.
--
-- Chain:
--   1. Sign up for Rorota (any org, or a brand-new account).
--   2. select * from invitations  -> every invitation in EVERY restaurant.
--   3. update that row: email -> mine, role -> 'owner', used_at -> null.
--   4. Reload. acceptPendingInvitations() finds "my" pending invite and
--      inserts a membership with role 'owner'.
--   5. Full control of someone else's restaurant: wages, documents, staff.
--
-- Spent invitations are just as good as fresh ones, because step 3 resets
-- used_at. Any org that has ever sent one invite was reachable.
--
-- THE FIX, in three parts, because one of them alone is not enough:
--
--   1. Stop the client writing to invitations at all. Marking one used is now
--      done inside a SECURITY DEFINER function, not by the browser.
--   2. Stop the client reading other people's invitations. You see your own;
--      managers see their own org's.
--   3. Take the role from the INVITATION ROW rather than from anything the
--      caller sends. This is the part that actually matters: even if a future
--      policy mistake re-opens a write path, the role can no longer be chosen
--      by the person being invited.
--
-- Safe to re-run: every policy is dropped BY ITS OWN NAME before being
-- recreated, and the function is `create or replace`. (The first version of
-- this file was not — see the note by the memberships policy below.)
-- ============================================================================


-- ── 1. Accepting an invitation moves server-side ────────────────────────────
-- SECURITY DEFINER so it can write memberships and invitations without the
-- caller needing (or having) policies that allow it. The role is read out of
-- the invitation row inside this function, so it is not something the caller
-- can influence.
--
-- `set search_path = ''` and fully-qualified names throughout: without that, a
-- caller who can create objects could shadow `memberships` with their own
-- table and have this definer-owned function write there instead.
create or replace function public.accept_my_invitations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  accepted integer := 0;
  inv      record;
  caller   uuid   := auth.uid();
  caller_email text := lower(coalesce(auth.email(), ''));
begin
  if caller is null or caller_email = '' then
    raise exception 'not authenticated';
  end if;

  for inv in
    select i.id, i.org_id, i.role
    from public.invitations i
    where lower(i.email) = caller_email
      and i.used_at is null
  loop
    -- The role comes from inv.role — the value a MANAGER wrote when creating
    -- the invitation. Nothing the caller sends is consulted.
    insert into public.memberships (org_id, user_id, role)
    values (inv.org_id, caller, inv.role)
    on conflict (org_id, user_id) do nothing;

    -- Only mark it used once the membership is safely in place, so a failure
    -- here doesn't silently burn the invitation.
    update public.invitations set used_at = now() where id = inv.id;

    accepted := accepted + 1;
  end loop;

  return accepted;
end;
$$;

revoke all on function public.accept_my_invitations() from public;
grant execute on function public.accept_my_invitations() to authenticated;


-- ── 2. invitations: you can only see your own; managers see their org's ─────
drop policy if exists "Authenticated users can read invitations" on public.invitations;
drop policy if exists "read own or managed invitations" on public.invitations;
create policy "read own or managed invitations" on public.invitations
  for select using (
    lower(email) = lower(coalesce(auth.email(), ''))
    or org_id in (
      select org_id from public.memberships
      where user_id = auth.uid() and role in ('owner','manager')
    )
  );


-- ── 3. invitations: nobody writes from the client ───────────────────────────
-- This is the policy the whole attack hinged on. There is deliberately no
-- replacement UPDATE policy — marking an invitation used is the definer
-- function's job now. Managers keep their existing insert/delete policies.
drop policy if exists "Authenticated users can mark invitations used" on public.invitations;


-- ── 4. memberships: defence in depth ────────────────────────────────────────
-- The self-accept INSERT policy checked that an unused invitation existed but
-- never constrained the `role` being inserted. The definer function above no
-- longer needs this policy at all, so the safest thing is to drop it — but if
-- it is recreated later for any reason, it must compare against the invitation.
drop policy if exists "users can accept their own pending invitation" on public.memberships;
-- Drop the NEW name too. I originally dropped only the OLD one and then created
-- a new name, which made this file blow up with 42710 on a second run — the
-- exact "Postgres has no create policy if not exists" trap this project has hit
-- before. Every create policy here is now preceded by a drop of its own name.
drop policy if exists "accept own invitation at the invited role" on public.memberships;
create policy "accept own invitation at the invited role" on public.memberships
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.invitations i
      where i.org_id = memberships.org_id
        and lower(i.email) = lower(coalesce(auth.email(), ''))
        and i.used_at is null
        and i.role = memberships.role   -- <- the check that was missing
    )
  );


-- ── 5. Verify (read-only; run after the above) ──────────────────────────────
-- Expect: no policy on invitations with qual = 'true', and no UPDATE policy on
-- invitations at all.
select tablename, cmd, policyname,
       coalesce(qual,'-')       as using_expr,
       coalesce(with_check,'-') as check_expr,
       case when coalesce(qual,'') = 'true' then 'STILL WIDE OPEN' else 'ok' end as verdict
from pg_policies
where schemaname = 'public' and tablename in ('invitations','memberships')
order by tablename, cmd;
