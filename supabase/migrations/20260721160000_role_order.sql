-- ============================================================================
-- Rorota — persist manual role ordering
-- ============================================================================
-- Run this once in the Supabase SQL editor for your project (or via
-- `supabase db push`).
--
-- roleStyles (colors) is still local-only, ephemeral browser state — a
-- pre-existing gap, not something this migration fixes. This column only
-- persists the *order* roles should display/group in, since that's the
-- specific thing that needs to be shared across the manager's own reloads
-- AND with employee sessions (so "group by role" sorts the same way
-- everywhere). Array of role-name strings, e.g. ["Waiter","Bartender","Other"].
-- Missing/unlisted roles are appended at the end client-side, so this never
-- needs a migration when a new role is added.
-- ============================================================================

alter table organizations add column if not exists role_order jsonb not null default '[]'::jsonb;

-- The existing SELECT policy on organizations already lets any org member
-- read this new column (it's just one more column on a row they could
-- already see). There was no UPDATE policy yet, though — nothing in the app
-- wrote to `organizations` before this feature — so add one, scoped to org
-- membership only (same all-or-nothing trust model as shift_swaps/
-- notifications/schedule_templates: any signed-in member can write shared
-- org-level config, not just owners/managers).
drop policy if exists "org members can update organizations" on organizations;
create policy "org members can update organizations" on organizations
  for update using (id in (select org_id from memberships where user_id = auth.uid()));
