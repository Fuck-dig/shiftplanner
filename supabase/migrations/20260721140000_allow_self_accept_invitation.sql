-- ============================================================================
-- Fixes: "new row violates row-level security policy for table
-- "memberships"" when a brand-new invited user tries to accept their own
-- invitation. The existing insert policy (used when an owner/manager adds
-- someone via TeamAccess) checks that the ACTING user already belongs to
-- the org — correct for that case, but impossible for someone accepting
-- their very first invite, since they have zero memberships yet.
--
-- This adds a second, narrower INSERT policy specifically for self-service
-- acceptance: a user may insert a membership row for THEMSELVES (user_id =
-- auth.uid()) only if there's a matching, not-yet-used invitation for that
-- org and their own login email. Postgres OR's multiple permissive
-- policies for the same command together, so this doesn't touch or loosen
-- the existing owner/manager-driven policy at all — it just adds this one
-- specific additional way to pass.
-- ============================================================================

create policy "users can accept their own pending invitation" on memberships
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from invitations i
      join auth.users u on u.id = auth.uid()
      where i.org_id = memberships.org_id
        and i.email = lower(u.email)
        and i.used_at is null
    )
  );
