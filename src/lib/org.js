import { supabase } from './supabase';

// All organizations (restaurants) the current user belongs to, oldest first.
// Two plain queries (no relational embed) so it's robust to schema-cache state.
export async function listOrgs(){
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Must filter to this user's own membership rows explicitly — RLS on
  // `memberships` intentionally allows seeing OTHER members' rows too (e.g.
  // so TeamAccess's member list works), so without this filter here, this
  // query returns one row per member of every shared org, not one per org
  // for you. That previously showed a duplicate "restaurant card" for any
  // org with more than one member, and worse — if two rows shared the same
  // org_id, App()'s `orgs.find(o => o.id === activeOrg)` could silently
  // pick up a DIFFERENT member's role (e.g. an owner's) instead of your own.
  const { data: ms, error } = await supabase
    .from('memberships')
    .select('org_id, role, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });
  if (error) throw error;
  if (!ms || ms.length === 0) return [];

  const ids = ms.map(m => m.org_id);
  const { data: orgRows, error: e2 } = await supabase
    .from('organizations')
    .select('id, name')
    .in('id', ids);
  if (e2) throw e2;

  const byId = Object.fromEntries((orgRows || []).map(o => [o.id, o]));
  return ms
    .filter(m => byId[m.org_id])
    .map(m => ({ id: m.org_id, name: byId[m.org_id].name, role: m.role }));
}

// Create a restaurant + owner membership atomically (server-side RPC). Returns new org id.
export async function createOrg(name){
  const { data, error } = await supabase.rpc('create_organization', { org_name: name });
  if (error) throw error;
  return data;
}
// List all members of an org (manager-only use).
// Uses a server-side RPC since we can't join auth.users from the client directly.
export async function listMembers(orgId){
  const { data, error } = await supabase
    .rpc('list_org_members', { target_org: orgId });
  if (error) throw error;
  return data || [];
}

// Add a user to an org by their auth user_id
export async function addMember(orgId, userId, role='employee'){
  const { error } = await supabase
    .from('memberships')
    .upsert({ org_id: orgId, user_id: userId, role }, { onConflict: 'org_id,user_id' });
  if (error) throw error;
}

// Remove a member from an org
export async function removeMember(orgId, userId){
  const { error } = await supabase
    .from('memberships')
    .delete()
    .eq('org_id', orgId)
    .eq('user_id', userId);
  if (error) throw error;
}


// ─── Invitations ──────────────────────────────────────────────────────────────

// Create an invitation for an email
export async function createInvitation(orgId, email, role='employee'){
  const { data, error } = await supabase
    .from('invitations')
    .insert({ org_id: orgId, email: email.toLowerCase().trim(), role })
    .select('id')
    .single();
  if (error) throw error;
  return data.id; // the invite id becomes the link token
}

// Check if logged-in user has any pending invitations and accept them.
// Returns the number of invitations successfully accepted; throws an
// aggregate error (after attempting all invites) if any failed, so a bad
// invite doesn't silently vanish and doesn't block the others either.
export async function acceptPendingInvitations(){
  // Server-side now. This used to read the invitations table, insert a
  // membership with `role: invite.role`, then mark the invite used — three
  // client-side writes, which meant RLS had to allow the browser to write to
  // both tables. It did, far too broadly: any logged-in user could rewrite any
  // invitation row (email, role, used_at) and hand themselves ownership of
  // someone else's restaurant. See
  // 20260804180000_fix_invitation_privilege_escalation.sql.
  //
  // accept_my_invitations() reads the role out of the invitation row inside
  // the database, so it is no longer something a caller can choose.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;
  const { data, error } = await supabase.rpc('accept_my_invitations');
  if (error) throw error;
  return data || 0;
}

// List pending invitations for an org
export async function listInvitations(orgId){
  const { data, error } = await supabase
    .from('invitations')
    .select('id, email, role, created_at, used_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Delete an invitation
export async function deleteInvitation(inviteId){
  const { error } = await supabase
    .from('invitations')
    .delete()
    .eq('id', inviteId);
  if (error) throw error;
}
