-- ============================================================================
-- DESTRUCTIVE AND IRREVERSIBLE. Do not run this until you've run
-- 01_review_accounts_to_delete.sql and are sure about every account and
-- organization it listed. There is no undo once this transaction commits.
--
-- What this does:
--   - Keeps every organization where williamaarfing@gmail.com is a member
--     (owner/manager/employee), fully intact — schedule, roster, blocks,
--     everything, untouched.
--   - Deletes every OTHER organization entirely, and all of its data
--     (schedules, employees, blocks, time off, swaps, notifications,
--     templates, invitations, memberships).
--   - Inside the org(s) you keep, removes any OTHER member's access (in
--     case a test account was added to your real org) without touching
--     that org's actual data.
--   - Clears stale test invitations inside the kept org(s) too.
--   - Deletes every auth account except williamaarfing@gmail.com. Supabase's
--     auth schema cascades from identities/sessions/refresh_tokens/etc. back
--     to auth.users, so this cleans those up as part of the same delete.
--
-- Run the whole thing at once (it's one transaction) — if anything errors,
-- the ROLLBACK at the bottom of a failed run means nothing gets committed.
-- ============================================================================

begin;

create temporary table keep_orgs as
select distinct m.org_id
from memberships m
join auth.users u on u.id = m.user_id
where u.email = 'williamaarfing@gmail.com';

create temporary table drop_orgs as
select id as org_id from organizations
where id not in (select org_id from keep_orgs);

-- 1. Child data for organizations being fully deleted, in dependency order
--    (children before the tables/rows they reference). shift_swaps,
--    notifications, and schedule_templates only exist if that migration
--    (20260721120000_swaps_notifications_templates.sql) has actually been
--    run on this project — guard each with to_regclass so this script still
--    works whether or not it has been.
do $$
begin
  if to_regclass('public.shift_swaps') is not null then
    delete from shift_swaps where org_id in (select org_id from drop_orgs);
  end if;
  if to_regclass('public.notifications') is not null then
    delete from notifications where org_id in (select org_id from drop_orgs);
  end if;
  if to_regclass('public.schedule_templates') is not null then
    delete from schedule_templates where org_id in (select org_id from drop_orgs);
  end if;
end $$;

delete from time_off           where org_id in (select org_id from drop_orgs);
delete from schedules          where org_id in (select org_id from drop_orgs);
delete from blocks             where org_id in (select org_id from drop_orgs);
delete from employees          where org_id in (select org_id from drop_orgs);
delete from invitations        where org_id in (select org_id from drop_orgs);
delete from memberships        where org_id in (select org_id from drop_orgs);
delete from organizations      where id     in (select org_id from drop_orgs);

-- 2. Inside the org(s) you keep, drop any OTHER member's membership only —
--    the org's own data (roster, schedules, blocks) is left completely alone.
delete from memberships
where org_id in (select org_id from keep_orgs)
  and user_id not in (select id from auth.users where email = 'williamaarfing@gmail.com');

-- 3. Stale test invitations inside the kept org(s).
delete from invitations
where org_id in (select org_id from keep_orgs)
  and email is distinct from 'williamaarfing@gmail.com';

-- 4. Every other auth account, last.
delete from auth.users where email is distinct from 'williamaarfing@gmail.com';

commit;
