-- ============================================================================
-- DESTRUCTIVE. Run 04_review_duplicate_almus.sql first and confirm there
-- are exactly two "Almus" orgs, one with williamaarfing@gmail.com as a
-- member (keep) and one without (the duplicate to delete).
--
-- This targets ONLY an org named 'Almus' that williamaarfing@gmail.com is
-- NOT a member of — it will not touch the real one.
-- ============================================================================

begin;

create temporary table dup_almus as
select o.id as org_id
from organizations o
where o.name = 'Almus'
  and o.id not in (
    select m.org_id from memberships m
    join auth.users u on u.id = m.user_id
    where u.email = 'williamaarfing@gmail.com'
  );

-- Safety check: refuse to run if this doesn't isolate exactly one org.
do $$
declare cnt int;
begin
  select count(*) into cnt from dup_almus;
  if cnt <> 1 then
    raise exception 'Expected exactly 1 duplicate Almus org, found %. Aborting — check 04_review_duplicate_almus.sql output.', cnt;
  end if;
end $$;

do $$
begin
  if to_regclass('public.shift_swaps') is not null then
    delete from shift_swaps where org_id in (select org_id from dup_almus);
  end if;
  if to_regclass('public.notifications') is not null then
    delete from notifications where org_id in (select org_id from dup_almus);
  end if;
  if to_regclass('public.schedule_templates') is not null then
    delete from schedule_templates where org_id in (select org_id from dup_almus);
  end if;
end $$;

delete from time_off      where org_id in (select org_id from dup_almus);
delete from schedules     where org_id in (select org_id from dup_almus);
delete from blocks        where org_id in (select org_id from dup_almus);
delete from employees     where org_id in (select org_id from dup_almus);
delete from invitations   where org_id in (select org_id from dup_almus);
delete from memberships   where org_id in (select org_id from dup_almus);
delete from organizations where id     in (select org_id from dup_almus);

commit;
