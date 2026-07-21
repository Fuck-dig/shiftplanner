-- ============================================================================
-- REVIEW ONLY — no deletes here. Run this first in the Supabase SQL editor
-- and read the output before touching 02_delete_other_accounts.sql.
-- ============================================================================

-- Every account other than williamaarfing@gmail.com, and which
-- organization(s) they belong to. Check this list for anyone you actually
-- want to keep (a real invited employee, not a throwaway test account)
-- before running the delete script.
select
  u.id          as user_id,
  u.email,
  u.created_at  as account_created,
  m.role,
  o.name        as org_name,
  o.id          as org_id
from auth.users u
left join memberships m   on m.user_id = u.id
left join organizations o on o.id = m.org_id
where u.email is distinct from 'williamaarfing@gmail.com'
order by u.email, o.name;

-- Organizations that would be deleted ENTIRELY (williamaarfing@gmail.com is
-- not a member at all), with how many members/rows each currently has.
select
  o.id,
  o.name,
  count(distinct m.user_id)  as member_count,
  count(distinct e.id)       as employee_count,
  count(distinct b.id)       as block_count
from organizations o
left join memberships m on m.org_id = o.id
left join employees  e on e.org_id = o.id
left join blocks     b on b.org_id = o.id
where o.id not in (
  select m2.org_id from memberships m2
  join auth.users u2 on u2.id = m2.user_id
  where u2.email = 'williamaarfing@gmail.com'
)
group by o.id, o.name
order by o.name;

-- Organizations that would be KEPT (williamaarfing@gmail.com is a member),
-- and any OTHER members on them that would be removed from those orgs
-- (the org's own data — employees roster, schedules, blocks — is untouched;
-- only these other people's access to it goes away).
select
  o.name  as org_name,
  u.email as other_member_email,
  m.role
from memberships m
join organizations o on o.id = m.org_id
join auth.users u    on u.id = m.user_id
where m.org_id in (
  select m2.org_id from memberships m2
  join auth.users u2 on u2.id = m2.user_id
  where u2.email = 'williamaarfing@gmail.com'
)
and u.email is distinct from 'williamaarfing@gmail.com'
order by o.name, u.email;
