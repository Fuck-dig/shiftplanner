-- REVIEW ONLY — no deletes. Confirms which "Almus" is the real one (has
-- williamaarfing@gmail.com as a member) and which is the accidental
-- duplicate rorotatest@gmail.com likely self-created while the invite flow
-- was broken.
select
  o.id as org_id,
  o.name,
  o.created_at,
  m.role,
  u.email as member_email
from organizations o
join memberships m on m.org_id = o.id
join auth.users u  on u.id = m.user_id
where o.name = 'Almus'
order by o.created_at, u.email;
