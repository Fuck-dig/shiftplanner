import { supabase } from './supabase';

// All organizations (restaurants) the current user belongs to, oldest first.
// Two plain queries (no relational embed) so it's robust to schema-cache state.
export async function listOrgs(){
  const { data: ms, error } = await supabase
    .from('memberships')
    .select('org_id, role, created_at')
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

// Look up a user by email (returns their user_id or null)
// Uses a server-side RPC since we can't query auth.users from the client directly
export async function findUserByEmail(email){
  const { data, error } = await supabase
    .rpc('find_user_by_email', { lookup_email: email });
  if (error) throw error;
  return data; // user_id or null
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const { data: invites, error: fetchErr } = await supabase
    .from('invitations')
    .select('id, org_id, role')
    .eq('email', user.email)
    .is('used_at', null);
  if (fetchErr) throw fetchErr;

  if (!invites || invites.length === 0) return 0;

  let accepted = 0;
  const errors = [];
  for (const invite of invites) {
    // Add to memberships. If this fails, do NOT mark the invite as used —
    // otherwise a failed write silently loses the invitation forever.
    const { error: memErr } = await supabase.from('memberships').upsert(
      { org_id: invite.org_id, user_id: user.id, role: invite.role },
      { onConflict: 'org_id,user_id' }
    );
    if (memErr) { errors.push(memErr); continue; }
    // Mark invite as used
    const { error: usedErr } = await supabase.from('invitations')
      .update({ used_at: new Date().toISOString() })
      .eq('id', invite.id);
    if (usedErr) { errors.push(usedErr); continue; }
    accepted++;
  }
  if (errors.length) throw new Error(`Failed to accept ${errors.length} invitation(s): ${errors[0].message}`);
  return accepted;
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
