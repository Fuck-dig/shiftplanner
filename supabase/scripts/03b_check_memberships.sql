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
