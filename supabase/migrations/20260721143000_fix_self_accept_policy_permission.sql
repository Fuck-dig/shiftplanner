-- ============================================================================
-- Fixes: "permission denied for table users" — the previous policy
-- (20260721140000_allow_self_accept_invitation.sql) queried auth.users
-- directly to get the current user's email, but regular authenticated
-- users aren't granted SELECT on that table. Supabase provides auth.email()
-- specifically so RLS policies can get the current session's email without
-- needing table access — swapping to that instead.
-- ============================================================================

drop policy if exists "users can accept their own pending invitation" on memberships;

create policy "users can accept their own pending invitation" on memberships
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from invitations i
      where i.org_id = memberships.org_id
        and i.email = lower(auth.email())
        and i.used_at is null
    )
  );
