-- ============================================================================
-- REVIEW ONLY — no deletes. Run this and share the output.
-- Shows exactly what's stored for rorotatest@gmail.com: which org(s) it has
-- a membership in (and what role), and its full invitation history.
-- ============================================================================

-- The account itself.
select id as user_id, email, created_at
from auth.users
where email = 'rorotatest@gmail.com';

-- Every membership this account actually has, with role and org name.
select
  m.org_id,
  o.name as org_name,
  m.role,
  m.created_at as membership_created
from memberships m
join auth.users u    on u.id = m.user_id
join organizations o on o.id = m.org_id
where u.email = 'rorotatest@gmail.com'
order by o.name;

-- Every invitation ever created for this email, used or not, across every org.
select
  i.id,
  o.name as org_name,
  i.role,
  i.created_at,
  i.used_at
from invitations i
join organizations o on o.id = i.org_id
where i.email = 'rorotatest@gmail.com'
order by i.created_at desc;
