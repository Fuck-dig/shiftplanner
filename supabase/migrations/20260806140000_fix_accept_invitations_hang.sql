-- ============================================================================
-- Rorota — URGENT: accept_my_invitations() could hang and block app boot
-- ============================================================================
-- Run the whole file in the Supabase SQL editor. Safe to re-run.
--
-- WHAT BROKE (production outage, 6 Aug 2026)
--
-- rorota.net sat on the loading splash forever. Network showed:
--
--   POST /rest/v1/rpc/accept_my_invitations   pending
--   POST /rest/v1/rpc/accept_my_invitations   pending      <- twice
--   GET  /rest/v1/memberships?...             pending
--
-- Still pending after 35s. The memberships query that decides which
-- restaurants to show was queued behind it, so listOrgs never resolved and the
-- app never left LoadingScreen.
--
-- WHY. App.jsx fires acceptPendingInvitations() from BOTH getSession() and
-- onAuthStateChange() — two concurrent calls, two separate transactions, each
-- doing `insert into memberships ... on conflict do nothing` for the SAME
-- (org_id, user_id) and then `update invitations`. They contend on the same
-- rows and the pair stalls.
--
-- This is my bug, introduced by 20260804180000. The original client version
-- had the same double-call, but each call was a plain REST write that failed
-- fast rather than a transaction holding locks across two tables.
--
-- THREE GUARDS, because any one of them alone still leaves a way to hang:
--
--   1. statement_timeout — nothing here may run longer than 5s. A boot path
--      must fail rather than hang; an unaccepted invitation is a small problem,
--      an app that never loads is a total one.
--   2. advisory lock — a second concurrent call from the same user returns
--      immediately instead of queueing behind the first.
--   3. `for update skip locked` — never wait on an invitation row another
--      transaction holds, including a stuck one from before this fix.
--
-- Also: returns 0 instead of raising when unauthenticated. The client alerts on
-- rejection, and an alert() during boot is its own kind of broken.
-- ============================================================================

create or replace function public.accept_my_invitations()
returns integer
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  accepted     integer := 0;
  caller       uuid    := auth.uid();
  caller_email text    := lower(coalesce(auth.email(), ''));
begin
  if caller is null or caller_email = '' then
    return 0;
  end if;

  -- Guard 2. Transaction-scoped, so it releases on commit or rollback with no
  -- cleanup path to forget. If another call from this same user is mid-flight,
  -- do nothing rather than pile up behind it — it is doing the same work.
  if not pg_try_advisory_xact_lock(hashtext('rorota:accept_inv:' || caller::text)) then
    return 0;
  end if;

  -- Guard 3. skip locked means a row another transaction is holding is simply
  -- not ours to process this time round; the next call picks it up.
  with mine as (
    select i.id, i.org_id, i.role
    from public.invitations i
    where lower(i.email) = caller_email
      and i.used_at is null
    for update skip locked
  ), ins as (
    -- The role still comes from the INVITATION ROW, never from the caller —
    -- that is the whole point of 20260804180000 and it is preserved here.
    insert into public.memberships (org_id, user_id, role)
    select m.org_id, caller, m.role from mine m
    on conflict (org_id, user_id) do nothing
    returning 1
  )
  update public.invitations
     set used_at = now()
   where id in (select id from mine);

  get diagnostics accepted = row_count;
  return accepted;
end;
$$;

revoke all on function public.accept_my_invitations() from public;
grant execute on function public.accept_my_invitations() to authenticated;


-- ── Clear anything already stuck from before this fix ───────────────────────
-- Read-only look first: any long-running call still holding locks. If this
-- returns rows, they are the outage still in progress.
select pid, state, now() - query_start as running_for, left(query, 80) as query
from pg_stat_activity
where query ilike '%accept_my_invitations%'
  and pid <> pg_backend_pid()
  and state <> 'idle';

-- If the query above returned anything, cancel them:
--   select pg_cancel_backend(pid) from pg_stat_activity
--   where query ilike '%accept_my_invitations%' and pid <> pg_backend_pid() and state <> 'idle';


-- ── Verify ──────────────────────────────────────────────────────────────────
-- Expect one row: security definer, and a 5s statement_timeout pinned on it.
select p.proname,
       p.prosecdef as security_definer,
       coalesce(array_to_string(p.proconfig, ', '), '(no config)') as settings
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'accept_my_invitations';
